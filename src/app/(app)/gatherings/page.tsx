
'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Plus, UserCheck, UserX, Users, ListChecks, QrCode, FileDown, Trash2, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, doc } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent, Gathering } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from '@/hooks/use-role';
import { useDetachement } from '@/context/detachement-context';
import { useLogo } from '@/context/logo-context';
import { CreateGatheringForm } from '@/components/gatherings/create-gathering-sheet';
import { ManageAttendanceDialog } from '@/components/gatherings/manage-attendance-dialog';
import { ViewAttendanceDialog } from '@/components/gatherings/view-attendance-dialog';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { logActivity } from '@/lib/activity-logger';
import { ClientOnly } from '@/components/layout/client-only';


export default function GatheringsPage() {
  return (
    <ClientOnly>
      <GatheringsContent />
    </ClientOnly>
  );
}

function GatheringsContent() {
  const { isObserver } = useRole();
  const { logo } = useLogo();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [attendanceGatheringId, setAttendanceGatheringId] = useState<string | null>(null);
  const [viewingAttendanceId, setViewingAttendanceId] = useState<string | null>(null);
  const [gatheringToDelete, setGatheringToDelete] = useState<Gathering | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();

  const gatheringsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'gatherings') : null),
    [firestore]
  );
  const agentsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'agents') : null),
    [firestore]
  );

  const { data: gatherings, isLoading: gatheringsLoading } = useCollection<Gathering>(gatheringsQuery);
  const { data: agents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);

  const attendanceGathering = useMemo(
    () => gatherings?.find((g) => g.id === attendanceGatheringId) || null,
    [gatherings, attendanceGatheringId]
  );

  const viewingAttendance = useMemo(
    () => gatherings?.find((g) => g.id === viewingAttendanceId) || null,
    [gatherings, viewingAttendanceId]
  );
  
  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);

  const { selectedDetachement } = useDetachement();

  const sortedGatherings = useMemo(() => {
    if (!gatherings) return [];
    return [...gatherings].sort((a, b) => b.dateTime.toMillis() - a.dateTime.toMillis());
  }, [gatherings]);

  const filteredGatherings = useMemo(() => {
    if (!sortedGatherings) return [];
    if (!selectedDetachement || selectedDetachement === 'ALL') return sortedGatherings;
    return sortedGatherings.filter(g => {
      const assigned = (g.assignedAgentIds || []).map(id => agentsById[id]).filter(Boolean);
      if (assigned.length > 0) {
        return assigned.some(a => a.section === selectedDetachement);
      }
      return true;
    });
  }, [sortedGatherings, selectedDetachement, agentsById]);

  const handleDeleteGathering = async () => {
    if (!firestore || !gatheringToDelete) return;

    const gatheringRef = doc(firestore, 'gatherings', gatheringToDelete.id);
    deleteDoc(gatheringRef).then(() => {
      toast({
        title: 'Rassemblement supprimé',
        description: `Le rassemblement "${gatheringToDelete.name}" a été supprimé.`,
      });
      logActivity(firestore, `Le rassemblement "${gatheringToDelete.name}" a été supprimé.`, 'Rassemblement', '/gatherings');
    }).catch(() => {
      const permissionError = new FirestorePermissionError({
        path: gatheringRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
    setGatheringToDelete(null);
  };

  const handleExportGatheringPDF = async (gathering: Gathering) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const dateTime = gathering.dateTime.toDate().toLocaleString('fr-FR');

    const assignedAgents = (gathering.assignedAgentIds || [])
      .map((id) => agentsById[id])
      .filter((a): a is Agent => !!a)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const body = assignedAgents.map((agent) => {
      const isAbsent = (gathering.absentAgentIds || []).includes(agent.id);
      const qrTime = gathering.attendanceTimestamps?.[agent.id]
        ? new Date(gathering.attendanceTimestamps[agent.id]).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : null;
      const statusText = isAbsent ? 'Absent' : qrTime ? `Présent (QR ${qrTime})` : 'Présent';
      return [
        agent.fullName,
        agent.registrationNumber || 'N/A',
        agent.rank || 'N/A',
        statusText,
      ];
    });

    const renderPdf = (img?: HTMLImageElement) => {
      let currentY = 15;
      if (img) {
        const aspectRatio = img.width / img.height;
        const logoWidth = 24;
        const logoHeight = logoWidth / aspectRatio;
        pdf.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, currentY, logoWidth, logoHeight);
        currentY += logoHeight + 8;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text("BRIGADE SPECIALE DE SURVEILLANCE ET D'INTERVENTION", pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;

      pdf.setFontSize(16);
      pdf.text(`Rassemblement : ${gathering.name}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 7;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Feuille de présence complète — ${dateTime}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;

      autoTable(pdf, {
        head: [['Nom complet', 'Matricule', 'Grade', 'Statut']],
        body,
        startY: currentY,
        theme: 'striped',
        headStyles: { fillColor: [26, 43, 76] },
      });

      pdf.save(`presence_${gathering.name.replace(/\s+/g, '_')}.pdf`);
      toast({
        title: 'PDF généré',
        description: `La feuille de présence pour "${gathering.name}" a été téléchargée.`,
      });
    };

    if (logo) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => renderPdf(img);
      img.onerror = () => renderPdf();
      img.src = logo;
    } else {
      renderPdf();
    }
  };

  const getStatus = (gathering: Gathering) => {
    return gathering.dateTime.toDate() > new Date() ? 'À venir' : 'Passé';
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader icon={CalendarClock} title="Rassemblements" description="Rassemblements des agents et suivi des présences.">
        {!isObserver && (
          <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 font-semibold">
                <Plus className="h-4 w-4" />
                Créer un rassemblement
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
                <DialogTitle className="sr-only">Créer un nouveau rassemblement</DialogTitle>
                <CreateGatheringForm onGatheringCreated={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Date et Heure</TableHead>
              <TableHead>Agents Assignés</TableHead>
              <TableHead>Présence</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gatheringsLoading || agentsLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Chargement des rassemblements...</TableCell>
              </TableRow>
            ) : filteredGatherings.length > 0 ? (
              filteredGatherings.map((gathering) => {
                const assignedCount = gathering.assignedAgentIds.length;
                const absentCount = gathering.absentAgentIds.length;
                const presentCount = assignedCount - absentCount;
                const status = getStatus(gathering);

                return (
                  <TableRow key={gathering.id}>
                    <TableCell className="font-medium">{gathering.name}</TableCell>
                    <TableCell>{gathering.dateTime.toDate().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{assignedCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-green-600">
                            <UserCheck className="h-4 w-4" />
                            <span>{presentCount}</span>
                        </div>
                        <div className="flex items-center gap-1 text-red-600">
                            <UserX className="h-4 w-4" />
                            <span>{absentCount}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status === 'Passé' ? 'outline' : 'secondary'}>{status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            aria-haspopup="true"
                            aria-label={`Menu d'actions pour ${gathering.name}`}
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 cursor-pointer hover:bg-accent"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Actions du rassemblement</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onSelect={() => {
                              setTimeout(() => setViewingAttendanceId(gathering.id), 0);
                            }}
                          >
                            <ListChecks className="mr-2 h-4 w-4" />
                            <span>Afficher les listes</span>
                          </DropdownMenuItem>
                          {!isObserver && (
                            <DropdownMenuItem
                              className="cursor-pointer font-medium text-primary focus:text-primary"
                              onSelect={() => {
                                setTimeout(() => setAttendanceGatheringId(gathering.id), 0);
                              }}
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              <span>Pointage par Scan QR</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onSelect={() => {
                              handleExportGatheringPDF(gathering);
                            }}
                          >
                            <FileDown className="mr-2 h-4 w-4" />
                            <span>Exporter en PDF</span>
                          </DropdownMenuItem>
                          {!isObserver && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                                onSelect={() => {
                                  setTimeout(() => setGatheringToDelete(gathering), 0);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Supprimer</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aucun rassemblement trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {attendanceGathering && (
        <ManageAttendanceDialog
          isOpen={!!attendanceGathering}
          onOpenChange={(open) => !open && setAttendanceGatheringId(null)}
          gathering={attendanceGathering}
          agents={agents || []}
          initialTab="scanner"
        />
      )}
      
       {viewingAttendance && (
        <ViewAttendanceDialog
            isOpen={!!viewingAttendance}
            onOpenChange={(open) => !open && setViewingAttendanceId(null)}
            gathering={viewingAttendance}
            agentsById={agentsById}
        />
       )}

      {gatheringToDelete && (
        <AlertDialog open={!!gatheringToDelete} onOpenChange={(open) => !open && setGatheringToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Le rassemblement{' '}
                <span className="font-semibold">{gatheringToDelete.name}</span> sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setGatheringToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteGathering} className="bg-destructive hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
