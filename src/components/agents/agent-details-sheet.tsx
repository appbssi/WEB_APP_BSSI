
'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Agent, Availability, Mission, Explication } from '@/lib/types';
import { User, Shield, Phone, MapPin, Briefcase, Printer, QrCode, PanelRight, Maximize2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { getDisplayStatus } from '@/lib/missions';
import Image from 'next/image';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, Timestamp } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { generateFicheAgentPDF } from '@/lib/pdf-generator';
import { AgentQRBadgeDialog } from './agent-qr-badge-dialog';
import { cn } from '@/lib/utils';

interface AgentDetailsProps {
  agent: Agent & { availability: Availability };
  missions: Mission[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AgentDetailsSheet({ agent, missions, isOpen, onOpenChange }: AgentDetailsProps) {
  const firestore = useFirestore();
  const { isAdmin } = useRole();
  const { toast } = useToast();
  const [requestText, setRequestText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<'modal' | 'sheet'>('modal');
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    const checkViewport = () => {
      if (typeof window === 'undefined') return;
      const compact = window.innerWidth < 768;
      setIsCompactViewport(compact);
      if (compact) {
        setDisplayMode('modal');
      }
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const explicationsQuery = useMemoFirebase(() => {
    if (!firestore || !agent) return null;
    return query(
      collection(firestore, 'explications'),
      where('agentId', '==', agent.id)
    );
  }, [firestore, agent]);

  const { data: explications, isLoading: explicationsLoading } = useCollection<Explication>(explicationsQuery);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestText.trim() || !firestore || !agent) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(firestore, 'explications'), {
        agentId: agent.id,
        agentName: agent.fullName,
        requestText: requestText.trim(),
        requestDate: Timestamp.now(),
        replyText: '',
        replyDate: null,
        status: 'en_attente',
        notifiedAgent: false,
        notifiedAdmin: false,
      });
      setRequestText('');
      toast({
        title: "Demande envoyée",
        description: `La demande d'explication a été envoyée à l'agent ${agent.fullName}.`,
      });
    } catch (error) {
      console.error('Error sending explanation request:', error);
      toast({
        variant: 'destructive',
        title: "Erreur",
        description: "Impossible d'envoyer la demande d'explication.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBadgeVariant = (availability: Availability) => {
    switch (availability) {
      case 'Disponible':
        return 'outline';
      case 'En mission':
        return 'default';
      case 'En congé':
        return 'destructive';
      case 'En permission':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const sortedMissions = [...missions].sort((a, b) => {
    const timeA = typeof a.startDate?.toMillis === 'function' ? a.startDate.toMillis() : new Date(a.startDate as any).getTime();
    const timeB = typeof b.startDate?.toMillis === 'function' ? b.startDate.toMillis() : new Date(b.startDate as any).getTime();
    return timeB - timeA;
  });

  const activeMode = isCompactViewport ? 'modal' : displayMode;

  const headerActions = (
    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-start sm:justify-end">
      {!isCompactViewport && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5 cursor-pointer text-xs h-9 text-muted-foreground hover:text-foreground"
          onClick={() => setDisplayMode((prev) => (prev === 'modal' ? 'sheet' : 'modal'))}
          title={activeMode === 'modal' ? 'Basculer en panneau latéral' : 'Basculer en fenêtre centrée'}
        >
          {activeMode === 'modal' ? <PanelRight className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden md:inline">
            {activeMode === 'modal' ? 'Volet droite' : 'Fenêtre centrée'}
          </span>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 cursor-pointer border-[#1a2b4c]/30 hover:bg-[#1a2b4c]/10 text-[#1a2b4c] dark:text-blue-300 font-sans text-xs h-9"
        onClick={() => setIsQrOpen(true)}
      >
        <QrCode className="h-4 w-4" />
        <span className="hidden sm:inline">Badge &amp; Code QR</span>
        <span className="inline sm:hidden">Badge QR</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2 cursor-pointer border-primary/20 hover:bg-primary/5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-sans text-xs h-9"
        onClick={() => generateFicheAgentPDF(agent, missions, explications || [])}
      >
        <Printer className="h-4 w-4" />
        <span className="hidden sm:inline">Imprimer Fiche Technique</span>
        <span className="inline sm:hidden">Fiche Tech</span>
      </Button>
    </div>
  );

  const bodyContent = (
    <div className="p-4 sm:p-6 space-y-6 pb-8">
      {/* En-tête de profil */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 pt-1">
        <div className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 rounded-2xl border-4 border-primary/10 overflow-hidden flex items-center justify-center bg-muted text-muted-foreground shadow-lg shrink-0">
          {agent.photo ? (
            <Image
              src={agent.photo}
              alt={agent.fullName}
              width={128}
              height={128}
              className="object-cover h-full w-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <User className="h-12 w-12 opacity-50" />
          )}
        </div>
        <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground break-words">
            {agent.fullName}
          </h2>
          <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs px-2.5 py-0.5">
              MATRICULE : {agent.registrationNumber || 'N/A'}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px] sm:text-xs px-2.5 py-0.5">
              IDC : {(agent.id || '').substring(0, 6).toUpperCase()}
            </Badge>
            <Badge variant={getBadgeVariant(agent.availability)} className="text-[10px] sm:text-xs px-2.5 py-0.5">
              {agent.availability}
            </Badge>
          </div>
          <p className="text-muted-foreground font-medium text-xs sm:text-sm pt-1">
            Affecté à la brigade en tant que personnel opérationnel.
          </p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className={cn("grid gap-2.5 sm:gap-3", activeMode === 'modal' ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3")}>
        <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 flex flex-col items-center justify-center space-y-1 text-center min-w-0">
          <span className="text-[9px] sm:text-[10px] text-primary/70 uppercase font-bold tracking-wider truncate w-full">Missions</span>
          <div className="flex items-center gap-1.5 font-black text-lg sm:text-xl text-primary">
            <Shield className="h-4 w-4 shrink-0" />
            <span>{agent.missionCount || 0}</span>
          </div>
        </div>
        <div className="bg-muted/50 p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 text-center min-w-0">
          <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate w-full">Section</span>
          <span className="font-bold text-xs break-words w-full">{(agent.section || 'Non assigné').toUpperCase()}</span>
        </div>
        <div className="bg-muted/50 p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 text-center min-w-0">
          <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate w-full">Grade</span>
          <span className="font-bold text-xs break-words w-full">{agent.rank}</span>
        </div>
        <div className="bg-orange-500/5 p-3 rounded-xl border border-orange-500/10 flex flex-col items-center justify-center space-y-1 text-center min-w-0">
          <span className="text-[9px] sm:text-[10px] text-orange-600 dark:text-orange-400 uppercase font-bold tracking-wider truncate w-full">Explications</span>
          <span className="font-black text-lg sm:text-xl text-orange-600 dark:text-orange-400">
            {explications ? explications.length : 0}
          </span>
        </div>
        <div className={cn("bg-red-500/5 p-3 rounded-xl border border-red-500/10 flex flex-col items-center justify-center space-y-1 text-center min-w-0", activeMode === 'sheet' && "col-span-2 sm:col-span-1")}>
          <span className="text-[9px] sm:text-[10px] text-red-600 dark:text-red-400 uppercase font-bold tracking-wider truncate w-full">Sanctions</span>
          <span className="font-black text-lg sm:text-xl text-red-600 dark:text-red-400">
            {explications ? explications.filter(e => e.status === 'sanctionne').length : 0}
          </span>
        </div>
      </div>

      {/* Détails personnels */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">Informations Générales</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 p-3.5 bg-card border rounded-xl shadow-sm min-w-0">
            <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Contact</p>
              <p className="text-xs sm:text-sm font-semibold break-words">{agent.contact || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3.5 bg-card border rounded-xl shadow-sm min-w-0">
            <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Adresse Résidentielle</p>
              <p className="text-xs sm:text-sm font-semibold break-words">{agent.address || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3.5 bg-card border rounded-xl shadow-sm sm:col-span-2 min-w-0">
            <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Affectation Administrative</p>
              <p className="text-xs sm:text-sm font-semibold break-words">
                {agent.rank} • Section {(agent.section || 'Non assignée').toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Historique des missions */}
      <div className="space-y-3">
        <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">
          Registre d&apos;Activité (Missions — {sortedMissions.length})
        </h3>
        <div className="border rounded-xl overflow-x-auto bg-card shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Mission</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Période</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMissions.length > 0 ? (
                sortedMissions.map(mission => (
                  <TableRow key={mission.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="py-3">
                      <div className="font-bold text-xs sm:text-sm leading-tight text-foreground">{mission.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{mission.location}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs font-medium whitespace-nowrap">
                      {mission.startDate.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      <span className="mx-1 text-muted-foreground">→</span>
                      {mission.endDate.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Badge
                        className="text-[9px] font-bold h-5 px-2 tracking-tight"
                        variant={
                          getDisplayStatus(mission, new Date()) === 'Terminée'
                            ? 'outline'
                            : getDisplayStatus(mission, new Date()) === 'Annulée'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {getDisplayStatus(mission, new Date())?.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-xs italic">
                    <div className="flex flex-col items-center gap-2">
                      <Shield className="h-7 w-7 opacity-15" />
                      <span>Aucun déploiement enregistré pour cet agent.</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Section Demandes d'Explication (Admin only) */}
      {isAdmin && (
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] px-1">
            Demandes d&apos;Explication
          </h3>

          <form onSubmit={handleSendRequest} className="space-y-3 bg-muted/20 p-4 rounded-xl border">
            <h4 className="text-sm font-bold">Nouvelle demande d&apos;explication</h4>
            <div className="space-y-2">
              <Textarea
                placeholder="Saisissez le motif ou la question d'explication (ex: Justification de l'absence du 18 juillet)..."
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                rows={3}
                className="bg-background text-sm"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full sm:w-auto font-semibold cursor-pointer"
              disabled={isSubmitting || !requestText.trim()}
            >
              {isSubmitting ? "Envoi..." : "Envoyer la demande"}
            </Button>
          </form>

          <div className="space-y-3">
            <h4 className="text-sm font-bold">Historique des demandes ({explications?.length || 0})</h4>
            {explicationsLoading ? (
              <p className="text-xs text-muted-foreground italic">Chargement...</p>
            ) : explications && explications.length > 0 ? (
              <div className="space-y-3">
                {explications.map((exp) => (
                  <div key={exp.id} className="p-3 rounded-xl border bg-card text-xs space-y-2 shadow-sm">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <span className="text-muted-foreground font-mono">
                        Envoyée le {exp.requestDate?.toDate().toLocaleDateString('fr-FR')} à {exp.requestDate?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge
                        variant={exp.status === 'en_attente' ? 'outline' : 'secondary'}
                        className={
                          exp.status === 'en_attente'
                            ? 'text-orange-600 bg-orange-500/10 border-orange-500/20'
                            : 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
                        }
                      >
                        {exp.status === 'en_attente' ? 'En attente' : 'Répondu'}
                      </Badge>
                    </div>
                    <p className="font-semibold bg-muted/50 p-2 rounded text-foreground break-words">
                      « {exp.requestText} »
                    </p>
                    {exp.status === 'repondu' && exp.replyText && (
                      <div className="space-y-1 pt-2 border-t border-border mt-2">
                        <div className="text-primary font-bold">Réponse de l&apos;agent :</div>
                        <p className="italic bg-primary/5 p-2 rounded text-foreground break-words">
                          « {exp.replyText} »
                        </p>
                        {exp.replyDate && (
                          <div className="text-[10px] text-muted-foreground text-right font-mono mt-1">
                            Le {exp.replyDate.toDate().toLocaleDateString('fr-FR')} à {exp.replyDate.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Aucune demande d&apos;explication envoyée à cet agent.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {activeMode === 'modal' ? (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[92vw] sm:max-w-3xl lg:max-w-4xl max-h-[92dvh] p-0 overflow-hidden flex flex-col gap-0 rounded-2xl bg-background/95 backdrop-blur-md shadow-2xl border">
            <DialogHeader className="shrink-0 p-4 sm:p-5 pr-12 border-b bg-background/95 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-bold">Profil de l&apos;Agent</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Consultez toutes les informations détaillées et le registre d&apos;activité de l&apos;élément.
                </DialogDescription>
              </div>
              {headerActions}
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {bodyContent}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className="w-[calc(100vw-1rem)] sm:max-w-2xl bg-background/95 backdrop-blur-md shadow-2xl border-l p-0 overflow-hidden flex flex-col gap-0 h-[100dvh] max-h-[100dvh]"
          >
            <SheetHeader className="shrink-0 p-4 sm:p-5 pr-12 border-b bg-background/95 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
              <div className="min-w-0">
                <SheetTitle className="text-lg sm:text-xl font-bold">Profil de l&apos;Agent</SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">
                  Consultez toutes les informations détaillées et le registre d&apos;activité de l&apos;élément.
                </SheetDescription>
              </div>
              {headerActions}
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {bodyContent}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AgentQRBadgeDialog
        agent={agent}
        isOpen={isQrOpen}
        onOpenChange={setIsQrOpen}
      />
    </>
  );
}
