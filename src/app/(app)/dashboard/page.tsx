'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  Users,
  Shield,
  UserCheck,
  CheckCircle,
  BarChart,
  Newspaper,
  Calendar,
  MapPin,
  Loader2,
  Info,
  Lock,
  Check,
  X,
  Clock,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, doc, setDoc, Timestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Agent, Mission, MissionStatus, Detainee, Demande, Explication } from '@/lib/types';
import { useMemo, useState, useEffect } from 'react';
import { getAgentAvailability } from '@/lib/agents';
import { getDisplayStatus, MissionWithDisplayStatus } from '@/lib/missions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MissionDetailsDialog } from '@/components/missions/mission-details-dialog';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { RecentActivities } from '@/components/dashboard/recent-activities';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';
import { useRole } from '@/hooks/use-role';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


export default function DashboardPage() {
  return (
    <ClientOnly>
      <DashboardContent />
    </ClientOnly>
  );
}

function DashboardContent() {
  const firestore = useFirestore();
  const { role } = useRole();
  const { toast } = useToast();

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);
  const detaineesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'detainees') : null), [firestore]);
  const demandesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'demandes') : null), [firestore]);

  const { data: agents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  const { data: missions, isLoading: missionsLoading } = useCollection<Mission>(missionsQuery);
  const { data: detainees, isLoading: detaineesLoading } = useCollection<Detainee>(detaineesQuery);
  const { data: demandes, isLoading: demandesLoading } = useCollection<Demande>(demandesQuery);
  
  // Explanation requests for administration
  const explicationsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'explications') : null), [firestore]);
  const { data: explications } = useCollection<Explication>(role === 'admin' ? explicationsQuery : null);

  const pendingExplicationReplies = useMemo(() => {
    if (!explications) return [];
    return explications.filter(e => e.status === 'repondu' && e.notifiedAdmin === false);
  }, [explications]);

  const handleAcknowledgeExplication = async (exp: Explication) => {
    if (!firestore) return;
    try {
      const docRef = doc(firestore, 'explications', exp.id);
      await setDoc(docRef, {
        notifiedAdmin: true,
      }, { merge: true });

      toast({
        title: 'Explication enregistrée',
        description: `Vous avez pris acte de l'explication de ${exp.agentName}.`,
      });
    } catch (error) {
      console.error('Error acknowledging explanation:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’enregistrer l’explication.',
      });
    }
  };
  
  const [sanctionTexts, setSanctionTexts] = useState<Record<string, string>>({});
  const [sanctionSubmitting, setSanctionSubmitting] = useState<Record<string, boolean>>({});

  const handleSendSanction = async (expId: string) => {
    const text = sanctionTexts[expId]?.trim();
    if (!text || !firestore) {
      toast({
        variant: 'destructive',
        title: "Champ vide",
        description: "Veuillez saisir le libellé de la sanction.",
      });
      return;
    }
    setSanctionSubmitting(prev => ({ ...prev, [expId]: true }));
    try {
      const docRef = doc(firestore, 'explications', expId);
      await setDoc(docRef, {
        status: 'sanctionne',
        sanctionText: text,
        sanctionDate: Timestamp.now(),
        notifiedAgentSanction: false, // will notify the agent
        notifiedAdmin: true, // admin acknowledged it
      }, { merge: true });

      toast({
        title: "Sanction envoyée",
        description: "La sanction a été notifiée à l'agent avec succès.",
      });
    } catch (error) {
      console.error('Error sending sanction:', error);
      toast({
        variant: 'destructive',
        title: "Erreur",
        description: "Impossible d'enregistrer la sanction.",
      });
    } finally {
      setSanctionSubmitting(prev => ({ ...prev, [expId]: false }));
    }
  };

  const [selectedMission, setSelectedMission] = useState<MissionWithDisplayStatus | null>(null);

  // Decision management for requests
  const [refusalTarget, setRefusalTarget] = useState<Demande | null>(null);
  const [refusalComment, setRefusalComment] = useState<string>('');

  const pendingDemandes = useMemo(() => {
    if (!demandes) return [];
    return demandes.filter(d => d.status === 'en_attente');
  }, [demandes]);

  const processedDemandes = useMemo(() => {
    if (!demandes) return [];
    return demandes.filter(d => d.status === 'acceptee' || d.status === 'refusee')
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
  }, [demandes]);

  const handleAcceptDemande = async (dem: Demande) => {
    if (!firestore) return;
    try {
      const docRef = doc(firestore, 'demandes', dem.id);
      await setDoc(docRef, {
        status: 'acceptee',
        comment: '',
        notified: false,     // trigger notification
        vu_par_agent: false, // trigger cloche
      }, { merge: true });

      toast({
        title: 'Demande approuvée',
        description: `La demande de ${dem.agentName} a été approuvée.`,
      });
    } catch (error) {
      console.error('Error accepting:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’approuver la demande. Veuillez réessayer.',
      });
    }
  };

  const handleRefuseDemande = async () => {
    if (!firestore || !refusalTarget) return;
    try {
      const docRef = doc(firestore, 'demandes', refusalTarget.id);
      await setDoc(docRef, {
        status: 'refusee',
        comment: refusalComment.trim(),
        notified: false,     // trigger notification
        vu_par_agent: false, // trigger cloche
      }, { merge: true });

      toast({
        title: 'Demande refusée',
        description: `La demande de ${refusalTarget.agentName} a été refusée.`,
      });
      setRefusalTarget(null);
      setRefusalComment('');
    } catch (error) {
      console.error('Error refusing:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de rejeter la demande. Veuillez réessayer.',
      });
    }
  };

  const stats = useMemo(() => {
    if (!agents || !missions || !detainees) {
      return { totalAgents: 0, onMission: 0, available: 0, completedMissions: 0, totalGAV: 0 };
    }
    const now = new Date();
    const onMission = new Set<string>();
    const onLeave = new Set<string>();
    const onPermission = new Set<string>();

    for (const agent of agents) {
      const availability = getAgentAvailability(agent, missions, now, undefined, demandes || []);
      if (availability === 'En mission') {
        onMission.add(agent.id);
      } else if (availability === 'En congé') {
        onLeave.add(agent.id);
      } else if (availability === 'En permission') {
        onPermission.add(agent.id);
      }
    }
    
    const available = agents.length - onMission.size - onLeave.size - onPermission.size;
    
    const completedMissions = missions.filter(m => getDisplayStatus(m, now) === 'Terminée').length;

    return {
      totalAgents: agents.length,
      onMission: onMission.size,
      available: available,
      completedMissions: completedMissions,
      totalGAV: detainees.length,
    };
  }, [agents, missions, detainees, demandes]);

  const missionsWithStatus: MissionWithDisplayStatus[] = useMemo(() => {
    if (!missions) return [];
    const now = new Date();
    return missions.map(mission => ({
      ...mission,
      displayStatus: getDisplayStatus(mission, now)!,
    }));
  }, [missions]);

  const ongoingMissions = useMemo(() => {
    return missionsWithStatus.filter(mission => mission.displayStatus === 'En cours');
  }, [missionsWithStatus]);
  
  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
      </div>

      {/* Notifications pour réponses aux demandes d'explication */}
      {role === 'admin' && pendingExplicationReplies.length > 0 && (
        <div className="space-y-4">
          {pendingExplicationReplies.map((exp) => (
            <Card key={exp.id} className="border-emerald-500/30 bg-emerald-500/5 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader className="bg-emerald-500/10 pb-3 flex flex-row items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <CardTitle className="text-base font-extrabold text-emerald-800 dark:text-emerald-300">RÉPONSE À UNE DEMANDE D'EXPLICATION</CardTitle>
                  <CardDescription className="text-xs text-emerald-700/80 dark:text-emerald-400/80 font-medium">
                    L'agent <strong>{exp.agentName}</strong> a répondu à votre demande.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2 text-sm text-foreground">
                  <div>
                    <span className="font-bold">Votre demande d'origine :</span>
                    <p className="italic bg-background/50 p-2 rounded border border-border mt-1">« {exp.requestText} »</p>
                  </div>
                  <div className="pt-2 border-t border-emerald-500/10">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">Explication de l'agent :</span>
                    <p className="font-semibold bg-background p-3 rounded-xl border border-emerald-500/20 mt-1 shadow-sm leading-relaxed text-foreground">
                      « {exp.replyText} »
                    </p>
                    {exp.replyDate && (
                      <div className="text-[10px] text-muted-foreground text-right font-mono mt-1">
                        Transmis le {exp.replyDate.toDate().toLocaleDateString('fr-FR')} à {exp.replyDate.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-orange-500/5 border border-orange-500/20 p-3.5 rounded-xl space-y-2.5 mt-2">
                  <span className="text-xs font-extrabold text-orange-600 flex items-center gap-1 uppercase tracking-wider">
                    <AlertTriangle className="h-4 w-4" />
                    Appliquer une sanction administrative suite à la réponse :
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      className="bg-background text-xs border rounded-lg px-2 py-1"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setSanctionTexts(prev => ({ ...prev, [exp.id]: val }));
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Motifs rapides...</option>
                      <option value="Avertissement de conduite formel">Avertissement</option>
                      <option value="Blâme inscrit au dossier de l'agent">Blâme</option>
                      <option value="Suspension administrative temporaire de 3 jours">Suspension de 3 jours</option>
                      <option value="Mise à pied conservatoire avec suspension de solde">Mise à pied</option>
                      <option value="Retrait immédiat de la mission actuelle">Retrait de mission</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Saisissez ou modifiez la sanction..."
                      value={sanctionTexts[exp.id] || ''}
                      onChange={(e) => setSanctionTexts(prev => ({ ...prev, [exp.id]: e.target.value }))}
                      className="bg-background text-xs border rounded-lg px-2 py-1.5 flex-1 text-foreground"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAcknowledgeExplication(exp)}
                      className="rounded-xl font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10 gap-1"
                    >
                      <Check className="h-4 w-4" />
                      Prendre acte sans sanction
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSendSanction(exp.id)}
                      className="rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-500 gap-1.5 shadow-sm"
                      disabled={sanctionSubmitting[exp.id] || !sanctionTexts[exp.id]?.trim()}
                    >
                      {sanctionSubmitting[exp.id] ? "Envoi..." : "Envoyer la sanction"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(agentsLoading || missionsLoading || detaineesLoading) ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
             <Card key={i} className="flex flex-col justify-between p-6 rounded-2xl">
                <div className="flex justify-between items-start">
                    <div className="space-y-2">
                        <div className="h-5 w-32 bg-muted rounded-md animate-pulse"></div>
                        <div className="h-9 w-16 bg-muted rounded-md animate-pulse"></div>
                    </div>
                    <div className="h-8 w-8 bg-muted rounded-full animate-pulse"></div>
                </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Link href="/agents">
            <Card className="rounded-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Agents au Total</CardTitle>
                <Users className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalAgents}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/agents?availability=Disponible">
            <Card className="rounded-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Agents Disponibles</CardTitle>
                <UserCheck className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.available}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/agents?availability=En%20mission">
            <Card className="rounded-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Agents en Mission</CardTitle>
                <Shield className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.onMission}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/missions?status=Terminée">
            <Card className="rounded-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Missions Terminées</CardTitle>
                <CheckCircle className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.completedMissions}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/gav">
            <Card className="rounded-2xl transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl border-2 border-transparent hover:border-primary cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">GAV Enregistrés</CardTitle>
                <Lock className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalGAV}</div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      <div className={cn("grid gap-8", role === 'admin' ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Missions en cours ({ongoingMissions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {ongoingMissions.length > 0 ? (
                <ScrollArea className="h-72">
                  <div className="space-y-4">
                    {ongoingMissions.map((mission) => (
                      <div key={mission.id} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedMission(mission)}>
                        <div className="flex justify-between items-start">
                           <div>
                              <p className="font-semibold">{mission.name}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <MapPin className="h-4 w-4" /> {mission.location}
                              </p>
                           </div>
                           <Badge variant="default">{mission.displayStatus}</Badge>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground mt-2 gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{mission.startDate.toDate().toLocaleDateString('fr-FR')} - {mission.endDate.toDate().toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-72 text-muted-foreground">
                  <p>Aucune mission en cours pour le moment.</p>
                </div>
              )}
          </CardContent>
        </Card>

        {role === 'admin' ? (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Gestion des Permis
              </CardTitle>
              <CardDescription>
                Traiter les demandes en attente ou consulter l'historique des décisions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="en_attente" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="en_attente" className="text-xs font-semibold">
                    En attente ({pendingDemandes.length})
                  </TabsTrigger>
                  <TabsTrigger value="historique" className="text-xs font-semibold">
                    Historique ({processedDemandes.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="en_attente" className="mt-0">
                  {demandesLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm">Chargement des demandes...</p>
                    </div>
                  ) : pendingDemandes.length > 0 ? (
                    <ScrollArea className="h-64">
                      <div className="space-y-4 pr-2">
                        {pendingDemandes.map((dem) => (
                          <div key={dem.id} className="p-4 rounded-lg border bg-card/40 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-foreground">{dem.agentName}</p>
                                <p className="text-xs text-primary font-medium mt-0.5">{dem.type}</p>
                              </div>
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                                En attente
                              </Badge>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>
                                <strong className="text-foreground">Période :</strong>{' '}
                                {dem.startDate?.toDate().toLocaleDateString('fr-FR')} au{' '}
                                {dem.endDate?.toDate().toLocaleDateString('fr-FR')}
                              </p>
                              {dem.reason && (
                                <p className="italic bg-black/10 dark:bg-white/5 p-2 rounded mt-1 border border-border">
                                  « {dem.reason} »
                                </p>
                              )}
                            </div>

                            <div className="flex gap-2 justify-end mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 font-semibold gap-1"
                                onClick={() => handleAcceptDemande(dem)}
                              >
                                <Check className="h-3 w-3" />
                                Accepter
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold gap-1"
                                onClick={() => setRefusalTarget(dem)}
                              >
                                <X className="h-3 w-3" />
                                Refuser
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-center">
                      <Check className="h-8 w-8 text-emerald-500 opacity-60 mb-2" />
                      <p className="text-sm font-semibold text-foreground">Aucune demande en attente</p>
                      <p className="text-xs mt-0.5">Toutes les demandes de permission ont été traitées.</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="historique" className="mt-0">
                  {demandesLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm">Chargement de l'historique...</p>
                    </div>
                  ) : processedDemandes.length > 0 ? (
                    <ScrollArea className="h-64">
                      <div className="space-y-4 pr-2">
                        {processedDemandes.map((dem) => (
                          <div key={dem.id} className="p-4 rounded-lg border bg-card/40 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-foreground">{dem.agentName}</p>
                                <p className="text-xs text-primary font-medium mt-0.5">{dem.type}</p>
                              </div>
                              {dem.status === 'acceptee' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                  Acceptée
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                                  Refusée
                                </Badge>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>
                                <strong className="text-foreground">Période :</strong>{' '}
                                {dem.startDate?.toDate().toLocaleDateString('fr-FR')} au{' '}
                                {dem.endDate?.toDate().toLocaleDateString('fr-FR')}
                              </p>
                              {dem.reason && (
                                <p className="italic bg-black/10 dark:bg-white/5 p-2 rounded mt-1 border border-border">
                                  « {dem.reason} »
                                </p>
                              )}
                              {dem.status === 'refusee' && dem.comment && (
                                <p className="text-xs bg-destructive/5 dark:bg-destructive/10 p-2 rounded mt-1 border border-destructive/20 text-destructive dark:text-red-400">
                                  <strong>Motif du refus :</strong> {dem.comment}
                                </p>
                              )}
                              {dem.status === 'acceptee' && dem.comment && (
                                <p className="text-xs bg-emerald-50/50 dark:bg-emerald-950/25 p-2 rounded mt-1 border border-emerald-200/50 text-emerald-700 dark:text-emerald-400">
                                  <strong>Note :</strong> {dem.comment}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/60 mb-2" />
                      <p className="text-sm font-semibold text-foreground">Aucun historique</p>
                      <p className="text-xs mt-0.5">Aucune demande traitée pour le moment.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-dashed border-2 flex flex-col justify-between p-6 bg-primary/5 border-primary/20 hover:bg-primary/10 transition-all duration-300">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-lg">
                <Calendar className="h-5 w-5" />
                <h3>Demande de Permission ou Congé</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Vous devez vous absenter ou formuler un congé exceptionnel, annuel ou maladie ? <br />
                Soumettez rapidement votre demande d'autorisation d'absence à votre hiérarchie.
              </p>
            </div>
            <div className="mt-6">
              <Link href="/demandes" className="w-full sm:w-auto block">
                <Button className="w-full sm:w-auto font-bold text-white rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105">
                  <Calendar className="h-4 w-4 mr-2" />
                  Faire une demande de permission
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* Administrator - General History of Explanation Requests */}
      {role === 'admin' && (
        <Card className="rounded-2xl border border-border/80 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-orange-600" />
              Registre Général des Demandes d'Explication
            </CardTitle>
            <CardDescription>
              Consultez et suivez l'ensemble des demandes d'explications émises, les réponses des agents, et les décisions de sanctions administratives prises.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {explications && explications.length > 0 ? (
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/35">
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Demande & Date</TableHead>
                      <TableHead>Réponse de l'Agent</TableHead>
                      <TableHead>Statut / Décision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...explications]
                      .sort((a, b) => {
                        const timeA = typeof a.requestDate?.toMillis === 'function' ? a.requestDate.toMillis() : new Date(a.requestDate as any).getTime();
                        const timeB = typeof b.requestDate?.toMillis === 'function' ? b.requestDate.toMillis() : new Date(b.requestDate as any).getTime();
                        return timeB - timeA;
                      })
                      .map((exp) => (
                        <TableRow key={exp.id} className="hover:bg-muted/5 transition-colors">
                          <TableCell className="font-bold whitespace-nowrap py-4">
                            {exp.agentName}
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase">
                              IDC: {exp.agentId.substring(0, 6).toUpperCase()}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[280px] py-4">
                            <p className="font-medium text-foreground text-xs leading-relaxed">
                              « {exp.requestText} »
                            </p>
                            {exp.requestDate && (
                              <div className="text-[9px] text-muted-foreground font-mono mt-1">
                                Émise le {exp.requestDate.toDate().toLocaleDateString('fr-FR')} à {exp.requestDate.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[280px] py-4">
                            {exp.replyText ? (
                              <>
                                <p className="italic text-foreground text-xs leading-relaxed">
                                  « {exp.replyText} »
                                </p>
                                {exp.replyDate && (
                                  <div className="text-[9px] text-muted-foreground font-mono mt-1">
                                    Répondu le {exp.replyDate.toDate().toLocaleDateString('fr-FR')}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-orange-600/80 font-medium italic text-xs">
                                Pas encore de réponse
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1.5">
                              <div className="w-fit">
                                {exp.status === 'en_attente' && (
                                  <Badge variant="outline" className="text-orange-600 bg-orange-500/10 border-orange-500/20 text-[10px] font-semibold">
                                    En attente
                                  </Badge>
                                )}
                                {exp.status === 'repondu' && (
                                  <Badge variant="secondary" className="text-blue-600 bg-blue-500/10 border-blue-500/20 text-[10px] font-semibold">
                                    Répondu
                                  </Badge>
                                )}
                                {(exp.status === 'lu' || exp.status === 'archive' || exp.status === 'accepte') && (
                                  <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20 text-[10px] font-semibold">
                                    Pris acte (Classé)
                                  </Badge>
                                )}
                                {exp.status === 'sanctionne' && (
                                  <Badge variant="destructive" className="text-red-600 bg-red-500/10 border-red-500/20 text-[10px] font-bold">
                                    Sanctionné
                                  </Badge>
                                )}
                              </div>
                              {exp.status === 'sanctionne' && exp.sanctionText && (
                                <div className="text-[10px] bg-orange-500/5 border border-orange-500/15 p-1.5 rounded text-foreground max-w-[180px] whitespace-normal">
                                  <span className="font-bold text-orange-600 uppercase text-[8px] tracking-wider block">Sanction :</span>
                                  {exp.sanctionText}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
                <HelpCircle className="h-10 w-10 mx-auto opacity-30 mb-2" />
                <p className="font-semibold text-foreground text-sm">Aucune demande enregistrée</p>
                <p className="text-xs mt-1">L'historique des demandes d'explication s'affichera ici.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {refusalTarget && (
        <Dialog open={!!refusalTarget} onOpenChange={(open) => { if (!open) { setRefusalTarget(null); setRefusalComment(''); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Refuser la demande de permission</DialogTitle>
              <DialogDescription>
                Indiquez le motif de refus pour <strong>{refusalTarget.agentName}</strong>. Ce commentaire lui sera notifié dans son espace personnel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refusal-comment">Motif de refus *</Label>
                <Textarea
                  id="refusal-comment"
                  placeholder="Ex: Nécessité de service, effectifs insuffisants à cette période..."
                  value={refusalComment}
                  onChange={(e) => setRefusalComment(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setRefusalTarget(null); setRefusalComment(''); }}>
                Annuler
              </Button>
              <Button 
                variant="destructive" 
                disabled={!refusalComment.trim()} 
                onClick={handleRefuseDemande}
              >
                Confirmer le refus
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

       {selectedMission && (
        <MissionDetailsDialog
          isOpen={!!selectedMission}
          onOpenChange={() => setSelectedMission(null)}
          mission={selectedMission}
          agents={(selectedMission.assignedAgentIds || []).map(id => agentsById[id]).filter(Boolean)}
        />
      )}
    </div>
  );
}
