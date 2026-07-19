
'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileUp, MoreHorizontal, PlusCircle, Search, FileDown, Shield, RefreshCw, Trash2, User, HelpCircle, Pencil, Calendar } from 'lucide-react';
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
import { RegisterAgentForm } from '@/components/agents/register-agent-form';
import type { Agent, Availability, Mission, Demande } from '@/lib/types';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { ImportAgentsDialog } from '@/components/agents/import-agents-dialog';
import { Input } from '@/components/ui/input';
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
import { AgentDetailsSheet } from '@/components/agents/agent-details-sheet';
import { AgentExplicationForm } from '@/components/agents/agent-explication-form';
import { useRole } from '@/hooks/use-role';
import { useLogo } from '@/context/logo-context';
import { getAgentAvailability } from '@/lib/agents';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from '@/components/ui/dialog';
import { logActivity } from '@/lib/activity-logger';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { ManageLeaveDialog } from '@/components/agents/manage-leave-dialog';
import { EditAgentSheet } from '@/components/agents/edit-agent-sheet';
import { updateOfficerRanks, prefixContactsWithZero, deleteDuplicateAgents } from '@/lib/firestore-utils';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';
import Image from 'next/image';

export default function AgentsPage() {
  return (
    <ClientOnly>
      <Suspense fallback={
        <div id="agents-loading" className="flex h-[calc(100vh-10rem)] w-full items-center justify-center">
          <div className="loader"></div>
        </div>
      }>
        <AgentsContent />
      </Suspense>
    </ClientOnly>
  );
}

function AgentsContent() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { isObserver, isAdmin } = useRole();
  const { logo } = useLogo();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegisterOpen, setRegisterOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [leaveAgent, setLeaveAgent] = useState<Agent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [explicationAgent, setExplicationAgent] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'Disponible' | 'En mission' | 'En congé'>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    const availability = searchParams.get('availability');
    if (availability === 'Disponible' || availability === 'En mission' || availability === 'En congé') {
      setAvailabilityFilter(availability);
    }
  }, [searchParams]);

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);
  const demandesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'demandes') : null), [firestore]);

  const { data: agents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  const { data: missions, isLoading: missionsLoading } = useCollection<Mission>(missionsQuery);
  const { data: demandes, isLoading: demandesLoading } = useCollection<Demande>(demandesQuery);

  const agentsWithDetails: Agent[] = useMemo(() => {
    if (!agents || !missions) return [];
    const now = new Date();
    return agents.map(agent => ({
      ...agent,
      availability: getAgentAvailability(agent, missions, now, undefined, demandes || []),
      missionCount: missions.filter(m => m.assignedAgentIds.includes(agent.id)).length,
    }));
  }, [agents, missions, demandes]);

  const sortedAgents = useMemo(() => {
    if (!agentsWithDetails) return [];
    return [...agentsWithDetails].sort((a, b) => {
      const nameA = a.fullName || '';
      const nameB = b.fullName || '';
      return nameA.localeCompare(nameB);
    });
  }, [agentsWithDetails]);

  const filteredAgents = useMemo(() => {
    return sortedAgents.filter(agent => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (agent.fullName || '').toLowerCase().includes(searchLower) ||
                            (agent.registrationNumber || '').toLowerCase().includes(searchLower) ||
                            (agent.rank || '').toLowerCase().includes(searchLower) ||
                            (agent.id || '').toLowerCase().includes(searchLower);
      const matchesAvailability = availabilityFilter === 'all' || agent.availability === availabilityFilter;
      
      let matchesSection;
      if (sectionFilter === 'all') {
          matchesSection = true;
      } else if (sectionFilter === 'Non assigné') {
          matchesSection = !agent.section || agent.section === 'Non assigné';
      } else {
          matchesSection = (agent.section || '').toLowerCase() === sectionFilter.toLowerCase();
      }
      
      return matchesSearch && matchesAvailability && matchesSection;
    });
  }, [sortedAgents, searchQuery, availabilityFilter, sectionFilter]);

  const getBadgeVariant = (availability?: Availability) => {
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

  const handleDeleteAgent = async () => {
    if (!firestore || !agentToDelete || !missions) return;
    const now = new Date();

    const availability = getAgentAvailability(agentToDelete, missions, now);
    if (availability === 'En mission') {
        toast({
            variant: 'destructive',
            title: 'Action non autorisée',
            description: "Vous ne pouvez pas supprimer un agent qui est actuellement en mission.",
        });
        setAgentToDelete(null);
        return;
    }

    setIsDeleting(true);

    const agentRef = doc(firestore, 'agents', agentToDelete.id);
    deleteDoc(agentRef).then(() => {
        toast({
          title: 'Agent supprimé',
          description: `L'agent ${agentToDelete.fullName} a été supprimé.`,
        });
        logActivity(firestore, `L'agent ${agentToDelete.fullName} a été supprimé.`, 'Agent', '/agents');
    }).catch(serverError => {
        const permissionError = new FirestorePermissionError({
            path: agentRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
        setIsDeleting(false);
        setAgentToDelete(null); // Close the dialog
    });
  };

  const handleCleanDuplicates = async () => {
    if (!firestore) return;
    setIsCleaning(true);
    try {
      const deletedCount = await deleteDuplicateAgents(firestore);
      if (deletedCount > 0) {
        toast({
          title: 'Nettoyage terminé',
          description: `${deletedCount} agent(s) en double ont été supprimés.`,
        });
      } else {
        toast({
          title: 'Aucun doublon',
          description: 'Aucun agent avec le même matricule n\'a été trouvé.',
        });
      }
    } catch (error) {
      console.error('Error cleaning duplicates:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Une erreur est survenue lors du nettoyage des doublons.',
      });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleExportXLSX = async () => {
    const XLSX = await import('xlsx');
    const dataToExport = filteredAgents.map(agent => ({
        'Nom complet': agent.fullName,
        'Matricule': agent.registrationNumber,
        'Grade': agent.rank,
        'Contact': agent.contact,
        'Section': agent.section || 'Non assigné',
        'Disponibilité': agent.availability,
        'IDC': agent.id.substring(0, 6).toUpperCase(),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Agents');
    XLSX.writeFile(workbook, 'liste_agents.xlsx');
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const tableTitle = "Liste des Agents";
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
        currentY += 5;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Duralex - Sed Lex", pageWidth / 2, currentY, { align: 'center' });
        currentY += 15;

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(tableTitle, 14, currentY);
        currentY += 7;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Généré le: ${generationDate}`, 14, currentY);
        currentY += 8;

        autoTable(doc, {
            head: [['Nom complet', 'Matricule', 'Grade', 'Section', 'Disponibilité', 'IDC']],
            body: filteredAgents.map(agent => [
                agent.fullName,
                agent.registrationNumber || '',
                agent.rank || '',
                ((agent.section as string) === 'Officier' || (agent.section as string) === 'OFFICIER') ? 'N/A' : (agent.section || 'Non assigné').toUpperCase(),
                agent.availability || '',
                agent.id.substring(0, 6).toUpperCase(),
            ]),
            startY: currentY,
            theme: 'striped',
            headStyles: { fillColor: [39, 55, 70], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            didDrawPage: (data) => {
                const pageCount = doc.getNumberOfPages();
                doc.setFontSize(10);
                doc.text(`Page ${data.pageNumber} sur ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
            }
        });
        doc.save('liste_agents.pdf');
    };

    if (logo) {
        // Use window.Image instead of Image to avoid collision with next/image
        const img = new window.Image();
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

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <span className="text-muted-foreground">({filteredAgents.length} affiché(s))</span>
      </div>
      
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Rechercher par nom, matricule ou grade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isAdmin && (
                <button 
                  className="button-13 flex items-center justify-center text-destructive hover:bg-destructive/10 !w-auto px-4"
                  onClick={handleCleanDuplicates}
                  disabled={isCleaning}
                >
                  {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Nettoyer Doublons
                </button>
              )}
              {!isObserver && (
                <Dialog open={isRegisterOpen} onOpenChange={setRegisterOpen}>
                  <DialogTrigger asChild>
                    <button className="button-13 flex items-center justify-center text-primary">
                      <PlusCircle className="mr-2 h-4 w-4" /> Enregistrer
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogTitle className="sr-only">Enregistrer un nouvel agent</DialogTitle>
                    <RegisterAgentForm onAgentRegistered={() => setRegisterOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}
               {!isObserver && (
                  <ImportAgentsDialog>
                    <button className="button-13 flex items-center justify-center text-primary">
                      <FileUp className="mr-2 h-4 w-4" /> Importer
                    </button>
                  </ImportAgentsDialog>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="button-13 flex items-center justify-center text-primary">
                    <FileDown className="mr-2 h-4 w-4" /> Exporter
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Choisir un format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleExportPDF}>Exporter en PDF</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleExportXLSX}>Exporter en XLSX</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Filtrer par:</span>
            <button className={cn('button-13', availabilityFilter === 'all' && 'active')} onClick={() => setAvailabilityFilter('all')}>Tous</button>
            <button className={cn('button-13', availabilityFilter === 'Disponible' && 'active')} onClick={() => setAvailabilityFilter('Disponible')}>Disponibles</button>
            <button className={cn('button-13', availabilityFilter === 'En mission' && 'active')} onClick={() => setAvailabilityFilter('En mission')}>En mission</button>
            <button className={cn('button-13', availabilityFilter === 'En congé' && 'active')} onClick={() => setAvailabilityFilter('En congé')}>En congé</button>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="button-13 !w-[180px]">
                <SelectValue placeholder="Filtrer par section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">TOUTES LES SECTIONS</SelectItem>
                <SelectItem value="Armurerie">ARMURERIE</SelectItem>
                <SelectItem value="Administration">ADMINISTRATION</SelectItem>
                <SelectItem value="FAUNE">FAUNE</SelectItem>
                <SelectItem value="CONDUCTEUR">CONDUCTEUR</SelectItem>
                <SelectItem value="SECTION FEMININE">SECTION FEMININE</SelectItem>
                <SelectItem value="DETACHEMENT NOE">DETACHEMENT NOE</SelectItem>
                <SelectItem value="DETACHEMENT TINGRELA">DETACHEMENT TINGRELA</SelectItem>
                <SelectItem value="DETACHEMENT MORONDO">DETACHEMENT MORONDO</SelectItem>
                <SelectItem value="Non assigné">NON ASSIGNÉ</SelectItem>
              </SelectContent>
            </Select>
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Nom complet</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Missions</TableHead>
              <TableHead>Disponibilité</TableHead>
              <TableHead>IDC</TableHead>
              {isAdmin && <TableHead className="text-center">Explication</TableHead>}
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {agentsLoading || missionsLoading || demandesLoading ? (
              <TableRow><TableCell colSpan={isAdmin ? 8 : 6} className="text-center">Chargement des agents...</TableCell></TableRow>
            ) : filteredAgents.length > 0 ? (
              filteredAgents.map((agent) => {
                return (
                  <TableRow key={agent.id} onClick={() => setSelectedAgent(agent)} className="cursor-pointer">
                    <TableCell>
                        <div className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground border">
                            {agent.photo ? (
                                <Image src={agent.photo} alt={agent.fullName} width={32} height={32} className="object-cover h-full w-full" />
                            ) : (
                                <User className="h-4 w-4" />
                            )}
                        </div>
                    </TableCell>
                    <TableCell className="font-medium">
                        <div>{agent.fullName}</div>
                        {agent.registrationNumber && <div className="text-xs text-muted-foreground">{agent.registrationNumber}</div>}
                    </TableCell>
                    <TableCell>{agent.rank}</TableCell>
                     <TableCell>
                      <div className="flex items-center justify-center gap-1 font-semibold">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {agent.missionCount || 0}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={getBadgeVariant(agent.availability)}>{agent.availability || '...'}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {agent.id.substring(0, 6).toUpperCase()}
                      </code>
                    </TableCell>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:text-orange-700 font-semibold"
                          onClick={() => setExplicationAgent(agent)}
                        >
                          <HelpCircle className="h-4 w-4" />
                          <span>Demander</span>
                        </Button>
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-right whitespace-nowrap space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 border-blue-500/30 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 font-semibold"
                          onClick={() => setEditingAgent(agent)}
                          title="Modifier l'agent"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 border-teal-500/30 text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 font-semibold"
                          onClick={() => setLeaveAgent(agent)}
                          title="Gérer les congés/permissions"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold"
                          onClick={() => setAgentToDelete(agent)}
                          title="Supprimer l'agent"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow><TableCell colSpan={isAdmin ? 8 : 6} className="text-center text-muted-foreground">Aucun agent trouvé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editingAgent && (
        <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
            <DialogTitle className="sr-only">Modifier l'agent</DialogTitle>
            <EditAgentSheet
              agent={editingAgent}
              availability={editingAgent.availability!}
              onAgentEdited={() => setEditingAgent(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {leaveAgent && (
        <ManageLeaveDialog
          agent={leaveAgent}
          isOpen={!!leaveAgent}
          onOpenChange={(open) => !open && setLeaveAgent(null)}
        />
      )}

      {selectedAgent && missions && (
        <AgentDetailsSheet
          agent={{...selectedAgent, availability: getAgentAvailability(selectedAgent, missions, new Date())!, missionCount: missions.filter(m => m.assignedAgentIds.includes(selectedAgent.id)).length}}
          missions={missions.filter(m => m.assignedAgentIds.includes(selectedAgent.id))}
          isOpen={!!selectedAgent}
          onOpenChange={(open) => !open && setSelectedAgent(null)}
        />
      )}

      {explicationAgent && (
        <Dialog open={!!explicationAgent} onOpenChange={(open) => !open && setExplicationAgent(null)}>
          <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
            <DialogTitle className="sr-only">Demande d'explication</DialogTitle>
            <AgentExplicationForm
              agent={explicationAgent}
              onClose={() => setExplicationAgent(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {agentToDelete && (
        <AlertDialog open={!!agentToDelete} onOpenChange={(open) => !open && setAgentToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. L'agent <span className="font-semibold">{agentToDelete.fullName}</span> sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setAgentToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAgent} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                 {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
