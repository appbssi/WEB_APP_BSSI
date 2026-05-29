
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, PlusCircle, Users, Search, FileDown, CheckCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CreateMissionForm } from '@/components/missions/create-mission-form';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent, Mission, MissionStatus } from '@/lib/types';
import { useState, useMemo, useEffect } from 'react';
import { EditMissionDialog } from '@/components/missions/edit-mission-dialog';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useRole } from '@/hooks/use-role';
import { useLogo } from '@/context/logo-context';
import { differenceInDays, isSameDay } from 'date-fns';
import { logActivity } from '@/lib/activity-logger';
import { getDisplayStatus, MissionWithDisplayStatus } from '@/lib/missions';
import { useSearchParams } from 'next/navigation';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';

const AssignedAgentsDialog = ({ agents, missionName }: { agents: Agent[], missionName: string }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const { logo } = useLogo();
    
    const sortedAgents = useMemo(() => {
        if (!agents) return [];
        return [...agents].sort((a, b) => {
            const nameA = a.fullName || '';
            const nameB = b.fullName || '';
            return nameA.localeCompare(nameB);
        });
    }, [agents]);

    const filteredAgents = sortedAgents.filter(agent => 
        (agent.fullName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const mainTitle = `Mission: ${missionName}`;
        const subTitle = "Agents en Mission";
        const generationDate = new Date().toLocaleDateString('fr-FR');
        const pageWidth = doc.internal.pageSize.getWidth();

        const addContent = (logoImg: HTMLImageElement | null) => {
            let currentY = 15;
            if (logoImg) {
                const aspectRatio = logoImg.width / logoImg.height;
                const logoWidth = 30;
                const logoHeight = logoWidth / aspectRatio;
                doc.addImage(logoImg, 'PNG', (pageWidth - logoWidth) / 2, currentY, logoWidth, logoHeight);
                currentY += logoHeight + 5;
            }

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text("BRIGADE SPECIALE DE SURVEILLANCE ET D'INTERVENTION", pageWidth / 2, currentY, { align: 'center' });
            currentY += 10;
            
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text(mainTitle, pageWidth / 2, currentY, { align: 'center' });
            currentY += 7;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text(subTitle, pageWidth / 2, currentY, { align: 'center' });
            currentY += 8;
            doc.setFontSize(11);
            doc.text(`Généré le: ${generationDate}`, 14, currentY);
            currentY += 8;

            autoTable(doc, {
                head: [['Nom complet', 'Contact']],
                body: filteredAgents.map(agent => [
                    agent.fullName,
                    agent.contact,
                ]),
                startY: currentY,
                theme: 'striped',
                headStyles: { fillColor: [39, 55, 70], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                didDrawPage: (data) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(10);
                    doc.text(`Page ${data.pageNumber} sur ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                }
            });
            doc.save(`agents_assignes_${missionName.replace(/ /g, '_')}.pdf`);
        }

        if (logo) {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => addContent(img);
            img.onerror = () => {
                console.error("Erreur de chargement du logo pour le PDF.");
                addContent(null);
            };
            img.src = logo;
        } else {
            addContent(null);
        }
    };

    const handleExportXLSX = () => {
        const dataToExport = filteredAgents.map(agent => ({
            'Nom complet': agent.fullName,
            'Contact': agent.contact,
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Agents Assignés');
        XLSX.writeFile(workbook, `agents_assignes_${missionName.replace(/ /g, '_')}.xlsx`);
    };


    return (
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>AGENT A LA MISSION "{missionName.toUpperCase()}"</DialogTitle>
                <DialogDescription>Liste des agents assignés à cette mission.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            className="pl-10"
                            placeholder="Rechercher un agent..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="button-13"><FileDown className="mr-2 h-4 w-4" /> Exporter</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuLabel>Choisir un format</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={handleExportPDF}>Exporter en PDF</DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleExportXLSX}>Exporter en XLSX</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nom Complet</TableHead>
                                <TableHead>Contact</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAgents.length > 0 ? (
                                filteredAgents.map(agent => (
                                    <TableRow key={agent.id}>
                                        <TableCell className="font-medium">{agent.fullName}</TableCell>
                                        <TableCell>{agent.contact}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Aucun agent trouvé.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </DialogContent>
    )
}

export default function MissionsPage() {
  return (
    <ClientOnly>
      <MissionsContent />
    </ClientOnly>
  );
}

function MissionsContent() {
  const { isObserver } = useRole();
  const searchParams = useSearchParams();
  const [isCreateMissionOpen, setCreateMissionOpen] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [missionToComplete, setMissionToComplete] = useState<Mission | null>(null);
  const [missionToCancel, setMissionToCancel] = useState<Mission | null>(null);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MissionStatus | 'all'>('all');

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'Planification' || status === 'En cours' || status === 'Terminée' || status === 'Annulée') {
      setStatusFilter(status);
    }
  }, [searchParams]);
  
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);

  const { data: missions, isLoading: missionsLoading } = useCollection<Mission>(missionsQuery);
  const { data: agents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  
  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => {
        acc[agent.id] = agent;
        return acc;
    }, {} as Record<string, Agent>);
  }, [agents]);

  const sortedMissions: MissionWithDisplayStatus[] = useMemo(() => {
    if (!missions) return [];
    
    const statusOrder: Record<MissionStatus, number> = {
      'En cours': 1, 'Planification': 2, 'Terminée': 3, 'Annulée': 4,
    };
    const now = new Date();
    return [...missions]
      .map(m => ({...m, displayStatus: getDisplayStatus(m, now)!}))
      .sort((a, b) => (statusOrder[a.displayStatus] || 5) - (statusOrder[b.displayStatus] || 5) || b.startDate.toMillis() - a.startDate.toMillis());
  }, [missions]);

  const filteredMissions = useMemo(() => {
    return sortedMissions.filter(mission => {
      const matchesSearch = mission.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = statusFilter === 'all' || mission.displayStatus === statusFilter;
      return matchesSearch && matchesFilter;
    });
  }, [sortedMissions, searchQuery, statusFilter]);

  const getBadgeVariant = (status: MissionStatus) => {
    switch (status) {
      case 'En cours': return 'default';
      case 'Terminée': return 'outline';
      case 'Annulée': return 'destructive';
      case 'Planification':
      default: return 'secondary';
    }
  };
  
  const handleCompleteMission = async () => {
    if (!firestore || !missionToComplete) return;
    const missionRef = doc(firestore, 'missions', missionToComplete.id);
    const updateData = { status: 'Terminée' as const };
    
    updateDoc(missionRef, updateData).then(() => {
        toast({ title: 'Mission terminée', description: `La mission "${missionToComplete.name}" a été marquée comme terminée.` });
        logActivity(firestore, `La mission "${missionToComplete.name}" a été terminée.`, 'Mission', '/missions');
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({ path: missionRef.path, operation: 'update', requestResourceData: updateData });
        errorEmitter.emit('permission-error', permissionError);
    });
    setMissionToComplete(null);
  };
  
  const handleCancelMission = async () => {
    if (!firestore || !missionToCancel) return;
    
    const missionRef = doc(firestore, 'missions', missionToCancel.id);
    const updateData = { status: 'Annulée' as const };
    
    updateDoc(missionRef, updateData).then(() => {
        toast({ title: 'Mission annulée', description: `La mission "${missionToCancel.name}" a été annulée.` });
        logActivity(firestore, `La mission "${missionToCancel.name}" a été annulée.`, 'Mission', '/missions');
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({ path: missionRef.path, operation: 'update', requestResourceData: updateData });
        errorEmitter.emit('permission-error', permissionError);
    });
    setMissionToCancel(null);
  }

  const handleDeleteMission = async () => {
    if (!firestore || !missionToDelete) return;
    const missionRef = doc(firestore, 'missions', missionToDelete.id);
    
    deleteDoc(missionRef).then(() => {
        toast({ title: 'Mission supprimée', description: `La mission "${missionToDelete.name}" a été supprimée.` });
        logActivity(firestore, `La mission "${missionToDelete.name}" a été supprimée.`, 'Mission', '/missions');
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({ path: missionRef.path, operation: 'delete' });
        errorEmitter.emit('permission-error', permissionError);
    });

    setMissionToDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Missions</h1>
        {!isObserver && (
          <Dialog open={isCreateMissionOpen} onOpenChange={setCreateMissionOpen}>
            <DialogTrigger asChild>
               <button className="button-13 flex items-center justify-center !w-auto px-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Créer une mission
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                  <DialogTitle>Créer une nouvelle mission</DialogTitle>
              </DialogHeader>
              <CreateMissionForm onMissionCreated={() => setCreateMissionOpen(false)}/>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Rechercher par nom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
             <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MissionStatus | 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrer par statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="Planification">Planifiées</SelectItem>
                    <SelectItem value="En cours">En cours</SelectItem>
                    <SelectItem value="Terminée">Terminées</SelectItem>
                    <SelectItem value="Annulée">Annulées</SelectItem>
                  </SelectContent>
                </Select>
            </div>
        </div>
        </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mission</TableHead>
              <TableHead>Lieu</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>Agents Assignés</TableHead>
              <TableHead>Statut</TableHead>
              {!isObserver && <TableHead><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {missionsLoading || agentsLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center">Chargement des missions...</TableCell></TableRow>
            ) : filteredMissions.length > 0 ? (
            filteredMissions.map((mission) => {
              const assignedAgents = (mission.assignedAgentIds || []).map(id => agentsById[id]).filter(Boolean);
              const missionStartDate = mission.startDate.toDate();
              const missionEndDate = mission.endDate.toDate();
              const isSingleDay = isSameDay(missionStartDate, missionEndDate);
              const duration = differenceInDays(missionEndDate, missionStartDate) + 1;

              return (
              <TableRow key={mission.id}>
                <TableCell className="font-medium">{mission.name}</TableCell>
                <TableCell>{mission.location}</TableCell>
                <TableCell>
                    <div className="flex flex-col">
                        <span>{missionStartDate.toLocaleDateString('fr-FR')} - {missionEndDate.toLocaleDateString('fr-FR')}</span>
                        <span className="text-xs text-muted-foreground">
                            {isSingleDay ? `${mission.startTime || ''} - ${mission.endTime || ''}` : `${duration} jour(s)`}
                        </span>
                    </div>
                </TableCell>
                <TableCell>
                   <div className="flex items-center gap-2">
                    {assignedAgents.length > 0 ? (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 px-2" onClick={(e) => e.stopPropagation()}>
                                    <Users className="h-4 w-4" />
                                    <span className="font-medium">{assignedAgents.length}</span>
                                </Button>
                            </DialogTrigger>
                            <AssignedAgentsDialog agents={assignedAgents} missionName={mission.name} />
                        </Dialog>
                    ) : (
                      <span className="text-sm text-muted-foreground">Non assigné</span>
                    )}
                  </div>
                </TableCell>
                <TableCell><Badge variant={getBadgeVariant(mission.displayStatus)}>{mission.displayStatus}</Badge></TableCell>
                {!isObserver && (
                  <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => setEditingMission(mission)}>Modifier/Prolonger</DropdownMenuItem>
                          {mission.displayStatus !== 'Terminée' && mission.displayStatus !== 'Annulée' && (
                            <DropdownMenuItem onSelect={() => setMissionToComplete(mission)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Terminer la mission
                            </DropdownMenuItem>
                          )}
                          {mission.displayStatus !== 'Terminée' && mission.displayStatus !== 'Annulée' && (
                            <DropdownMenuItem onSelect={() => setMissionToCancel(mission)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">Annuler la mission</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setMissionToDelete(mission)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">Supprimer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            )})
            ) : (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucune mission trouvée.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editingMission && (
        <EditMissionDialog
          mission={editingMission}
          isOpen={!!editingMission}
          onOpenChange={(open) => !open && setEditingMission(null)}
        />
      )}
      
      {missionToComplete && (
         <AlertDialog open={!!missionToComplete} onOpenChange={(open) => !open && setMissionToComplete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr de vouloir terminer cette mission ?</AlertDialogTitle>
              <AlertDialogDescription>La mission <span className="font-semibold">{missionToComplete.name}</span> sera marquée comme "Terminée". Cette action est irréversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMissionToComplete(null)}>Retour</AlertDialogCancel>
              <AlertDialogAction onClick={handleCompleteMission}>Terminer la mission</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {missionToCancel && (
         <AlertDialog open={!!missionToCancel} onOpenChange={(open) => !open && setMissionToCancel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr de vouloir annuler cette mission ?</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible. La mission <span className="font-semibold">{missionToCancel.name}</span> sera marquée comme "Annulée".</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMissionToCancel(null)}>Retour</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelMission} className="bg-destructive hover:bg-destructive/90">Annuler la mission</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {missionToDelete && (
        <AlertDialog open={!!missionToDelete} onOpenChange={(open) => !open && setMissionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible. La mission <span className="font-semibold">{missionToDelete.name}</span> sera définitivement supprimée.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMissionToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteMission} className="bg-destructive hover:bg-destructive/90">Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </div>
  );
}
