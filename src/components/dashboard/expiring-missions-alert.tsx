'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Agent, Mission } from '@/lib/types';
import type { MissionWithDisplayStatus } from '@/lib/missions';
import { checkAgentMissionConflict, getDisplayStatus } from '@/lib/missions';
import {
  type DeadlineUrgency,
  classifyDeadline,
  computeExtendedEndDate,
  getMissionEndDateTime,
  isDeadlineTracked,
} from '@/lib/mission-deadlines';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  Calendar,
  CalendarPlus,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, increment, Timestamp } from 'firebase/firestore';
import { updateDoc, writeBatch } from '@/lib/firestore-fast';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import Link from 'next/link';
import { addDays, startOfDay } from 'date-fns';

export interface ExpiringMissionsAlertProps {
  /** Missions affichées (filtrées par détachement) */
  missions: Mission[];
  /** Toutes les missions, pour vérifier les conflits d'agents lors d'une prolongation */
  allMissions?: Mission[];
  agents: Agent[];
  onViewMissionDetails?: (mission: MissionWithDisplayStatus) => void;
}

export interface ExpiringMissionItem {
  mission: Mission;
  endDateTime: Date;
  diffMs: number;
  urgency: DeadlineUrgency;
  timeLabel: string;
  assignedAgents: Agent[];
}

/** Durée d'affichage de l'annonce avant le repli automatique */
const AUTO_COLLAPSE_MS = 8000;

const TONES = {
  overdue: {
    border: 'border-l-red-500',
    iconBg: 'bg-red-500/10 text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  critical: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  notice: {
    border: 'border-l-sky-500',
    iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-400',
  },
} as const;

const fmtDateTime = (d: Date) =>
  `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

export function ExpiringMissionsAlert({
  missions,
  allMissions,
  agents,
  onViewMissionDetails,
}: ExpiringMissionsAlertProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  // Repli automatique : l'alerte s'annonce dépliée puis se replie seule (pause au survol)
  const [autoCollapseActive, setAutoCollapseActive] = useState<boolean>(true);
  const [autoCollapseKey, setAutoCollapseKey] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const announcedIds = useRef<Set<string>>(new Set());

  const toggleExpanded = () => {
    setAutoCollapseActive(false); // choix de l'utilisateur : plus de repli automatique
    setIsExpanded((prev) => !prev);
  };
  const [filterType, setFilterType] = useState<'all' | 'soon' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dialog de clôture rapide
  const [closingMission, setClosingMission] = useState<Mission | null>(null);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Dialog de prolongation rapide
  const [extendingMission, setExtendingMission] = useState<Mission | null>(null);
  const [extensionDays, setExtensionDays] = useState<number>(1);
  const [isExtending, setIsExtending] = useState<boolean>(false);

  // Mise à jour de l'horloge toutes les 30 secondes pour actualiser le compte à rebours
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, a) => {
      acc[a.id] = a;
      return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);

  // Missions échues (tant qu'elles ne sont pas clôturées) ou expirant dans moins de 48 heures
  const expiringMissions = useMemo((): ExpiringMissionItem[] => {
    if (!missions || missions.length === 0) return [];

    const list: ExpiringMissionItem[] = [];

    for (const mission of missions) {
      // Ni close, ni annulée, ni rejetée, ni en attente de validation
      if (!mission || !isDeadlineTracked(mission)) continue;

      const endDateTime = getMissionEndDateTime(mission);
      if (!endDateTime) continue;

      const deadline = classifyDeadline(endDateTime, currentTime);
      if (!deadline) continue;

      list.push({
        mission,
        endDateTime,
        diffMs: endDateTime.getTime() - currentTime.getTime(),
        urgency: deadline.urgency,
        timeLabel: deadline.label,
        assignedAgents: (mission.assignedAgentIds || []).map((id) => agentsById[id]).filter(Boolean),
      });
    }

    // Tri : missions échues en premier, puis de la plus urgente à la moins urgente
    return list.sort((a, b) => a.diffMs - b.diffMs);
  }, [missions, currentTime, agentsById]);

  // Nouvelle mission à échéance (ou passée en « échue ») : on ré-annonce l'alerte dépliée
  const announceKey = expiringMissions.map((m) => `${m.mission.id}:${m.urgency === 'overdue' ? 'o' : 'u'}`).join('|');
  useEffect(() => {
    const keys = announceKey ? announceKey.split('|') : [];
    const fresh = keys.some((k) => !announcedIds.current.has(k));
    announcedIds.current = new Set(keys);
    if (fresh) {
      setIsExpanded(true);
      setAutoCollapseActive(true);
      setAutoCollapseKey((k) => k + 1);
    }
  }, [announceKey]);

  // Repli après AUTO_COLLAPSE_MS ; le survol met en pause et relance le délai complet
  useEffect(() => {
    if (!isExpanded || !autoCollapseActive || isHovered) return;
    const timer = setTimeout(() => {
      setIsExpanded(false);
      setAutoCollapseActive(false);
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [isExpanded, autoCollapseActive, isHovered, autoCollapseKey]);

  // Filtrage selon onglets / recherche
  const filteredList = useMemo(() => {
    return expiringMissions.filter((item) => {
      if (filterType === 'overdue' && item.urgency !== 'overdue') return false;
      // « Moins de 24h » : échues + moins de 12 h + entre 12 et 24 h
      if (filterType === 'soon' && item.urgency === 'notice') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.mission.name.toLowerCase().includes(q);
        const matchLocation = item.mission.location?.toLowerCase().includes(q);
        const matchAgents = item.assignedAgents.some((a) =>
          a.fullName.toLowerCase().includes(q)
        );
        return matchName || matchLocation || matchAgents;
      }

      return true;
    });
  }, [expiringMissions, filterType, searchQuery]);

  const overdueCount = useMemo(
    () => expiringMissions.filter((m) => m.urgency === 'overdue').length,
    [expiringMissions]
  );
  const criticalCount = useMemo(
    () => expiringMissions.filter((m) => m.urgency === 'critical').length,
    [expiringMissions]
  );
  /** Échues ou expirant dans moins de 24 h */
  const soonCount = useMemo(
    () => expiringMissions.filter((m) => m.urgency !== 'notice').length,
    [expiringMissions]
  );

  // Prolongation : nouvelle fin et agents indisponibles sur la période prolongée
  const extension = useMemo(() => {
    if (!extendingMission) return null;
    const newEndDate = computeExtendedEndDate(extendingMission, extensionDays, currentTime);
    const newEnd = getMissionEndDateTime({ ...extendingMission, endDate: Timestamp.fromDate(newEndDate) });
    // Seuls les jours ajoutés sont vérifiés : du lendemain de la fin prévue (ou d'aujourd'hui si elle est échue)
    const currentEnd = getMissionEndDateTime(extendingMission) ?? currentTime;
    const start = currentEnd < currentTime ? startOfDay(currentTime) : startOfDay(addDays(currentEnd, 1));
    const conflicts = (extendingMission.assignedAgentIds || [])
      .map((id) => agentsById[id])
      .filter(Boolean)
      .map((agent) => ({
        agent,
        info: checkAgentMissionConflict(agent, allMissions ?? missions, start, newEndDate, null, null, extendingMission.id),
      }))
      .filter((c) => c.info.hasConflict);
    return { newEndDate, newEnd, conflicts };
  }, [extendingMission, extensionDays, currentTime, agentsById, allMissions, missions]);

  // Clôture rapide d'une mission
  const handleConfirmClose = async () => {
    if (!firestore || !closingMission) return;
    setIsClosing(true);
    try {
      const batch = writeBatch(firestore);
      const missionRef = doc(firestore, 'missions', closingMission.id);
      batch.update(missionRef, { status: 'Terminée' });

      // +1 au compteur de chaque agent encore enregistré. increment() évite les doubles
      // comptages ; un agent supprimé est ignoré (sa mise à jour ferait échouer toute la clôture).
      for (const agentId of closingMission.assignedAgentIds || []) {
        if (!agentsById[agentId]) continue;
        batch.update(doc(firestore, 'agents', agentId), { missionCount: increment(1) });
      }

      await batch.commit();

      toast({
        title: 'Mission clôturée avec succès',
        description: `La mission "${closingMission.name}" a été marquée comme Terminée. Les agents ont été libérés.`,
      });

      logActivity(
        firestore,
        `Mission clôturée depuis le tableau de bord : ${closingMission.name}`,
        'Mission',
        '/missions'
      );

      setClosingMission(null);
    } catch (error) {
      console.error('Erreur lors de la clôture de la mission :', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de clôturer la mission.',
      });
    } finally {
      setIsClosing(false);
    }
  };

  // Prolongation rapide d'une mission
  const handleConfirmExtend = async () => {
    if (!firestore || !extendingMission || !extension || extension.conflicts.length > 0) return;
    setIsExtending(true);
    try {
      const missionRef = doc(firestore, 'missions', extendingMission.id);
      await updateDoc(missionRef, {
        endDate: Timestamp.fromDate(extension.newEndDate),
      });

      toast({
        title: 'Mission prolongée',
        description: `La mission "${extendingMission.name}" a été prolongée jusqu'au ${
          extension.newEnd ? fmtDateTime(extension.newEnd) : extension.newEndDate.toLocaleDateString('fr-FR')
        }.`,
      });

      logActivity(
        firestore,
        `Mission prolongée de ${extensionDays}j : ${extendingMission.name}`,
        'Mission',
        '/missions'
      );

      setExtendingMission(null);
    } catch (error) {
      console.error('Erreur lors de la prolongation de la mission :', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de prolonger la mission.',
      });
    } finally {
      setIsExtending(false);
    }
  };

  // Si aucune mission n'expire dans moins de 48h
  if (expiringMissions.length === 0) {
    return null;
  }

  const tone = overdueCount > 0 ? TONES.overdue : criticalCount > 0 ? TONES.critical : TONES.notice;
  const first = expiringMissions[0];
  const summary =
    expiringMissions.length === 1
      ? `${first.mission.name} — ${first.timeLabel}`
      : [
          `${expiringMissions.length} missions à échéance`,
          overdueCount > 0 ? `${overdueCount} échue${overdueCount > 1 ? 's' : ''}` : null,
          soonCount - overdueCount > 0 ? `${soonCount - overdueCount} dans moins de 24 h` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div
      id="expiring-missions"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        role="status"
        aria-live="polite"
        className={`overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm transition-colors ${tone.border}`}
      >
        {/* Bandeau : une ligne, toujours visible */}
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.iconBg}`}>
            <ShieldAlert className="h-4 w-4" />
            {overdueCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Échéances de missions</span>
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
            <span className="hidden sm:inline">{isExpanded ? 'Masquer' : 'Voir'}</span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {/* Barre de progression du repli automatique */}
        {isExpanded && autoCollapseActive && !isHovered && (
          <div className="h-0.5 w-full bg-muted">
            <div
              key={autoCollapseKey}
              className={`h-full ${tone.bar}`}
              style={{ animation: `expiring-alert-countdown ${AUTO_COLLAPSE_MS}ms linear forwards` }}
            />
          </div>
        )}

        {isExpanded && (
          <div className="border-t">
            {expiringMissions.length > 3 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-b bg-muted/20">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {([
                    ['all', `Toutes (${expiringMissions.length})`],
                    ...(soonCount > overdueCount ? [['soon', `< 24 h (${soonCount})`]] : []),
                    ...(overdueCount > 0 ? [['overdue', `Échues (${overdueCount})`]] : []),
                  ] as [typeof filterType, string][]).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={filterType === value ? 'secondary' : 'ghost'}
                      onClick={() => setFilterType(value)}
                      className="h-7 rounded-md px-2.5 text-xs"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="relative w-full sm:w-52">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Mission ou agent…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
            )}

            <ul className="divide-y">
              {filteredList.map((item) => {
                const mission = item.mission;
                const t = TONES[item.urgency === 'warning' ? 'critical' : item.urgency];
                const missionWithStatus: MissionWithDisplayStatus = {
                  ...mission,
                  displayStatus: getDisplayStatus(mission, currentTime),
                };

                return (
                  <li key={mission.id} className="flex flex-col gap-2.5 px-4 py-3 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <button
                            type="button"
                            className="text-sm font-semibold text-foreground hover:underline"
                            onClick={() => onViewMissionDetails?.(missionWithStatus)}
                          >
                            {mission.name}
                          </button>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${t.text}`}>
                            <Clock className="h-3 w-3" />
                            {item.timeLabel}
                          </span>
                        </div>
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {mission.location || 'Lieu non spécifié'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDateTime(item.endDateTime)}
                          </span>
                          <span
                            className="inline-flex items-center gap-1"
                            title={item.assignedAgents.map((a) => a.fullName).join(', ')}
                          >
                            <Users className="h-3 w-3" />
                            {item.assignedAgents.length} agent{item.assignedAgents.length > 1 ? 's' : ''}
                          </span>
                          {mission.detachement && <span>{mission.detachement}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 self-end md:self-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => onViewMissionDetails?.(missionWithStatus)}
                        title="Voir les détails de la mission"
                      >
                        <Eye className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Détails</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setExtendingMission(mission);
                          setExtensionDays(1);
                        }}
                        title="Prolonger la mission"
                      >
                        <CalendarPlus className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Prolonger</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs font-semibold text-emerald-700 border-emerald-600/40 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        onClick={() => setClosingMission(mission)}
                        title="Clôturer la mission"
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Clôturer
                      </Button>
                    </div>
                  </li>
                );
              })}

              {filteredList.length === 0 && (
                <li className="px-4 py-4 text-center text-xs text-muted-foreground">
                  Aucune mission ne correspond à la recherche.
                </li>
              )}
            </ul>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
              <span>Une mission échue est clôturée automatiquement 1 h après sa fin prévue.</span>
              <Link href="/missions" className="font-semibold text-primary hover:underline whitespace-nowrap">
                Toutes les missions &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes expiring-alert-countdown { from { width: 100%; } to { width: 0%; } }`}</style>

      {/* Modal de confirmation de clôture rapide */}
      {closingMission && (
        <Dialog open={!!closingMission} onOpenChange={(open) => !open && setClosingMission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                Confirmer la clôture de la mission
              </DialogTitle>
              <DialogDescription>
                Vous êtes sur le point de marquer définitivement cette mission comme terminée :
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="bg-muted p-3 rounded-lg space-y-1">
                <p className="font-bold text-foreground">{closingMission.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {closingMission.location}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {closingMission.assignedAgentIds?.length || 0} agents affectés
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cette action va passer le statut à <strong>Terminée</strong>, libérer les agents pour d'autres missions, et incrémenter de <strong>+1</strong> le compteur individuel de missions de chaque agent affecté.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                disabled={isClosing}
                onClick={() => setClosingMission(null)}
              >
                Annuler
              </Button>
              <Button
                disabled={isClosing}
                onClick={handleConfirmClose}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {isClosing ? 'Clôture en cours...' : 'Confirmer la clôture'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de prolongation rapide */}
      {extendingMission && (
        <Dialog open={!!extendingMission} onOpenChange={(open) => !open && setExtendingMission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <CalendarPlus className="h-5 w-5" />
                Prolonger la durée de la mission
              </DialogTitle>
              <DialogDescription>
                Ajustez l'échéance de la mission « {extendingMission.name} ».
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="bg-muted p-3 rounded-lg text-xs space-y-1">
                <p className="text-muted-foreground">
                  Échéance actuelle :{' '}
                  <strong className="text-foreground">
                    {(() => {
                      const end = getMissionEndDateTime(extendingMission);
                      return end ? fmtDateTime(end) : '—';
                    })()}
                  </strong>
                </p>
                {(() => {
                  const end = getMissionEndDateTime(extendingMission);
                  return end && end < currentTime ? (
                    <p className="text-muted-foreground">
                      La mission est déjà échue : la prolongation part d'aujourd'hui.
                    </p>
                  ) : null;
                })()}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Durée de la prolongation :
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={extensionDays === 1 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => setExtensionDays(1)}
                  >
                    + 1 jour
                  </Button>
                  <Button
                    type="button"
                    variant={extensionDays === 2 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => setExtensionDays(2)}
                  >
                    + 2 jours
                  </Button>
                  <Button
                    type="button"
                    variant={extensionDays === 7 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => setExtensionDays(7)}
                  >
                    + 1 semaine
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Nouvelle échéance :{' '}
                <strong className="text-foreground">
                  {extension?.newEnd ? fmtDateTime(extension.newEnd) : '—'}
                </strong>
              </p>

              {extension && extension.conflicts.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1">
                  <p className="flex items-center gap-1.5 font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Prolongation impossible : agent(s) indisponible(s) sur les jours ajoutés
                  </p>
                  <ul className="list-disc pl-5 text-foreground/80">
                    {extension.conflicts.map(({ agent, info }) => (
                      <li key={agent.id}>
                        <span className="font-medium">{agent.fullName}</span> — {info.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">Choisissez une durée plus courte ou modifiez l'affectation depuis la page Missions.</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                disabled={isExtending}
                onClick={() => setExtendingMission(null)}
              >
                Annuler
              </Button>
              <Button
                disabled={isExtending || !extension || extension.conflicts.length > 0}
                onClick={handleConfirmExtend}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
              >
                {isExtending ? 'Prolongation...' : 'Valider la prolongation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
