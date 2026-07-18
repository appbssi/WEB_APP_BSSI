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
import { Calendar, AlertCircle, CheckCircle2, Clock, XCircle, Send } from 'lucide-react';
import type { Demande, Agent } from '@/lib/types';

export default function DemandesPage() {
  return (
    <ClientOnly>
      <DemandesContent />
    </ClientOnly>
  );
}

function DemandesContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const isMounted = useIsMounted();

  const [userIdc, setUserIdc] = useState<string>('');
  
  // Form States
  const [permissionType, setPermissionType] = useState<string>('Permission exceptionnelle');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Alert for new updates
  const [unnotifiedDemandes, setUnnotifiedDemandes] = useState<Demande[]>([]);

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
    return agents.find(a => 
      a.id.trim().toUpperCase() === cleanIdc || 
      a.id.trim().toUpperCase().substring(0, 6) === cleanIdc ||
      (a.registrationNumber && a.registrationNumber.trim().toUpperCase() === cleanIdc)
    );
  }, [agents, userIdc]);

  const agentDisplayName = useMemo(() => {
    if (currentAgent) {
      return currentAgent.fullName;
    }
    return userIdc ? `Agent (${userIdc})` : 'Agent';
  }, [currentAgent, userIdc]);

  // Fetch requests for this agent
  const demandesQuery = useMemoFirebase(() => {
    if (!firestore || !userIdc) return null;
    return query(
      collection(firestore, 'demandes'),
      where('agentId', '==', userIdc)
    );
  }, [firestore, userIdc]);

  const { data: demandes, isLoading: demandesLoading } = useCollection<Demande>(demandesQuery);

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
        reason: reason.trim() || '',
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
                        </TableCell>
                        <TableCell>{getStatusBadge(dem.status)}</TableCell>
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
