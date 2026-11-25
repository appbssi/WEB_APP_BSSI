
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
import { FileUp, MoreHorizontal, PlusCircle, Search, FileDown, Shield, RefreshCw, Trash2, User, HelpCircle, Pencil, Calendar, QrCode, ChevronDown, X, Layers } from 'lucide-react';
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
import { collection, doc } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
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
import { AgentQRBadgeDialog } from '@/components/agents/agent-qr-badge-dialog';
import { AgentQRScannerDialog } from '@/components/agents/agent-qr-scanner-dialog';
import { useRole } from '@/hooks/use-role';
import { useLogo } from '@/context/logo-context';
import { useDetachement } from '@/context/detachement-context';
import { getAgentAvailability } from '@/lib/agents';
import {
  Dialog,
  DialogContent,
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

function AgentsLoadingFallback() {
  const [isScannerOpen, setScannerOpen] = useState(false);
  const firestore = useFirestore();
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agents } = useCollection<Agent>(agentsQuery);

  return (
    <>
      <div id="agents-loading" className="flex items-center justify-center gap-3.5 h-[calc(100vh-10rem)] w-full">
        <div className="loader"></div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setScannerOpen(true)}
          className="gap-2 text-xs font-semibold border-[#1a2b4c]/30 text-[#1a2b4c] dark:text-blue-300 hover:bg-[#1a2b4c]/10 shadow-xs cursor-pointer items-center"
          title="Scan QR - Prêt"
          aria-label="Scan QR - Prêt"
        >
          <span className="relative flex h-2 w-2 shrink-0" aria-label="Prêt" title="Prêt">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <QrCode className="h-4 w-4" />
          <span>Scan QR</span>
        </Button>
      </div>

      <AgentQRScannerDialog
        isOpen={isScannerOpen}
        onOpenChange={setScannerOpen}
        agents={(agents as any) || []}
        onSelectAgent={(agent) => {
          if (typeof window !== 'undefined' && agent?.id) {
            const url = new URL(window.location.href);
            url.searchParams.set('agentId', agent.id);
            window.location.href = url.toString();
          }
        }}
      />
    </>
  );
}

export default function AgentsPage() {
  return (
    <ClientOnly>
      <Suspense fallback={<AgentsLoadingFallback />}>
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
  const [isImportOpen, setImportOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [leaveAgent, setLeaveAgent] = useState<Agent | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [explicationAgent, setExplicationAgent] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'Disponible' | 'En mission' | 'En congé'>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [qrBadgeAgent, setQrBadgeAgent] = useState<Agent | null>(null);
  const [isScannerOpen, setScannerOpen] = useState(false);
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

  const { selectedDetachement } = useDetachement();

  const agentsWithDetails: Agent[] = useMemo(() => {
    if (!agents || !missions) return [];
    const now = new Date();
    return agents.map(agent => ({
      ...agent,
      availability: getAgentAvailability(agent, missions, now, undefined, demandes || []),
      missionCount: agent.missionCount !== undefined ? agent.missionCount : missions.filter(m => m.assignedAgentIds.includes(agent.id)).length,
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

  // Auto-select agent if agentId is in URL query (e.g. from scanning QR with external phone camera)
  const agentIdParam = searchParams.get('agentId');
  useEffect(() => {
    if (agentIdParam && sortedAgents.length > 0) {
      const match = sortedAgents.find(
        (a) =>
          a.id.toLowerCase() === agentIdParam.toLowerCase() ||
          (a.registrationNumber && a.registrationNumber.trim().toLowerCase() === agentIdParam.trim().toLowerCase()) ||
          a.id.substring(0, 6).toUpperCase() === agentIdParam.trim().toUpperCase()
      );
      if (match) {
        setSelectedAgent(match);
      }
    }
  }, [agentIdParam, sortedAgents]);

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

      const matchesDetachement = !selectedDetachement || selectedDetachement === 'ALL' || agent.section === selectedDetachement;
      
      return matchesSearch && matchesAvailability && matchesSection && matchesDetachement;
    });
  }, [sortedAgents, searchQuery, availabilityFilter, sectionFilter, selectedDetachement]);

  // Nombre d'agents par disponibilité (selon la recherche, la section et le détachement en cours)
  const availabilityCounts = useMemo(() => {
    const counts = { all: 0, Disponible: 0, 'En mission': 0, 'En congé': 0 } as Record<string, number>;
    const searchLower = searchQuery.toLowerCase();
    for (const agent of sortedAgents) {
      const matchesSearch = (agent.fullName || '').toLowerCase().includes(searchLower) ||
                            (agent.registrationNumber || '').toLowerCase().includes(searchLower) ||
                            (agent.rank || '').toLowerCase().includes(searchLower) ||
                            (agent.id || '').toLowerCase().includes(searchLower);
      const matchesSection = sectionFilter === 'all'
        ? true
        : sectionFilter === 'Non assigné'
          ? !agent.section || agent.section === 'Non assigné'
          : (agent.section || '').toLowerCase() === sectionFilter.toLowerCase();
      const matchesDetachement = !selectedDetachement || selectedDetachement === 'ALL' || agent.section === selectedDetachement;
      if (!(matchesSearch && matchesSection && matchesDetachement)) continue;
      counts.all++;
      if (agent.availability && agent.availability in counts) counts[agent.availability]++;
    }
    return counts;
  }, [sortedAgents, searchQuery, sectionFilter, selectedDetachement]);

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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const tableTitle = "LISTE OFFICIELLE DES AGENTS";
    const now = new Date();
    const generationDate = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const generationTime = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 12;

    const addContent = (logoImg: HTMLImageElement | null) => {
      // Top institutional accent stripe
      doc.setFillColor(26, 43, 76); // Navy
      doc.rect(0, 0, pageWidth, 4, 'F');
      doc.setFillColor(247, 127, 0); // Orange accent
      doc.rect(0, 4, pageWidth, 1.2, 'F');

      let currentY = 12;

      if (logoImg) {
        const naturalW = logoImg.naturalWidth || logoImg.width || 1;
        const naturalH = logoImg.naturalHeight || logoImg.height || 1;
        const aspectRatio = naturalW / naturalH;
        const logoWidth = 26;
        const logoHeight = logoWidth / aspectRatio;
        doc.addImage(logoImg, 'PNG', (pageWidth - logoWidth) / 2, currentY, logoWidth, logoHeight);
        currentY += logoHeight + 4;
      }

      doc.setTextColor(26, 43, 76);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text("BRIGADE SPÉCIALE DE SURVEILLANCE ET D'INTERVENTION", pageWidth / 2, currentY, { align: 'center' });
      currentY += 4.5;

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.text("Duralex - Sed Lex", pageWidth / 2, currentY, { align: 'center' });
      currentY += 6;

      // Summary banner card above the table
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX, currentY, pageWidth - marginX * 2, 16, 2, 2, 'FD');

      // Left accent inside banner
      doc.setFillColor(247, 127, 0);
      doc.rect(marginX, currentY, 2.2, 16, 'F');

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(tableTitle, marginX + 6, currentY + 6.5);

      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Édité le ${generationDate} à ${generationTime}`, marginX + 6, currentY + 12);

      // Right count pill inside banner
      const countText = `${filteredAgents.length} agent${filteredAgents.length > 1 ? 's' : ''}`;
      doc.setFillColor(26, 43, 76);
      doc.roundedRect(pageWidth - marginX - 36, currentY + 4, 32, 8, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(countText, pageWidth - marginX - 20, currentY + 9.2, { align: 'center' });

      currentY += 21;

      autoTable(doc, {
        head: [['N°', 'Nom complet', 'Matricule', 'Grade', 'Section', 'Disponibilité', 'IDC']],
        body: filteredAgents.map((agent, index) => [
          String(index + 1),
          agent.fullName || '—',
          agent.registrationNumber || '—',
          agent.rank || '—',
          ((agent.section as string) === 'Officier' || (agent.section as string) === 'OFFICIER')
            ? 'N/A'
            : (agent.section || 'Non assigné').toUpperCase(),
          agent.availability || 'Non défini',
          agent.id.substring(0, 6).toUpperCase(),
        ]),
        startY: currentY,
        margin: { top: 14, right: marginX, bottom: 18, left: marginX },
        theme: 'grid',
        showHead: 'everyPage',
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          textColor: [15, 23, 42],
          lineColor: [148, 163, 184], // Visible crisp borders between every row & column
          lineWidth: 0.35,
          cellPadding: { top: 3.4, right: 3, bottom: 3.4, left: 3 },
          valign: 'middle',
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [26, 43, 76],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.8,
          halign: 'left',
          lineColor: [26, 43, 76],
          lineWidth: 0.35,
          cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
        },
        alternateRowStyles: {
          fillColor: [241, 245, 249],
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10, fontStyle: 'bold', textColor: [71, 85, 105] },
          1: { cellWidth: 46, fontStyle: 'bold', textColor: [15, 23, 42] },
          2: { cellWidth: 26, halign: 'center' },
          3: { cellWidth: 28 },
          4: { cellWidth: 24, halign: 'center' },
          5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
          6: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: [51, 65, 85] },
        },
        didParseCell: (data) => {
          if (data.section === 'head' && (data.column.index === 0 || data.column.index === 2 || data.column.index === 4 || data.column.index === 5 || data.column.index === 6)) {
            data.cell.styles.halign = 'center';
          }
          if (data.section === 'body' && data.column.index === 5) {
            const val = String(data.cell.raw || '');
            if (val === 'Disponible') {
              data.cell.styles.fillColor = [236, 253, 245];
              data.cell.styles.textColor = [4, 120, 87];
            } else if (val === 'En mission') {
              data.cell.styles.fillColor = [239, 246, 255];
              data.cell.styles.textColor = [29, 78, 216];
            } else if (val === 'En congé') {
              data.cell.styles.fillColor = [255, 251, 235];
              data.cell.styles.textColor = [180, 83, 9];
            } else if (val === 'En permission') {
              data.cell.styles.fillColor = [245, 243, 255];
              data.cell.styles.textColor = [109, 40, 217];
            }
          }
        },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);

          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(
            "sBSSI · Liste officielle des agents",
            marginX,
            pageHeight - 8
          );
          doc.setFont('helvetica', 'bold');
          doc.text(
            `Page ${data.pageNumber} sur ${pageCount}`,
            pageWidth - marginX,
            pageHeight - 8,
            { align: 'right' }
          );
        },
      });

      doc.save('liste_agents.pdf');
    };

    const imageUrl = 'https://i.ibb.co/v4p7NtMh/dd.png';

    const img = new window.Image();
    img.crossOrigin = 'Anonymous'; // Obligatoire pour les URLs externes avec jsPDF
    img.onload = () => addContent(img);
    img.onerror = () => {
      console.error("Erreur de chargement du logo pour le PDF.");
      addContent(null);
    };
    img.src = imageUrl;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <span className="text-sm text-muted-foreground">
          {filteredAgents.length} affiché{filteredAgents.length > 1 ? 's' : ''} sur {sortedAgents.length}
        </span>
      </div>

      {/* Barre d'outils : recherche, section, actions, puis filtres de disponibilité */}
      <div className="rounded-xl border bg-card/40 p-3 sm:p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-10 pl-10 pr-9"
                placeholder="Nom, matricule ou grade…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Rechercher un agent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="h-10 flex-1 sm:w-[220px] sm:flex-none gap-2" aria-label="Filtrer par section">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Filtrer par section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">TOUTES LES SECTIONS</SelectItem>
                <SelectItem value="Armurerie">ARMURERIE</SelectItem>
                <SelectItem value="Administration">ADMINISTRATION</SelectItem>
                <SelectItem value="FAUNE">SERVICE FAUNE</SelectItem>
                <SelectItem value="CONDUCTEUR">CONDUCTEUR</SelectItem>
                <SelectItem value="SECTION FEMININE">SECTION FEMININE</SelectItem>
                <SelectItem value="DETACHEMENT NOE">DETACHEMENT NOE</SelectItem>
                <SelectItem value="DETACHEMENT TINGRELA">DETACHEMENT TINGRELA</SelectItem>
                <SelectItem value="DETACHEMENT MORONDO">DETACHEMENT MORONDO</SelectItem>
                <SelectItem value="Non assigné">NON ASSIGNÉ</SelectItem>
              </SelectContent>
            </Select>
              {/* Toutes les actions regroupées dans un seul menu déroulant.
                  modal={false} : évite que la page reste bloquée quand une fenêtre s'ouvre depuis le menu. */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button className="h-10 shrink-0 gap-2 px-4 font-semibold">
                    {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                    Actions
                    <ChevronDown className="h-4 w-4 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {!isObserver && (
                    <>
                      <DropdownMenuItem onSelect={() => setRegisterOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Enregistrer un agent
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                        <FileUp className="mr-2 h-4 w-4" /> Importer
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onSelect={() => setScannerOpen(true)}>
                    <QrCode className="mr-2 h-4 w-4" /> Scanner QR
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Exporter</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={handleExportPDF}>
                    <FileDown className="mr-2 h-4 w-4" /> Exporter en PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleExportXLSX}>
                    <FileDown className="mr-2 h-4 w-4" /> Exporter en XLSX
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={handleCleanDuplicates}
                        disabled={isCleaning}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Nettoyer les doublons
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Fenêtres ouvertes depuis le menu */}
              {!isObserver && (
                <Dialog open={isRegisterOpen} onOpenChange={setRegisterOpen}>
                  <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
                    <DialogTitle className="sr-only">Enregistrer un nouvel agent</DialogTitle>
                    <RegisterAgentForm onAgentRegistered={() => setRegisterOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}
              {!isObserver && <ImportAgentsDialog open={isImportOpen} onOpenChange={setImportOpen} />}
            </div>
        </div>

        {/* Filtres de disponibilité : contrôle segmenté avec compteurs */}
        <div
          role="tablist"
          aria-label="Filtrer par disponibilité"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1 sm:flex sm:w-fit"
        >
          {([
            { value: 'all', label: 'Tous', dot: 'bg-muted-foreground' },
            { value: 'Disponible', label: 'Disponibles', dot: 'bg-emerald-500' },
            { value: 'En mission', label: 'En mission', dot: 'bg-sky-500' },
            { value: 'En congé', label: 'En congé', dot: 'bg-amber-500' },
          ] as const).map((opt) => {
            const isActive = availabilityFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setAvailabilityFilter(opt.value)}
                className={cn(
                  'inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', opt.dot)} aria-hidden />
                {opt.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {availabilityCounts[opt.value] ?? 0}
                </span>
              </button>
            );
          })}
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
              <TableHead>IDC / QR</TableHead>
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
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {agent.id.substring(0, 6).toUpperCase()}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 border-[#1a2b4c]/30 text-[#1a2b4c] dark:text-blue-300 hover:bg-[#1a2b4c]/10 cursor-pointer"
                          onClick={() => setQrBadgeAgent(agent)}
                          title="Afficher le Code QR et Badge officiel de l'agent"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:text-orange-700 font-semibold mx-auto"
                          onClick={() => setExplicationAgent(agent)}
                          title="Demander une explication"
                          aria-label="Demander une explication"
                        >
                          <HelpCircle className="h-4 w-4" />
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
          agent={{...selectedAgent, availability: getAgentAvailability(selectedAgent, missions, new Date(), undefined, demandes || [])!, missionCount: missions.filter(m => m.assignedAgentIds.includes(selectedAgent.id)).length}}
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

      {/* QR Code Badge Dialog */}
      <AgentQRBadgeDialog
        agent={qrBadgeAgent ? {
          ...qrBadgeAgent,
          availability: getAgentAvailability(qrBadgeAgent, missions || [], new Date(), undefined, demandes || [])!,
        } : null}
        isOpen={!!qrBadgeAgent}
        onOpenChange={(open) => !open && setQrBadgeAgent(null)}
        onOpenDetails={() => {
          if (qrBadgeAgent) {
            setSelectedAgent(qrBadgeAgent);
            setQrBadgeAgent(null);
          }
        }}
      />

      {/* QR Code Scanner Dialog */}
      <AgentQRScannerDialog
        isOpen={isScannerOpen}
        onOpenChange={setScannerOpen}
        agents={agentsWithDetails}
        onSelectAgent={(agent) => {
          setSelectedAgent(agent);
        }}
      />
    </div>
  );
}
