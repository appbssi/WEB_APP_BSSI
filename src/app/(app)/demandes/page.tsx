'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Calendar, AlertCircle, CheckCircle2, Clock, XCircle, Send, HelpCircle, MessageSquare, AlertTriangle, FileDown, Shield, Printer, ShieldAlert, PackageCheck } from 'lucide-react';
import type { Demande, Agent, Explication, Mission, Weapon, WeaponAssignment } from '@/lib/types';
import { generateAutorisationAbsencePDF, generateFicheAgentPDF } from '@/lib/pdf-generator';
import { getAgentAvailability } from '@/lib/agents';
import { useRole } from '@/hooks/use-role';

export default function DemandesPage() {
  return (
    <ClientOnly>
      <DemandesContent />
    </ClientOnly>
  );
}

function sanitizeInput(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '') // Supprime les balises script
    .replace(/on\w+="[^"]*"/gi, '')                    // Supprime les attributs d'événement
    .replace(/javascript:[^\s"']*/gi, '')               // Supprime les liens javascript:
    .replace(/<\/?[^>]+(>|$)/g, "");                   // Supprime le HTML restant
}

function DemandesContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isMounted = useIsMounted();
  const { role } = useRole();

  const [userIdc, setUserIdc] = useState<string>('');
  
  // Security States (Anti-Spam Rate Limit)
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
  
  // Security States (Notification Dépôt Matériel)
  const [dismissedReturns, setDismissedReturns] = useState<string[]>([]);
  
  // Form States
  const [permissionType, setPermissionType] = useState<string>('Permission exceptionnelle');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Alert for new updates
  const [unnotifiedDemandes, setUnnotifiedDemandes] = useState<Demande[]>([]);

  // Explanation states
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});

  // Countdown states for confirmation delay
  const [countdown, setCountdown] = useState<Record<string, number>>({});
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [timerIds, setTimerIds] = useState<Record<string, any>>({});

  // Clean up any active timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timerIds).forEach(id => clearInterval(id));
    };
  }, [timerIds]);

  // Load dismissed returns notification from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissed-weapon-returns');
      if (saved) {
        try {
          setDismissedReturns(JSON.parse(saved));
        } catch (e) {
          console.error('Error loading dismissed weapon returns:', e);
        }
      }
    }
  }, []);

  const handleDismissReturn = (id: string) => {
    const updated = [...dismissedReturns, id];
    setDismissedReturns(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dismissed-weapon-returns', JSON.stringify(updated));
    }
    toast({
      title: 'Notification masquée',
      description: 'La confirmation de dépôt a bien été archivée.',
    });
  };

  // Get user IDC from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedIdc = localStorage.getItem('app-user-idc') || '';
      setUserIdc(savedIdc.toUpperCase());
    }
  }, []);

  // Fetch current agent details to get their full name
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agents } = useCollection<Agent>(agentsQuery);
  const currentAgent = useMemo(() => {
    if (!agents || !userIdc) return null;
    const cleanIdc = userIdc.trim().toUpperCase();
    return agents.find(a => {
      if (!a || !a.id) return false;
      const aId = String(a.id).trim().toUpperCase();
      const aReg = a.registrationNumber ? String(a.registrationNumber).trim().toUpperCase() : '';
      return aId === cleanIdc || 
             (aId.length >= 6 && aId.substring(0, 6) === cleanIdc) ||
             (aReg && aReg === cleanIdc);
    });
  }, [agents, userIdc]);

  const agentDisplayName = useMemo(() => {
    if (currentAgent) {
      return currentAgent.fullName;
    }
    return userIdc ? `Agent (${userIdc})` : 'Agent';
  }, [currentAgent, userIdc]);

  // Fetch missions for agent technical sheet
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);
  const { data: missions } = useCollection<Mission>(missionsQuery);

  const currentAgentMissions = useMemo(() => {
    if (!missions || !currentAgent) return [];
    return missions.filter(m => m.assignedAgentIds && m.assignedAgentIds.includes(currentAgent.id));
  }, [missions, currentAgent]);

  const currentAgentAvailability = useMemo(() => {
    if (!currentAgent || !missions) return 'Disponible';
    const computed = getAgentAvailability(currentAgent, missions, new Date(), undefined, demandes || []);
    return computed || currentAgent.availability || 'Disponible';
  }, [currentAgent, missions, demandes]);

  const handleDownloadFicheTechnique = () => {
    if (!currentAgent) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de charger vos informations d’agent.',
      });
      return;
    }
    
    const agentWithAvailability = {
      ...currentAgent,
      availability: currentAgentAvailability,
    };
    
    generateFicheAgentPDF(agentWithAvailability, currentAgentMissions, explications || []);
    toast({
      title: 'Fiche technique générée',
      description: 'Le téléchargement de votre fiche technique a commencé.',
    });
  };

  // Fetch requests for this agent
  const demandesQuery = useMemoFirebase(() => {
    if (!firestore || !userIdc) return null;
    return query(
      collection(firestore, 'demandes'),
      where('agentId', '==', userIdc)
    );
  }, [firestore, userIdc]);

  const { data: demandes, isLoading: demandesLoading } = useCollection<Demande>(demandesQuery);

  // Fetch explanation requests for this agent
  const explicationsQuery = useMemoFirebase(() => {
    if (!firestore || !currentAgent) return null;
    return query(
      collection(firestore, 'explications'),
      where('agentId', '==', currentAgent.id)
    );
  }, [firestore, currentAgent]);

  const { data: explications } = useCollection<Explication>(explicationsQuery);

  // Fetch weapons/materials and assignments for equipment status alerts
  const weaponsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'weapons') : null), [firestore]);
  const { data: weapons } = useCollection<Weapon>(weaponsQuery);

  const weaponAssignmentsQuery = useMemoFirebase(() => {
    if (!firestore || !currentAgent) return null;
    return query(
      collection(firestore, 'weaponAssignments'),
      where('agentId', '==', currentAgent.id)
    );
  }, [firestore, currentAgent]);
  const { data: weaponAssignments } = useCollection<WeaponAssignment>(weaponAssignmentsQuery);

  const weaponsById = useMemo(() => {
    if (!weapons) return {};
    return weapons.reduce((acc, weapon) => { acc[weapon.id] = weapon; return acc; }, {} as Record<string, Weapon>);
  }, [weapons]);

  const activeEquipmentAssignments = useMemo(() => {
    if (!weaponAssignments) return [];
    return weaponAssignments.filter(a => !a.returnedAt);
  }, [weaponAssignments]);

  const unacknowledgedReturnedAssignments = useMemo(() => {
    if (!weaponAssignments) return [];
    return weaponAssignments.filter(a => !!a.returnedAt && !dismissedReturns.includes(a.id));
  }, [weaponAssignments, dismissedReturns]);

  const pendingExplications = useMemo(() => {
    if (!explications) return [];
    return explications.filter(exp => exp.status === 'en_attente');
  }, [explications]);

  const unnotifiedSanctions = useMemo(() => {
    if (!explications) return [];
    return explications.filter(exp => exp.status === 'sanctionne' && exp.notifiedAgentSanction === false);
  }, [explications]);

  const handleAcknowledgeSanction = async (id: string) => {
    if (!firestore) return;
    try {
      const docRef = doc(firestore, 'explications', id);
      await setDoc(docRef, {
        notifiedAgentSanction: true,
      }, { merge: true });

      toast({
        title: 'Réception accusée',
        description: 'Vous avez accusé réception de la sanction administrative.',
      });
    } catch (err) {
      console.error('Error acknowledging sanction:', err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’accuser réception.',
      });
    }
  };

  const handleReplyExplication = (id: string) => {
    const reply = replies[id]?.trim();
    if (!reply || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Réponse vide',
        description: 'Veuillez rédiger une réponse explicative.',
      });
      return;
    }

    // Capture the text into draft and start 10 seconds delay
    setDraftReplies(prev => ({ ...prev, [id]: reply }));
    setCountdown(prev => ({ ...prev, [id]: 10 }));

    // Start interval
    const intervalId = setInterval(() => {
      setCountdown(prev => {
        const currentVal = prev[id] || 0;
        if (currentVal <= 1) {
          // Time is up! Submit confirmed response
          clearInterval(intervalId);
          submitConfirmedReply(id, reply);
          return { ...prev, [id]: 0 };
        }
        return { ...prev, [id]: currentVal - 1 };
      });
    }, 1000);

    setTimerIds(prev => ({ ...prev, [id]: intervalId }));

    toast({
      title: "Délai de confirmation (10 secondes)",
      description: "Votre réponse est mise en attente pour envoi. Vous pouvez l'annuler ou la modifier.",
    });
  };

  const submitConfirmedReply = async (id: string, replyText: string) => {
    setReplySubmitting(prev => ({ ...prev, [id]: true }));
    try {
      const expRef = doc(firestore!, 'explications', id);
      await setDoc(expRef, {
        replyText: sanitizeInput(replyText),
        replyDate: Timestamp.now(),
        status: 'repondu',
        notifiedAdmin: false, // will notify admin
        notifiedAgent: true,
      }, { merge: true });

      toast({
        title: 'Réponse envoyée',
        description: "Votre réponse à la demande d'explication a bien été transmise à l'administrateur.",
      });

      // Clear all state for this explanation
      setReplies(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setDraftReplies(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setCountdown(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } catch (err) {
      console.error('Error replying to explanation:', err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’envoyer votre réponse. Veuillez réessayer.',
      });
    } finally {
      setReplySubmitting(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleImmediateSend = (id: string) => {
    if (timerIds[id]) {
      clearInterval(timerIds[id]);
    }
    const reply = draftReplies[id] || replies[id];
    submitConfirmedReply(id, reply);
  };

  const handleCancelSend = (id: string) => {
    if (timerIds[id]) {
      clearInterval(timerIds[id]);
    }
    setTimerIds(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setCountdown(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setDraftReplies(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    toast({
      title: "Envoi annulé",
      description: "Vous pouvez modifier votre réponse explicative avant de la renvoyer.",
    });
  };

  // Stagger/Capture unnotified requests on first load to display them in an alert banner
  useEffect(() => {
    if (demandes && unnotifiedDemandes.length === 0) {
      const freshUnnotified = demandes.filter(d => d.notified === false);
      if (freshUnnotified.length > 0) {
        setUnnotifiedDemandes(freshUnnotified);
        
        // Instantly mark them as notified in firestore so they don't bug next time
        freshUnnotified.forEach(async (dem) => {
          try {
            const demRef = doc(firestore!, 'demandes', dem.id);
            await setDoc(demRef, { notified: true, vu_par_agent: true }, { merge: true });
          } catch (err) {
            console.error('Error marking notified:', err);
          }
        });
      }
    }
  }, [demandes, firestore, unnotifiedDemandes.length]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !userIdc) return;

    // Dispositif de sécurité (Rate Limiter / Anti-Spam)
    if (Date.now() - lastSubmitTime < 5000) {
      toast({
        variant: 'destructive',
        title: 'Soumission trop rapide',
        description: 'Veuillez patienter au moins 5 secondes entre chaque demande pour des raisons de sécurité.',
      });
      return;
    }
    setLastSubmitTime(Date.now());

    if (!permissionType || !startDate || !endDate || !reason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Formulaire incomplet',
        description: 'Veuillez renseigner tous les champs obligatoires, y compris le motif.',
      });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      toast({
        variant: 'destructive',
        title: 'Erreur de date',
        description: 'La date de fin ne doit pas être antérieure à la date de début.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const newDemande = {
        agentId: userIdc,
        agentName: agentDisplayName,
        type: permissionType,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(end),
        // Dispositif de sécurité (Input Sanitization contre les failles XSS)
        reason: sanitizeInput(reason.trim()) || '',
        status: 'en_attente',
        comment: '',
        createdAt: serverTimestamp(),
        notified: true, // initial state is notified
        vu_par_agent: true, // initial state is seen by self
      };

      await addDoc(collection(firestore, 'demandes'), newDemande);

      toast({
        title: 'Demande envoyée',
        description: 'Votre demande de permission a bien été transmise à l’administrateur.',
      });

      // Reset form
      setPermissionType('Permission exceptionnelle');
      setStartDate('');
      setEndDate('');
      setReason('');
    } catch (error) {
      console.error('Error adding request:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d’envoyer la demande. Veuillez réessayer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: Demande['status']) => {
    switch (status) {
      case 'en_attente':
        return (
          <Badge className="bg-orange-500/15 text-orange-600 hover:bg-orange-500/25 border-orange-500/30 flex items-center gap-1.5 w-fit">
            <Clock size={12} className="animate-pulse" />
            <span>En attente</span>
          </Badge>
        );
      case 'acceptee':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/30 flex items-center gap-1.5 w-fit">
            <CheckCircle2 size={12} />
            <span>Acceptée</span>
          </Badge>
        );
      case 'refusee':
        return (
          <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30 flex items-center gap-1.5 w-fit">
            <XCircle size={12} />
            <span>Refusée</span>
          </Badge>
        );
    }
  };

  // Sort demands by date (newest first)
  const sortedDemandes = useMemo(() => {
    if (!demandes) return [];
    return [...demandes].sort((a, b) => {
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
  }, [demandes]);

  if (!isMounted) return null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mes Demandes de Permission</h1>
        <p className="text-muted-foreground mt-2">
          Suivez l’état de vos permissions ou soumettez une nouvelle demande à la hiérarchie.
        </p>
      </div>

      {/* Carte d'identité et fiche technique de l'agent */}
      {currentAgent && (
        <Card className="rounded-2xl border border-primary/20 bg-primary/5 shadow-md overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              {currentAgent.photo ? (
                <div className="relative w-20 h-24 rounded-lg overflow-hidden border-2 border-primary/20 bg-background shrink-0 shadow-sm">
                  <img
                    src={currentAgent.photo}
                    alt={currentAgent.fullName}
                    className="object-cover w-full h-full"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="relative w-20 h-24 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl font-bold shrink-0 shadow-sm">
                  {currentAgent.fullName.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
                  <h2 className="text-xl font-bold text-foreground truncate max-w-[280px] sm:max-w-[320px]">
                    {currentAgent.fullName}
                  </h2>
                  {role !== 'admin' && (
                    <Button
                      onClick={handleDownloadFicheTechnique}
                      variant="outline"
                      size="sm"
                      className="font-bold text-xs bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 rounded-lg gap-1.5 h-7 px-2.5 cursor-pointer shadow-sm"
                      title="Imprimer ma fiche technique (PDF)"
                    >
                      <Printer className="h-3 w-3 animate-pulse" />
                      <span>Imprimer ma Fiche</span>
                    </Button>
                  )}
                  <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-[10px] sm:text-xs font-semibold">
                    {currentAgent.rank || 'Agent'}
                  </Badge>
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 text-[10px] sm:text-xs font-semibold">
                    {currentAgentAvailability}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Matricule : {currentAgent.registrationNumber || 'N/A'} • Section : {(currentAgent.section || 'Non assigné').toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Contact : {currentAgent.contact || 'N/A'} • Adresse : {currentAgent.address || 'N/A'}
                </p>
              </div>
            </div>
            <Button
              onClick={handleDownloadFicheTechnique}
              className="font-bold text-white bg-primary hover:bg-primary/95 rounded-xl gap-2 shadow-lg shadow-primary/10 w-full md:w-auto mt-2 md:mt-0 cursor-pointer h-10 px-4"
            >
              <FileDown className="h-4 w-4" />
              <span>Télécharger ma Fiche Technique (PDF)</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Confirmation de dépôt de matériel */}
      {unacknowledgedReturnedAssignments.length > 0 && (
        <div className="space-y-3">
          {unacknowledgedReturnedAssignments.map((assignment) => {
            const weapon = weaponsById[assignment.weaponId];
            return (
              <Alert key={assignment.id} className="border-emerald-500/40 bg-emerald-500/5 rounded-2xl shadow-md p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <PackageCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <AlertTitle className="text-sm font-extrabold text-emerald-800 uppercase flex items-center gap-1.5">
                      ✅ Notification de dépôt d'équipement validée
                    </AlertTitle>
                    <AlertDescription className="text-xs text-emerald-900">
                      Vous avez déposé avec succès l'équipement <span className="font-bold">{weapon?.model || 'Équipement'}</span> (N° Série : {weapon?.serialNumber || 'N/A'}) le {assignment.returnedAt?.toDate().toLocaleString('fr-FR')}. Le retour a été enregistré et validé avec succès par l'armurier.
                    </AlertDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDismissReturn(assignment.id)}
                  className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20 font-bold text-xs rounded-xl h-8 px-3 shrink-0 cursor-pointer"
                >
                  Accuser Réception
                </Button>
              </Alert>
            );
          })}
        </div>
      )}

      {/* Alerte de Dotation Administrative (Matériel en votre possession) */}
      {activeEquipmentAssignments.length > 0 && (
        <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/5 rounded-2xl shadow-md p-6 flex flex-col items-start gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
            <div className="space-y-2 flex-1">
              <AlertTitle className="text-base font-extrabold text-amber-800 uppercase flex items-center gap-2">
                ⚠️ Alerte de Dotation Administrative : Équipement en votre possession
              </AlertTitle>
              <AlertDescription className="text-sm text-amber-900 leading-relaxed space-y-3">
                <p>
                  La hiérarchie militaire signale que vous détenez actuellement du matériel réglementaire non encore enregistré comme retourné. Vous devez veiller à son intégrité absolue et le restituer dès la fin de votre service.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 mt-3">
                  {activeEquipmentAssignments.map((assignment) => {
                    const weapon = weaponsById[assignment.weaponId];
                    return (
                      <div key={assignment.id} className="p-3 bg-background border border-amber-500/20 rounded-xl space-y-1.5 shadow-sm text-foreground">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-foreground text-sm">
                            {weapon?.model || 'Équipement'}
                          </span>
                          <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-700 text-[10px] font-bold">
                            {weapon?.type || 'Matériel'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                          <p>N° Série : <span className="font-bold text-foreground">{weapon?.serialNumber || 'N/A'}</span></p>
                          <p>Sortie le : <span className="font-bold text-foreground">{assignment.assignedAt?.toDate().toLocaleString('fr-FR')}</span></p>
                          {(assignment.ammunitionCount || 0) > 0 && (
                            <p>Munitions : <span className="font-bold text-emerald-600">{assignment.ammunitionCount} unités</span></p>
                          )}
                          {(assignment.magazineCount || 0) > 0 && (
                            <p>Chargeurs : <span className="font-bold text-emerald-600">{assignment.magazineCount} unités</span></p>
                          )}
                        </div>
                        {assignment.notes && (
                          <p className="text-[11px] italic text-muted-foreground border-t border-muted pt-1 mt-1">
                            Note : {assignment.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* Alert Banner for Pending Explanation Requests */}
      {pendingExplications.length > 0 && (
        <div className="space-y-4">
          {pendingExplications.map((exp) => (
            <Card key={exp.id} className="border-destructive/40 bg-destructive/5 rounded-2xl shadow-md overflow-hidden">
              <CardHeader className="bg-destructive/10 pb-3 flex flex-row items-center gap-2">
                <HelpCircle className="h-5 w-5 text-destructive animate-pulse shrink-0" />
                <div>
                  <CardTitle className="text-base font-extrabold text-destructive">DEMANDE D'EXPLICATION REQUISE</CardTitle>
                  <CardDescription className="text-xs text-destructive/80 font-medium">
                    Une demande d'explication vous a été adressée par l'administration.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="bg-background/80 p-3 rounded-xl border border-destructive/20 space-y-1">
                  <div className="text-xs text-muted-foreground font-mono">
                    Envoyée le {exp.requestDate?.toDate().toLocaleDateString('fr-FR')} à {exp.requestDate?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <p className="font-bold text-foreground text-sm leading-relaxed">
                    « {exp.requestText} »
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`reply-${exp.id}`} className="text-xs font-bold text-foreground">Votre réponse explicative *</Label>
                  <Textarea
                    id={`reply-${exp.id}`}
                    placeholder="Saisissez votre réponse ou justification de manière détaillée..."
                    value={replies[exp.id] || ''}
                    onChange={(e) => setReplies(prev => ({ ...prev, [exp.id]: e.target.value }))}
                    rows={3}
                    className="bg-background text-sm"
                    required
                    disabled={countdown[exp.id] > 0}
                  />
                </div>

                {countdown[exp.id] > 0 ? (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-orange-600 dark:text-orange-400 font-bold">
                      <Clock className="h-4 w-4 animate-spin text-orange-600 dark:text-orange-400 shrink-0" />
                      <span>Envoi de votre réponse explicative dans {countdown[exp.id]} secondes...</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelSend(exp.id)}
                        className="rounded-lg text-xs font-semibold border-orange-500/30 text-orange-600 hover:bg-orange-500/10 cursor-pointer h-8"
                      >
                        Annuler et modifier la réponse
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleImmediateSend(exp.id)}
                        className="rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white cursor-pointer h-8"
                        disabled={replySubmitting[exp.id]}
                      >
                        Confirmer et envoyer maintenant
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleReplyExplication(exp.id)}
                    className="rounded-xl flex items-center justify-center gap-2 font-semibold text-white bg-destructive hover:bg-destructive/90 cursor-pointer"
                    disabled={replySubmitting[exp.id] || !replies[exp.id]?.trim()}
                  >
                    {replySubmitting[exp.id] ? (
                      <span>Transmission...</span>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Envoyer ma réponse explicative
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alert Banner for Applied Sanctions */}
      {unnotifiedSanctions.length > 0 && (
        <div className="space-y-4">
          {unnotifiedSanctions.map((exp) => (
            <Card key={exp.id} className="border-orange-500/40 bg-orange-500/5 rounded-2xl shadow-md overflow-hidden">
              <CardHeader className="bg-orange-500/10 pb-3 flex flex-row items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 animate-pulse shrink-0" />
                <div>
                  <CardTitle className="text-base font-extrabold text-orange-800 dark:text-orange-300">SANCTION ADMINISTRATIVE APPLIQUÉE</CardTitle>
                  <CardDescription className="text-xs text-orange-700/80 dark:text-orange-400/80 font-medium">
                    Une sanction a été décidée par l'administration suite à votre explication.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold">Votre explication envoyée :</span>
                  <p className="italic bg-background/50 p-2.5 rounded border border-border text-xs text-foreground">
                    « {exp.replyText} »
                  </p>
                </div>
                <div className="bg-orange-500/10 p-3.5 rounded-xl border border-orange-500/20 space-y-1">
                  <div className="text-[10px] text-orange-700 dark:text-orange-400 font-bold uppercase tracking-wider">
                    Sanction prononcée :
                  </div>
                  <p className="font-extrabold text-foreground text-sm leading-relaxed">
                    « {exp.sanctionText} »
                  </p>
                  {exp.sanctionDate && (
                    <div className="text-[10px] text-muted-foreground font-mono mt-1 text-right">
                      Notifié le {exp.sanctionDate.toDate().toLocaleDateString('fr-FR')} à {exp.sanctionDate.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => handleAcknowledgeSanction(exp.id)}
                  className="rounded-xl flex items-center justify-center gap-1.5 font-bold text-white bg-orange-600 hover:bg-orange-500 text-xs py-1.5 px-3 h-8 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accuser réception de la sanction
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alert Banner for Admin Decision Updates */}
      {unnotifiedDemandes.length > 0 && (
        <div className="space-y-3">
          {unnotifiedDemandes.map((dem) => (
            <Alert key={dem.id} className={dem.status === 'acceptee' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}>
              <AlertCircle className={`h-4 w-4 ${dem.status === 'acceptee' ? 'text-emerald-500' : 'text-destructive'}`} />
              <AlertTitle className="font-bold">
                Mise à jour de demande ({dem.type})
              </AlertTitle>
              <AlertDescription className="mt-1 flex flex-col gap-1 text-sm">
                <span>
                  Votre demande pour la période du <strong>{dem.startDate.toDate().toLocaleDateString('fr-FR')}</strong> au{' '}
                  <strong>{dem.endDate.toDate().toLocaleDateString('fr-FR')}</strong> a été{' '}
                  <strong className={dem.status === 'acceptee' ? 'text-emerald-600' : 'text-destructive'}>
                    {dem.status === 'acceptee' ? 'ACCEPTÉE' : 'REFUSÉE'}
                  </strong>.
                </span>
                {dem.comment && (
                  <span className="text-xs bg-black/10 dark:bg-white/10 p-2 rounded mt-1 border border-border italic">
                    <strong>Motif de décision :</strong> {dem.comment}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          ))}
          <Button variant="outline" size="sm" onClick={() => setUnnotifiedDemandes([])}>
            Fermer les notifications
          </Button>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {/* New Request Form Card */}
        <Card className="md:col-span-1 rounded-2xl border border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Nouvelle demande
            </CardTitle>
            <CardDescription>
              Formulez une demande de permission ou de congé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="permission-type">Type de permission *</Label>
                <select
                  id="permission-type"
                  value={permissionType}
                  onChange={(e) => setPermissionType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  <option value="Permission exceptionnelle">Permission exceptionnelle</option>
                  <option value="Congé annuel">Congé annuel</option>
                  <option value="Congé maladie">Congé maladie</option>
                  <option value="Récupération">Récupération</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Date de début *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">Date de fin *</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Motif *</Label>
                <Textarea
                  id="reason"
                  placeholder="Justification ou motif de votre absence..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl flex items-center justify-center gap-2 font-semibold text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Transmission...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Envoyer la demande
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Requests Tracker List Card */}
        <Card className="md:col-span-2 rounded-2xl border border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Suivi de mes demandes</CardTitle>
            <CardDescription>
              Historique et statut de vos demandes de permissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {demandesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Chargement de l’historique...</p>
              </div>
            ) : sortedDemandes.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDemandes.map((dem) => (
                      <TableRow key={dem.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{dem.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {dem.startDate.toDate().toLocaleDateString('fr-FR')} au <br />
                          {dem.endDate.toDate().toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm" title={dem.reason}>
                          {dem.reason ? (
                            <span className="italic">« {dem.reason} »</span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Aucun motif</span>
                          )}
                          {dem.status === 'refusee' && dem.comment && (
                            <div className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded border border-destructive/20 font-sans">
                              <strong>Refus :</strong> {dem.comment}
                            </div>
                          )}
                          {dem.status === 'acceptee' && dem.comment && (
                            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 bg-emerald-500/10 p-1 rounded border border-emerald-500/20 font-sans">
                              <strong>Note :</strong> {dem.comment}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(dem.status)}</TableCell>
                        <TableCell className="text-right">
                          {dem.status === 'acceptee' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateAutorisationAbsencePDF(dem, currentAgent)}
                              className="text-xs h-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 font-semibold gap-1"
                              title="Télécharger l'autorisation (PDF)"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                              <span>PDF</span>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16 border rounded-lg border-dashed border-muted text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto opacity-30 mb-3 text-primary" />
                <p className="font-semibold text-foreground text-sm">Aucune demande enregistrée</p>
                <p className="text-xs mt-1">Vos demandes soumises s'afficheront dans cette liste.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Explanation Requests History Card */}
      <Card className="rounded-2xl border border-border/80 shadow-md mt-6">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-orange-600" />
            Historique de mes demandes d'explication
          </CardTitle>
          <CardDescription>
            Retrouvez l'historique complet des demandes d'explications qui vous ont été adressées ainsi que vos réponses et les éventuelles sanctions administratives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {explications && explications.length > 0 ? (
            <div className="space-y-4">
              {explications.map((exp) => {
                const reqDate = exp.requestDate ? (typeof exp.requestDate.toDate === 'function' ? exp.requestDate.toDate() : new Date(exp.requestDate as any)) : null;
                const repDate = exp.replyDate ? (typeof exp.replyDate.toDate === 'function' ? exp.replyDate.toDate() : new Date(exp.replyDate as any)) : null;
                const sancDate = exp.sanctionDate ? (typeof exp.sanctionDate.toDate === 'function' ? exp.sanctionDate.toDate() : new Date(exp.sanctionDate as any)) : null;

                return (
                  <div key={exp.id} className="p-4 rounded-xl border bg-card text-xs space-y-3 shadow-sm hover:border-orange-500/20 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                      <span className="text-muted-foreground font-mono">
                        Reçue le {reqDate ? reqDate.toLocaleDateString('fr-FR') : 'N/A'} à {reqDate ? reqDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </span>
                      <div className="flex items-center gap-2">
                        {exp.status === 'en_attente' && (
                          <Badge variant="outline" className="text-orange-600 bg-orange-500/10 border-orange-500/20">
                            En attente de réponse
                          </Badge>
                        )}
                        {exp.status === 'repondu' && (
                          <Badge variant="secondary" className="text-blue-600 bg-blue-500/10 border-blue-500/20">
                            Répondu - En attente d'arbitrage
                          </Badge>
                        )}
                        {(exp.status === 'lu' || exp.status === 'archive' || exp.status === 'accepte') && (
                          <Badge variant="outline" className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                            Pris acte (Sans sanction)
                          </Badge>
                        )}
                        {exp.status === 'sanctionne' && (
                          <Badge variant="destructive" className="text-red-600 bg-red-500/10 border-red-500/20 font-bold">
                            Sanctionné
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <div className="font-bold text-muted-foreground mb-1">Motif de l'administration :</div>
                      <p className="font-semibold bg-muted/40 p-2.5 rounded border border-border mt-1">« {exp.requestText} »</p>
                    </div>

                    {exp.replyText ? (
                      <div className="pt-2 border-t border-dashed">
                        <div className="font-bold text-primary mb-1">Votre réponse explicative :</div>
                        <p className="italic bg-primary/5 p-2.5 rounded border border-primary/10">« {exp.replyText} »</p>
                        {repDate && (
                          <div className="text-[10px] text-muted-foreground text-right font-mono mt-1">
                            Envoyée le {repDate.toLocaleDateString('fr-FR')} à {repDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-orange-600/80 font-medium italic">Vous n'avez pas encore répondu à cette demande d'explication.</div>
                    )}

                    {exp.status === 'sanctionne' && exp.sanctionText && (
                      <div className="bg-orange-500/10 p-3.5 rounded-xl border border-orange-500/20 space-y-1 mt-2">
                        <div className="text-[10px] text-orange-700 font-bold uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Sanction prononcée par l'autorité :
                        </div>
                        <p className="font-extrabold text-foreground text-sm">
                          « {exp.sanctionText} »
                        </p>
                        {sancDate && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-1 text-right">
                            Prononcée le {sancDate.toLocaleDateString('fr-FR')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
              <HelpCircle className="h-10 w-10 mx-auto opacity-30 mb-2" />
              <p className="font-semibold text-foreground text-sm">Aucun historique d'explications</p>
              <p className="text-xs mt-1">Vous n'avez aucune demande d'explication enregistrée dans votre dossier.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Downloadable Absence Authorizations History Card */}
      <Card className="rounded-2xl border border-border/80 shadow-md mt-6 bg-emerald-500/5 border-emerald-500/10">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Historique de vos autorisations d'absence (Fichiers PDF)
          </CardTitle>
          <CardDescription>
            Téléchargez à tout moment vos fiches d'autorisation d'absence signées et cachetées par la direction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedDemandes.filter(d => d.status === 'acceptee').length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {sortedDemandes.filter(d => d.status === 'acceptee').map((dem) => (
                <div key={dem.id} className="p-4 rounded-xl border bg-card hover:bg-muted/10 transition-colors flex flex-col justify-between gap-3 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        {dem.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {dem.startDate.toDate().toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs font-semibold mt-2 text-foreground truncate" title={dem.reason}>
                      Motif : « {dem.reason || 'N/A'} »
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Du {dem.startDate.toDate().toLocaleDateString('fr-FR')} au {dem.endDate.toDate().toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generateAutorisationAbsencePDF(dem, currentAgent)}
                    className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 cursor-pointer"
                  >
                    <FileDown className="h-4 w-4" />
                    Télécharger l'autorisation (PDF)
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">Aucune autorisation d'absence signée disponible pour le moment.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Loader2({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
