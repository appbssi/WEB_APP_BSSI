'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Agent, Mission, MissionStatus } from '@/lib/types';
import type { MissionWithDisplayStatus } from '@/lib/missions';
import { getDisplayStatus } from '@/lib/missions';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import Link from 'next/link';

export interface ExpiringMissionsAlertProps {
  missions: Mission[];
  agents: Agent[];
  onViewMissionDetails?: (mission: MissionWithDisplayStatus) => void;
}

export interface ExpiringMissionItem {
  mission: Mission;
  endDateTime: Date;
  diffMs: number;
  diffHours: number;
  urgency: 'overdue' | 'critical' | 'warning' | 'notice';
  timeLabel: string;
  assignedAgents: Agent[];
}

function parseMissionEndDateTime(mission: Mission): Date | null {
  if (!mission || !mission.endDate) return null;
  const rawEnd = mission.endDate;
  let date: Date | null = null;
  if (typeof (rawEnd as any).toDate === 'function') {
    date = (rawEnd as any).toDate();
  } else if (rawEnd instanceof Date) {
    date = new Date(rawEnd.getTime());
  } else if (typeof rawEnd === 'string' || typeof rawEnd === 'number') {
    date = new Date(rawEnd);
  } else if (typeof rawEnd === 'object' && (rawEnd as any).seconds !== undefined) {
    date = new Date((rawEnd as any).seconds * 1000);
  }

  if (!date || isNaN(date.getTime())) return null;

  if (mission.endTime && typeof mission.endTime === 'string') {
    const parts = mission.endTime.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      date.setHours(parts[0], parts[1], 0, 0);
      return date;
    }
  }

  // Fin par défaut à 23h59:59 du jour de fin
  date.setHours(23, 59, 59, 999);
  return date;
}

export function ExpiringMissionsAlert({
  missions,
  agents,
  onViewMissionDetails,
}: ExpiringMissionsAlertProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({});

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

  // Calcul des missions expirant dans moins de 48 heures
  const expiringMissions = useMemo((): ExpiringMissionItem[] => {
    if (!missions || missions.length === 0) return [];

    const list: ExpiringMissionItem[] = [];

    for (const mission of missions) {
      if (!mission) continue;
      // Exclure les missions déjà annulées ou rejetées
      if (
        mission.status === 'Annulée' ||
        mission.status === 'Rejetée' ||
        mission.validationStatus === 'Rejetée'
      ) {
        continue;
      }

      // Si la mission est marquée "Terminée", elle n'est plus à clôturer
      if (mission.status === 'Terminée') {
        continue;
      }

      const endDateTime = parseMissionEndDateTime(mission);
      if (!endDateTime) continue;

      const diffMs = endDateTime.getTime() - currentTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Critère : expire dans moins de 48 heures (diffHours <= 48).
      // On inclut aussi les missions échues récemment (jusqu'à -72h) qui nécessitent une clôture administrative.
      if (diffHours <= 48 && diffHours >= -72) {
        let urgency: ExpiringMissionItem['urgency'] = 'notice';
        let timeLabel = '';

        if (diffHours < 0) {
          urgency = 'overdue';
          const overdueHours = Math.abs(diffHours);
          if (overdueHours < 1) {
            const mins = Math.max(1, Math.round(Math.abs(diffMs) / 60000));
            timeLabel = `Échue depuis ${mins} min (clôture requise)`;
          } else {
            timeLabel = `Échue depuis ${Math.floor(overdueHours)}h (clôture requise)`;
          }
        } else if (diffHours < 12) {
          urgency = 'critical';
          if (diffHours < 1) {
            const mins = Math.max(1, Math.round(diffMs / 60000));
            timeLabel = `Expire dans ${mins} min !`;
          } else {
            const h = Math.floor(diffHours);
            const m = Math.round((diffMs % 3600000) / 60000);
            timeLabel = `Expire dans ${h}h ${m}m`;
          }
        } else if (diffHours < 24) {
          urgency = 'warning';
          const h = Math.round(diffHours);
          timeLabel = `Expire dans ${h}h (aujourd'hui)`;
        } else {
          urgency = 'notice';
          const h = Math.round(diffHours);
          timeLabel = `Expire dans ${h}h (demain)`;
        }

        const assigned = (mission.assignedAgentIds || [])
          .map((id) => agentsById[id])
          .filter(Boolean);

        list.push({
          mission,
          endDateTime,
          diffMs,
          diffHours,
          urgency,
          timeLabel,
          assignedAgents: assigned,
        });
      }
    }

    // Tri : missions échues en premier, puis de la plus urgente à la moins urgente
    return list.sort((a, b) => a.diffMs - b.diffMs);
  }, [missions, currentTime, agentsById]);

  // Filtrage selon onglets / recherche
  const filteredList = useMemo(() => {
    return expiringMissions.filter((item) => {
      if (dismissedIds[item.mission.id]) return false;

      if (filterType === 'overdue' && item.urgency !== 'overdue') return false;
      if (
        filterType === 'critical' &&
        item.urgency !== 'critical' &&
        item.urgency !== 'overdue'
      ) {
        return false;
      }

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
  }, [expiringMissions, dismissedIds, filterType, searchQuery]);

  const overdueCount = useMemo(
    () => expiringMissions.filter((m) => m.urgency === 'overdue').length,
    [expiringMissions]
  );
  const criticalCount = useMemo(
    () => expiringMissions.filter((m) => m.urgency === 'critical').length,
    [expiringMissions]
  );

  // Clôture rapide d'une mission
  const handleConfirmClose = async () => {
    if (!firestore || !closingMission) return;
    setIsClosing(true);
    try {
      const batch = writeBatch(firestore);
      const missionRef = doc(firestore, 'missions', closingMission.id);
      batch.update(missionRef, { status: 'Terminée' });

      // Incrémentation des compteurs des agents assignés
      for (const agentId of closingMission.assignedAgentIds || []) {
        const agent = agentsById[agentId];
        const currentCount = agent?.missionCount || 0;
        const agentRef = doc(firestore, 'agents', agentId);
        batch.update(agentRef, { missionCount: currentCount + 1 });
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
    if (!firestore || !extendingMission) return;
    setIsExtending(true);
    try {
      const currentEnd = parseMissionEndDateTime(extendingMission) || new Date();
      const newEnd = new Date(currentEnd.getTime() + extensionDays * 24 * 60 * 60 * 1000);

      const missionRef = doc(firestore, 'missions', extendingMission.id);
      await updateDoc(missionRef, {
        endDate: Timestamp.fromDate(newEnd),
      });

      toast({
        title: 'Mission prolongée',
        description: `La mission "${extendingMission.name}" a été prolongée jusqu'au ${newEnd.toLocaleDateString(
          'fr-FR'
        )} à ${newEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`,
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

  return (
    <div id="expiring-missions" className="space-y-3">
      <Card
        className={`rounded-2xl transition-all shadow-sm overflow-hidden border ${
          overdueCount > 0
            ? 'border-red-500/40 bg-gradient-to-r from-red-500/10 via-background to-orange-500/5'
            : criticalCount > 0
            ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-background to-background'
            : 'border-blue-500/30 bg-gradient-to-r from-blue-500/5 via-background to-background'
        }`}
      >
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  overdueCount > 0
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : criticalCount > 0
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                }`}
              >
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Alertes d'échéance : Missions à terme (&lt; 48 heures)
                  </CardTitle>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20">
                    {expiringMissions.length} mission{expiringMissions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Vérification opérationnelle : clôturez les missions terminées ou prolongez les opérations en cours.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold gap-1.5"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Réduire la liste' : 'Déplier la liste'}
              >
                {isExpanded ? (
                  <>
                    <span>Réduire</span>
                    <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span>Afficher ({filteredList.length})</span>
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Filtres et recherche (uniquement si déplié) */}
          {isExpanded && expiringMissions.length > 1 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-border/60 mt-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <Button
                  size="sm"
                  variant={filterType === 'all' ? 'default' : 'ghost'}
                  onClick={() => setFilterType('all')}
                  className="h-7 text-xs px-2.5 rounded-lg"
                >
                  Toutes ({expiringMissions.length})
                </Button>
                {criticalCount > 0 && (
                  <Button
                    size="sm"
                    variant={filterType === 'critical' ? 'default' : 'ghost'}
                    onClick={() => setFilterType('critical')}
                    className="h-7 text-xs px-2.5 rounded-lg text-amber-600 dark:text-amber-400 font-semibold"
                  >
                    Moins de 24h ({criticalCount + overdueCount})
                  </Button>
                )}
                {overdueCount > 0 && (
                  <Button
                    size="sm"
                    variant={filterType === 'overdue' ? 'destructive' : 'ghost'}
                    onClick={() => setFilterType('overdue')}
                    className="h-7 text-xs px-2.5 rounded-lg font-semibold"
                  >
                    Échues ({overdueCount})
                  </Button>
                )}
              </div>

              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filtrer mission ou agent..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7.5 pl-8 text-xs rounded-lg bg-background/80"
                />
              </div>
            </div>
          )}
        </CardHeader>

        {isExpanded && (
          <CardContent className="p-4 sm:p-5 pt-0">
            <div className="space-y-2.5">
              {filteredList.map((item) => {
                const mission = item.mission;
                const isOverdue = item.urgency === 'overdue';
                const isCritical = item.urgency === 'critical';

                const displayStatus = getDisplayStatus(mission, currentTime);
                const missionWithStatus: MissionWithDisplayStatus = {
                  ...mission,
                  displayStatus,
                };

                return (
                  <div
                    key={mission.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
                      isOverdue
                        ? 'bg-red-50/70 dark:bg-red-950/20 border-red-500/30'
                        : isCritical
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/30'
                        : 'bg-card/70 border-border/70 hover:border-primary/40'
                    }`}
                  >
                    {/* Bloc informations */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground hover:underline cursor-pointer"
                          onClick={() => onViewMissionDetails?.(missionWithStatus)}
                        >
                          {mission.name}
                        </span>

                        {/* Compte à rebours textuel épuré (règle zero-pill : texte sobre et informatif) */}
                        <span
                          className={`font-mono text-xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                            isOverdue
                              ? 'bg-red-500 text-white animate-pulse'
                              : isCritical
                              ? 'bg-amber-500 text-white'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {item.timeLabel}
                        </span>

                        {mission.detachement && (
                          <span className="text-[11px] text-muted-foreground font-medium">
                            · {mission.detachement}
                          </span>
                        )}
                      </div>

                      {/* Métadonnées sans pilules superflues */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-foreground/80">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          {mission.location || 'Lieu non spécifié'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          Fin prévue : {item.endDateTime.toLocaleDateString('fr-FR')} à{' '}
                          {item.endDateTime.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-semibold text-foreground">
                            {item.assignedAgents.length}
                          </span>{' '}
                          agent{item.assignedAgents.length > 1 ? 's' : ''}{' '}
                          {item.assignedAgents.length > 0 && (
                            <span className="text-[11px] italic">
                              ({item.assignedAgents.map((a) => a.fullName).slice(0, 2).join(', ')}
                              {item.assignedAgents.length > 2
                                ? ` +${item.assignedAgents.length - 2}`
                                : ''})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Bloc actions rapides de l'administrateur */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-medium gap-1 px-2.5"
                        onClick={() => onViewMissionDetails?.(missionWithStatus)}
                        title="Voir les détails complets de la mission"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Détails</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold gap-1 px-2.5 border-blue-500/30 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700"
                        onClick={() => {
                          setExtendingMission(mission);
                          setExtensionDays(1);
                        }}
                        title="Prolonger la durée de la mission"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>Prolonger</span>
                      </Button>

                      <Button
                        size="sm"
                        className="h-8 text-xs font-bold gap-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                        onClick={() => setClosingMission(mission)}
                        title="Clôturer et libérer les agents"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Clôturer</span>
                      </Button>
                    </div>
                  </div>
                );
              })}

              {filteredList.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Aucune mission ne correspond aux critères de recherche actuels.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border/50 mt-3">
              <span>
                💡 Les missions clôturées incrémentent automatiquement le compteur d'activités des agents affectés.
              </span>
              <Link
                href="/missions"
                className="text-primary hover:underline font-semibold whitespace-nowrap ml-2"
              >
                Gérer toutes les missions &rarr;
              </Link>
            </div>
          </CardContent>
        )}
      </Card>

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
                    {parseMissionEndDateTime(extendingMission)?.toLocaleDateString('fr-FR')} à{' '}
                    {parseMissionEndDateTime(extendingMission)?.toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>
                </p>
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
                    + 24 heures (1j)
                  </Button>
                  <Button
                    type="button"
                    variant={extensionDays === 2 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => setExtensionDays(2)}
                  >
                    + 48 heures (2j)
                  </Button>
                  <Button
                    type="button"
                    variant={extensionDays === 7 ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => setExtensionDays(7)}
                  >
                    + 1 semaine (7j)
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Nouvelle date d'échéance calculée :{' '}
                <strong className="text-foreground">
                  {new Date(
                    (parseMissionEndDateTime(extendingMission)?.getTime() || Date.now()) +
                      extensionDays * 24 * 60 * 60 * 1000
                  ).toLocaleDateString('fr-FR')}{' '}
                  à{' '}
                  {new Date(
                    (parseMissionEndDateTime(extendingMission)?.getTime() || Date.now()) +
                      extensionDays * 24 * 60 * 60 * 1000
                  ).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </p>
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
                disabled={isExtending}
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
