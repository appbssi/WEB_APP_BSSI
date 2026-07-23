'use client';

import { useState, useMemo } from 'react';
import { collection, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import type { Saisie, Agent, SaisieStatus } from '@/lib/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  PackageCheck,
  Plus,
  Search,
  FileSpreadsheet,
  FileText,
  Trash2,
  Edit,
  Boxes,
  ShieldCheck,
  Scale,
  Archive,
  RefreshCw,
} from 'lucide-react';

import { CreateSaisieDialog } from '@/components/saisies/create-saisie-dialog';
import { EditSaisieDialog } from '@/components/saisies/edit-saisie-dialog';

const CATEGORIES = [
  'Toutes les catégories',
  'Stupéfiants & Drogues',
  'Armes & Munitions',
  'Contrebande & Devises',
  'Véhicules & Engins',
  'Électronique & High-Tech',
  'Documents / Faux Papiers',
  'Autre',
];

export default function SaisiesPage() {
  const firestore = useFirestore();
  const { role } = useRole();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Toutes les catégories');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSaisie, setEditingSaisie] = useState<Saisie | null>(null);
  const [deletingSaisie, setDeletingSaisie] = useState<Saisie | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Firestore Queries
  const saisiesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'saisies'), orderBy('dateSaisie', 'desc')) : null),
    [firestore]
  );
  const { data: saisies, isLoading } = useCollection<Saisie>(saisiesQuery);

  const agentsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'agents') : null),
    [firestore]
  );
  const { data: agents } = useCollection<Agent>(agentsQuery);

  // Statistics
  const stats = useMemo(() => {
    if (!saisies) return { total: 0, totalItems: 0, scelleCount: 0, parquetCount: 0 };

    const total = saisies.length;
    let totalItems = 0;
    let scelleCount = 0;
    let parquetCount = 0;

    saisies.forEach((s) => {
      const raw = s.quantity ?? (s as any).quantite ?? (s as any).nombre ?? (s as any).qty;
      const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw || '1').replace(',', '.'));
      totalItems += isNaN(parsed) ? 1 : parsed;
      if (s.status === 'En Dépôt / Scellé' || s.status === 'En Dépôt Coffre-Fort') {
        scelleCount++;
      }
      if (s.status === 'Transféré au Parquet') {
        parquetCount++;
      }
    });

    return { total, totalItems, scelleCount, parquetCount };
  }, [saisies]);

  // Filtered List
  const filteredSaisies = useMemo(() => {
    if (!saisies) return [];

    return saisies.filter((item) => {
      // Category filter
      if (selectedCategory !== 'Toutes les catégories' && item.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.designation.toLowerCase().includes(q) ||
        (item.pvNumber || '').toLowerCase().includes(q) ||
        (item.agentName || '').toLowerCase().includes(q) ||
        (item.detaineeName || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      );
    });
  }, [saisies, searchQuery, selectedCategory, selectedStatus]);

  // Handle Delete
  const handleDeleteConfirm = async () => {
    if (!firestore || !deletingSaisie) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'saisies', deletingSaisie.id));
      toast({
        title: 'Saisie supprimée',
        description: `L'enregistrement "${deletingSaisie.designation}" a été retiré de la base.`,
      });
      setDeletingSaisie(null);
    } catch (error) {
      console.error('Erreur lors de la suppression de la saisie:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de supprimer cette saisie.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!filteredSaisies || filteredSaisies.length === 0) {
      toast({ variant: 'destructive', title: 'Export impossible', description: 'Aucune donnée à exporter.' });
      return;
    }

    const exportData = filteredSaisies.map((s) => ({
      Désignation: s.designation,
      Quantité: s.quantity,
      Unité: s.unit || 'Unité(s)',
      Catégorie: s.category,
      'Date de Saisie': s.dateSaisie && (s.dateSaisie as any).toDate
        ? format((s.dateSaisie as any).toDate(), 'dd/MM/yyyy HH:mm', { locale: fr })
        : 'N/A',
      'Lieu / Mission': s.location || 'N/A',
      'Agent Saisissant': s.agentName || 'N/A',
      'Mis en cause / Titulaire': s.detaineeName || 'N/A',
      'Référence PV / Scellé': s.pvNumber || 'N/A',
      Statut: s.status,
      Observations: s.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Saisies');
    XLSX.writeFile(workbook, `Registre_Saisies_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({ title: 'Export Excel réussi', description: `${exportData.length} ligne(s) exportée(s).` });
  };

  // Export to PDF
  const exportToPDF = () => {
    if (!filteredSaisies || filteredSaisies.length === 0) {
      toast({ variant: 'destructive', title: 'Export impossible', description: 'Aucune donnée à exporter.' });
      return;
    }

    const docPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header Title
    docPdf.setFontSize(16);
    docPdf.setTextColor(20, 83, 45); // Dark Green
    docPdf.text('REGISTRE OFFICIEL DES SAISIES ET SCELLÉS', 14, 15);

    const totalQuantity = filteredSaisies.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    docPdf.setFontSize(9);
    docPdf.setTextColor(100);
    docPdf.text(
      `Généré le : ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })} | Actes : ${filteredSaisies.length} | Quantité totale : ${totalQuantity}`,
      14,
      21
    );

    const tableData = filteredSaisies.map((s) => [
      s.designation,
      `${s.quantity} ${s.unit || ''}`.trim(),
      s.category,
      s.dateSaisie && (s.dateSaisie as any).toDate
        ? format((s.dateSaisie as any).toDate(), 'dd/MM/yyyy', { locale: fr })
        : 'N/A',
    ]);

    autoTable(docPdf, {
      startY: 25,
      head: [['Désignation', 'Quantité', 'Catégorie', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 246] },
    });

    docPdf.save(`Registre_Saisies_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'Export PDF réussi', description: 'Le registre des saisies a été généré au format PDF.' });
  };

  // Helper badge color per status
  const getStatusBadge = (status: SaisieStatus) => {
    switch (status) {
      case 'En Dépôt / Scellé':
      case 'En Dépôt Coffre-Fort':
        return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30">{status}</Badge>;
      case 'Transféré au Parquet':
        return <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/30">{status}</Badge>;
      case 'Restitué':
        return <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{status}</Badge>;
      case 'Détruit':
        return <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <PackageCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
                Registre des Saisies & Scellés
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Enregistrement, classification et suivi opérationnel de toutes les marchandises et objets saisis.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={exportToExcel}
            variant="outline"
            size="sm"
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            Excel
          </Button>

          <Button
            onClick={exportToPDF}
            variant="outline"
            size="sm"
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs gap-1.5"
          >
            <FileText className="h-4 w-4 text-rose-400" />
            PDF
          </Button>

          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5 shadow-md shadow-emerald-950/40"
          >
            <Plus className="h-4 w-4" />
            Enregistrer une Saisie
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Actes de Saisie
            </CardTitle>
            <Archive className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white font-mono">{stats.total}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Saisies enregistrées au total</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Quantité Objets / Articles
            </CardTitle>
            <Boxes className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-400 font-mono">{stats.totalItems}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Cumul global des unités saisis</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Sous Scellés / En Dépôt
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400 font-mono">{stats.scelleCount}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Conservés au coffre ou magasin</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Transférés Parquet
            </CardTitle>
            <Scale className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-400 font-mono">{stats.parquetCount}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Transmis aux autorités judiciaires</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-900 p-3.5 rounded-xl border border-zinc-800">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Désignation, PV, agent, lieu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-950 border-zinc-800 text-xs text-white placeholder-zinc-500 focus:border-emerald-500"
          />
        </div>

        {/* Category & Status Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-52 bg-zinc-950 border-zinc-800 text-xs text-white">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white text-xs">
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-full md:w-48 bg-zinc-950 border-zinc-800 text-xs text-white">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-white text-xs">
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="En Dépôt / Scellé">En Dépôt / Scellé</SelectItem>
              <SelectItem value="Transféré au Parquet">Transféré au Parquet</SelectItem>
              <SelectItem value="Restitué">Restitué</SelectItem>
              <SelectItem value="Détruit">Détruit</SelectItem>
              <SelectItem value="En Dépôt Coffre-Fort">En Dépôt Coffre-Fort</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
              <p className="text-xs">Chargement du registre des saisies...</p>
            </div>
          ) : filteredSaisies.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
              <PackageCheck className="h-10 w-10 text-zinc-600" />
              <div>
                <p className="text-sm font-semibold text-zinc-300">Aucune saisie trouvée</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {searchQuery || selectedCategory !== 'Toutes les catégories' || selectedStatus !== 'all'
                    ? 'Aucun résultat ne correspond à vos filtres de recherche.'
                    : 'Aucun acte de saisie n\'a encore été enregistré.'}
                </p>
              </div>
              <Button
                onClick={() => setIsCreateOpen(true)}
                size="sm"
                className="mt-2 bg-emerald-600 text-white text-xs"
              >
                + Nouvelle Saisie
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-950/80 border-b border-zinc-800">
                  <TableRow className="hover:bg-transparent border-zinc-800">
                    <TableHead className="text-zinc-400 text-xs font-semibold">Désignation</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Quantité</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Catégorie</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Date & Lieu</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Agent Saisissant</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Scellé / PV</TableHead>
                    <TableHead className="text-zinc-400 text-xs font-semibold">Statut</TableHead>
                    <TableHead className="text-right text-zinc-400 text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSaisies.map((saisie) => {
                    const formattedDate = saisie.dateSaisie && (saisie.dateSaisie as any).toDate
                      ? format((saisie.dateSaisie as any).toDate(), 'dd/MM/yyyy HH:mm', { locale: fr })
                      : 'Date non spécifiée';

                    return (
                      <TableRow key={saisie.id} className="border-b border-zinc-800/60 hover:bg-zinc-850/50 transition-colors">
                        <TableCell className="font-medium text-white text-xs">
                          <div>{saisie.designation}</div>
                          {saisie.detaineeName && (
                            <div className="text-[11px] text-zinc-400 font-normal">
                              Mis en cause: <span className="text-zinc-200">{saisie.detaineeName}</span>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-xs font-bold text-emerald-400 font-mono">
                          {saisie.quantity} <span className="text-[11px] font-normal text-zinc-400">{saisie.unit || 'Unité(s)'}</span>
                        </TableCell>

                        <TableCell className="text-xs text-zinc-300">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {saisie.category}
                          </span>
                        </TableCell>

                        <TableCell className="text-xs text-zinc-300">
                          <div>{formattedDate}</div>
                          <div className="text-[11px] text-zinc-500">{saisie.location || 'Poste de Saisie'}</div>
                        </TableCell>

                        <TableCell className="text-xs text-zinc-300 font-medium">
                          {saisie.agentName || 'Non renseigné'}
                        </TableCell>

                        <TableCell className="text-xs font-mono text-zinc-300">
                          {saisie.pvNumber ? (
                            <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[11px]">
                              {saisie.pvNumber}
                            </span>
                          ) : (
                            <span className="text-zinc-500 text-[11px] italic">Non scellé</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs">
                          {getStatusBadge(saisie.status)}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingSaisie(saisie)}
                              className="h-7 w-7 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 rounded-md"
                              title="Modifier la saisie"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>

                            {(role === 'admin' || role === 'secretariat') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingSaisie(saisie)}
                                className="h-7 w-7 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-md"
                                title="Supprimer la saisie"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateSaisieDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        agents={agents || []}
      />

      <EditSaisieDialog
        open={!!editingSaisie}
        onOpenChange={(open) => !open && setEditingSaisie(null)}
        saisie={editingSaisie}
        agents={agents || []}
      />

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deletingSaisie} onOpenChange={(open) => !open && setDeletingSaisie(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300 text-xs">
              Êtes-vous sûr de vouloir supprimer définitivement l'enregistrement de saisie{' '}
              <span className="font-bold text-white">"{deletingSaisie?.designation}"</span> (Quantité : {deletingSaisie?.quantity}) ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-zinc-800 pt-3">
            <AlertDialogCancel className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border-zinc-700 text-xs">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
            >
              {isDeleting ? 'Suppression...' : 'Supprimer Définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
