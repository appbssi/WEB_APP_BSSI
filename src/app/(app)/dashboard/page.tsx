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
} from 'lucide-react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, doc, setDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Agent, Mission, MissionStatus, Detainee, Demande } from '@/lib/types';
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
  const { data: demandes, isLoading: demandesLoading } = useCollection<Demande>(role === 'admin' ? demandesQuery : null);
  
  const [selectedMission, setSelectedMission] = useState<MissionWithDisplayStatus | null>(null);

  // Decision management for requests
  const [refusalTarget, setRefusalTarget] = useState<Demande | null>(null);
  const [refusalComment, setRefusalComment] = useState<string>('');

  const pendingDemandes = useMemo(() => {
    if (!demandes) return [];
    return demandes.filter(d => d.status === 'en_attente');
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

    for (const agent of agents) {
      const availability = getAgentAvailability(agent, missions, now);
      if (availability === 'En mission') {
        onMission.add(agent.id);
      } else if (availability === 'En congé') {
        onLeave.add(agent.id);
      }
    }
    
    const available = agents.length - onMission.size - onLeave.size;
    
    const completedMissions = missions.filter(m => getDisplayStatus(m, now) === 'Terminée').length;

    return {
      totalAgents: agents.length,
      onMission: onMission.size,
      available: available,
      completedMissions: completedMissions,
      totalGAV: detainees.length,
    };
  }, [agents, missions, detainees]);

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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Gestion des Permis ({pendingDemandes.length})
              </CardTitle>
              <CardDescription>
                Demandes de permission en attente de décision administrative.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {demandesLoading ? (
                <div className="flex flex-col items-center justify-center h-72 gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Chargement des demandes...</p>
                </div>
              ) : pendingDemandes.length > 0 ? (
                <ScrollArea className="h-72">
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
                            {dem.startDate.toDate().toLocaleDateString('fr-FR')} au{' '}
                            {dem.endDate.toDate().toLocaleDateString('fr-FR')}
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
                <div className="flex flex-col items-center justify-center h-72 text-muted-foreground text-center">
                  <Check className="h-8 w-8 text-emerald-500 opacity-60 mb-2" />
                  <p className="text-sm font-semibold text-foreground">Aucune demande en attente</p>
                  <p className="text-xs mt-0.5">Toutes les demandes de permission ont été traitées.</p>
                </div>
              )}
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
