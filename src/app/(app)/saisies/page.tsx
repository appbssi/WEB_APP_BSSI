'use client';

import { useState, useMemo } from 'react';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import type { Saisie, Agent, SaisieStatus } from '@/lib/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
  const exportToExcel = async () => {
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

    // Chargé à la demande pour ne pas alourdir le premier chargement de la page
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Saisies');
    XLSX.writeFile(workbook, `Registre_Saisies_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({ title: 'Export Excel réussi', description: `${exportData.length} ligne(s) exportée(s).` });
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!filteredSaisies || filteredSaisies.length === 0) {
      toast({ variant: 'destructive', title: 'Export impossible', description: 'Aucune donnée à exporter.' });
      return;
    }

    // Chargés à la demande pour ne pas alourdir le premier chargement de la page
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
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
      `${s.quantity}`,
      s.dateSaisie && (s.dateSaisie as any).toDate
        ? format((s.dateSaisie as any).toDate(), 'dd/MM/yyyy', { locale: fr })
        : 'N/A',
    ]);

    autoTable(docPdf, {
      startY: 25,
      head: [['Désignation', 'Quantité', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 247, 246] },
    });

    docPdf.save(`Registre_Saisies_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'Export PDF réussi', description: 'Le registre des saisies a été généré au format PDF.' });
  };

  // Pastille de statut (point coloré + libellé)
  const STATUS_TONES: Record<string, string> = {
    'En Dépôt / Scellé': 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
    'En Dépôt Coffre-Fort': 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400',
    'Transféré au Parquet': 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400',
    'Restitué': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400',
    'Détruit': 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400',
  };

  const getStatusBadge = (status: SaisieStatus) => (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        STATUS_TONES[status] ?? 'bg-muted text-muted-foreground ring-border'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );

  const kpis = [
    { label: 'Actes de saisie', value: stats.total, hint: 'Saisies enregistrées', icon: Archive, tone: 'text-primary bg-primary/10' },
    { label: 'Objets / articles', value: stats.totalItems, hint: 'Unités saisies au total', icon: Boxes, tone: 'text-sky-600 bg-sky-500/10' },
    { label: 'Sous scellés / en dépôt', value: stats.scelleCount, hint: 'Au coffre ou au magasin', icon: ShieldCheck, tone: 'text-amber-600 bg-amber-500/10' },
    { label: 'Transférés au parquet', value: stats.parquetCount, hint: 'Remis aux autorités judiciaires', icon: Scale, tone: 'text-indigo-600 bg-indigo-500/10' },
  ];

  const hasFilters = !!searchQuery || selectedCategory !== 'Toutes les catégories' || selectedStatus !== 'all';

  return (
    <div className="space-y-6 pb-12">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <PackageCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Registre des saisies &amp; scellés</h1>
            <p className="text-sm text-muted-foreground">
              Enregistrement et suivi des marchandises et objets saisis.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={exportToExcel} variant="outline" size="sm" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel
          </Button>
          <Button onClick={exportToPDF} variant="outline" size="sm" className="gap-1.5">
            <FileText className="h-4 w-4 text-rose-600" />
            PDF
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-1.5 font-semibold">
            <Plus className="h-4 w-4" />
            Enregistrer une saisie
          </Button>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <Card key={label} className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`shrink-0 rounded-xl p-2.5 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Registre */}
      <Card className="overflow-hidden rounded-2xl">
        {/* Recherche et filtres */}
        <div className="flex flex-col gap-2.5 border-b p-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Désignation, PV, agent, lieu…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:ml-auto md:flex">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 text-xs md:w-48">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-9 text-xs md:w-48">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
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

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Chargement du registre des saisies…</p>
            </div>
          ) : filteredSaisies.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
              <PackageCheck className="h-10 w-10 opacity-40" />
              <div>
                <p className="text-sm font-semibold text-foreground">Aucune saisie trouvée</p>
                <p className="mt-1 text-xs">
                  {hasFilters
                    ? 'Aucun résultat ne correspond à vos filtres de recherche.'
                    : "Aucun acte de saisie n'a encore été enregistré."}
                </p>
              </div>
              {!hasFilters && (
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="mt-1 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Nouvelle saisie
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">Désignation</TableHead>
                    <TableHead className="text-xs font-semibold">Quantité</TableHead>
                    <TableHead className="text-xs font-semibold">Date &amp; lieu</TableHead>
                    <TableHead className="text-xs font-semibold">Agent saisissant</TableHead>
                    <TableHead className="text-xs font-semibold">Scellé / PV</TableHead>
                    <TableHead className="text-xs font-semibold">Statut</TableHead>
                    <TableHead className="w-20 text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSaisies.map((saisie) => {
                    const formattedDate = saisie.dateSaisie && (saisie.dateSaisie as any).toDate
                      ? format((saisie.dateSaisie as any).toDate(), 'dd/MM/yyyy HH:mm', { locale: fr })
                      : 'Date non spécifiée';

                    return (
                      <TableRow key={saisie.id} className="group">
                        <TableCell className="py-3">
                          <p className="text-sm font-semibold text-foreground">{saisie.designation}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-px">{saisie.category}</span>
                            {saisie.detaineeName && <span>Mis en cause : {saisie.detaineeName}</span>}
                          </p>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="font-bold tabular-nums">{saisie.quantity}</span>{' '}
                          <span className="text-xs text-muted-foreground">{saisie.unit || 'unité(s)'}</span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-xs">
                          <p className="text-foreground">{formattedDate}</p>
                          <p className="text-muted-foreground">{saisie.location || 'Lieu non spécifié'}</p>
                        </TableCell>

                        <TableCell className="text-xs">
                          {saisie.agentName && saisie.agentName !== 'Agent Non Spécifié' ? (
                            <span className="font-medium text-foreground">{saisie.agentName}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs">
                          {saisie.pvNumber ? (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300">
                              {saisie.pvNumber}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Non scellé</span>
                          )}
                        </TableCell>

                        <TableCell>{getStatusBadge(saisie.status)}</TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingSaisie(saisie)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Modifier la saisie"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {(role === 'admin' || role === 'secretariat') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingSaisie(saisie)}
                                className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Supprimer la saisie"
                              >
                                <Trash2 className="h-4 w-4" />
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

        {!isLoading && filteredSaisies.length > 0 && (
          <div className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
            {filteredSaisies.length} saisie{filteredSaisies.length > 1 ? 's' : ''} affichée{filteredSaisies.length > 1 ? 's' : ''}
            {hasFilters && saisies ? ` sur ${saisies.length}` : ''}
          </div>
        )}
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

      {/* Confirmation de suppression */}
      <AlertDialog open={!!deletingSaisie} onOpenChange={(open) => !open && setDeletingSaisie(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer définitivement la saisie{' '}
              <span className="font-semibold text-foreground">« {deletingSaisie?.designation} »</span> (quantité :{' '}
              {deletingSaisie?.quantity}) ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
