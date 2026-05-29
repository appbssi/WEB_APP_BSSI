
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, PlusCircle, UserCheck, UserX, Users } from 'lucide-react';
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
import { collection, deleteDoc, doc } from 'firebase/firestore';
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
import { CreateGatheringForm } from '@/components/gatherings/create-gathering-sheet';
import { ManageAttendanceDialog } from '@/components/gatherings/manage-attendance-dialog';
import { ViewAttendanceDialog } from '@/components/gatherings/view-attendance-dialog';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { logActivity } from '@/lib/activity-logger';
import { useIsMounted } from '@/hooks/use-is-mounted';
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
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedGathering, setSelectedGathering] = useState<Gathering | null>(null);
  const [viewingAttendance, setViewingAttendance] = useState<Gathering | null>(null);
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
  
  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);

  const sortedGatherings = useMemo(() => {
    if (!gatherings) return [];
    return [...gatherings].sort((a, b) => b.dateTime.toMillis() - a.dateTime.toMillis());
  }, [gatherings]);

  const handleDeleteGathering = async () => {
    if (!firestore || !gatheringToDelete) return;

    const gatheringRef = doc(firestore, 'gatherings', gatheringToDelete.id);
    deleteDoc(gatheringRef).then(() => {
      toast({
        title: 'Rassemblement supprimé',
        description: `Le rassemblement "${gatheringToDelete.name}" a été supprimé.`,
      });
      logActivity(firestore, `Le rassemblement "${gatheringToDelete.name}" a été supprimé.`, 'Rassemblement', '/gatherings');
    }).catch((serverError) => {
      const permissionError = new FirestorePermissionError({
        path: gatheringRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
    setGatheringToDelete(null);
  };

  const getStatus = (gathering: Gathering) => {
    return gathering.dateTime.toDate() > new Date() ? 'À venir' : 'Passé';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Rassemblements</h1>
        {!isObserver && (
          <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <button className="button-13 flex items-center justify-center !w-auto px-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Créer un rassemblement
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogTitle className="sr-only">Créer un nouveau rassemblement</DialogTitle>
                <CreateGatheringForm onGatheringCreated={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Date et Heure</TableHead>
              <TableHead>Agents Assignés</TableHead>
              <TableHead>Présence</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gatheringsLoading || agentsLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Chargement des rassemblements...</TableCell>
              </TableRow>
            ) : sortedGatherings.length > 0 ? (
              sortedGatherings.map((gathering) => {
                const assignedCount = gathering.assignedAgentIds.length;
                const absentCount = gathering.absentAgentIds.length;
                const presentCount = assignedCount - absentCount;
                const status = getStatus(gathering);

                const gatheringTime = gathering.dateTime.toDate();
                const sixHoursAfter = new Date(gatheringTime.getTime() + 6 * 60 * 60 * 1000);
                const isAttendanceManagementLocked = new Date() > sixHoursAfter;

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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                           <DropdownMenuItem onSelect={() => setViewingAttendance(gathering)}>
                            Afficher les listes
                          </DropdownMenuItem>
                          {!isObserver && (
                            <>
                              <DropdownMenuItem onSelect={() => setSelectedGathering(gathering)} disabled={isAttendanceManagementLocked}>
                                Gérer les présences
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setGatheringToDelete(gathering)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                Supprimer
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
      
      {selectedGathering && (
        <ManageAttendanceDialog
            isOpen={!!selectedGathering}
            onOpenChange={(open) => !open && setSelectedGathering(null)}
            gathering={selectedGathering}
            agents={agents || []}
        />
      )}

       {viewingAttendance && (
        <ViewAttendanceDialog
            isOpen={!!viewingAttendance}
            onOpenChange={(open) => !open && setViewingAttendance(null)}
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
