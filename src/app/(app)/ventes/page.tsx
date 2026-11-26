'use client';

import { useMemo, useState } from 'react';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { deleteDoc } from '@/lib/firestore-fast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useRole } from '@/hooks/use-role';
import { useToast } from '@/hooks/use-toast';
import type { Saisie, Vente, VenteType } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Banknote, Edit, FileSpreadsheet, Gavel, Plus, RefreshCw, Search, Store, Trash2 } from 'lucide-react';

import { VenteDialog, VENTE_TYPE_LABELS } from '@/components/ventes/vente-dialog';

type Onglet = 'toutes' | VenteType;

const fcfa = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('fr-FR')} FCFA`;

const dateOf = (v: Vente) =>
  v.dateVente && (v.dateVente as any).toDate ? format((v.dateVente as any).toDate(), 'dd/MM/yyyy', { locale: fr }) : '—';

export default function VentesPage() {
  const firestore = useFirestore();
  const { role } = useRole();
  const { toast } = useToast();

  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVente, setEditingVente] = useState<Vente | null>(null);
  const [deletingVente, setDeletingVente] = useState<Vente | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const ventesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'ventes'), orderBy('dateVente', 'desc')) : null),
    [firestore]
  );
  const { data: ventes, isLoading } = useCollection<Vente>(ventesQuery);

  const saisiesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'saisies'), orderBy('dateSaisie', 'desc')) : null),
    [firestore]
  );
  const { data: saisies } = useCollection<Saisie>(saisiesQuery);

  const stats = useMemo(() => {
    const list = ventes || [];
    const sum = (l: Vente[]) => l.reduce((t, v) => t + (Number(v.montant) || 0), 0);
    const locales = list.filter((v) => v.type === 'locale');
    const encheres = list.filter((v) => v.type === 'encheres');
    return {
      total: list.length,
      montantTotal: sum(list),
      locales: locales.length,
      montantLocales: sum(locales),
      encheres: encheres.length,
      montantEncheres: sum(encheres),
    };
  }, [ventes]);

  const filtered = useMemo(() => {
    const list = (ventes || []).filter((v) => onglet === 'toutes' || v.type === onglet);
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter((v) =>
      [v.designation, v.acheteur, v.reference, v.lieu, v.organisateur]
        .some((field) => (field || '').toLowerCase().includes(q))
    );
  }, [ventes, onglet, searchQuery]);

  const canDelete = role === 'admin' || role === 'secretariat';

  const handleDelete = async () => {
    if (!firestore || !deletingVente) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'ventes', deletingVente.id));
      toast({ title: 'Vente supprimée', description: `« ${deletingVente.designation} » a été retirée.` });
      setDeletingVente(null);
    } catch (error) {
      console.error('Erreur lors de la suppression de la vente:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de supprimer cette vente.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToExcel = async () => {
    if (filtered.length === 0) {
      toast({ variant: 'destructive', title: 'Export impossible', description: 'Aucune vente à exporter.' });
      return;
    }
    const rows = filtered.map((v) => ({
      Type: VENTE_TYPE_LABELS[v.type],
      Date: dateOf(v),
      'Objet vendu': v.designation,
      Quantité: v.quantity,
      Unité: v.unit || 'Unité(s)',
      'Acheteur / Adjudicataire': v.acheteur || '',
      'Mise à prix (FCFA)': v.prixDepart ?? '',
      'Montant (FCFA)': v.montant,
      'Référence PV': v.reference || '',
      Lieu: v.lieu || '',
      'Commissaire-priseur / organisateur': v.organisateur || '',
      Observations: v.notes || '',
    }));
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Ventes');
    XLSX.writeFile(book, `Ventes_Saisies_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Excel réussi', description: `${rows.length} vente(s) exportée(s).` });
  };

  const kpis = [
    { label: 'Ventes enregistrées', value: String(stats.total), hint: fcfa(stats.montantTotal), icon: Banknote, tone: 'text-primary bg-primary/10' },
    { label: 'Ventes en local', value: String(stats.locales), hint: fcfa(stats.montantLocales), icon: Store, tone: 'text-sky-600 bg-sky-500/10' },
    { label: 'Ventes aux enchères', value: String(stats.encheres), hint: fcfa(stats.montantEncheres), icon: Gavel, tone: 'text-violet-600 bg-violet-500/10' },
  ];

  const isEncheresTab = onglet === 'encheres';

  return (
    <div className="space-y-6 pb-12">
      {/* En-tête */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
            <Gavel className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Ventes des saisies</h1>
            <p className="text-sm text-muted-foreground">Ventes en local et ventes aux enchères des objets saisis.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-1.5 font-semibold">
            <Plus className="h-4 w-4" />
            Enregistrer une vente
          </Button>
          <Button onClick={exportToExcel} variant="outline" size="sm" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel
          </Button>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <Card key={label} className="rounded-2xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`shrink-0 rounded-xl p-2.5 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
                <p className="truncate text-[11px] font-medium text-muted-foreground tabular-nums">{hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Registre des ventes */}
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-2.5 border-b p-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
            <TabsList className="h-9">
              <TabsTrigger value="toutes" className="text-xs">Toutes ({stats.total})</TabsTrigger>
              <TabsTrigger value="locale" className="gap-1.5 text-xs">
                <Store className="h-3.5 w-3.5" />
                En local ({stats.locales})
              </TabsTrigger>
              <TabsTrigger value="encheres" className="gap-1.5 text-xs">
                <Gavel className="h-3.5 w-3.5" />
                Aux enchères ({stats.encheres})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Objet, acheteur, n° de PV, lieu…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Chargement des ventes…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
              {isEncheresTab ? <Gavel className="h-10 w-10 opacity-40" /> : <Store className="h-10 w-10 opacity-40" />}
              <div>
                <p className="text-sm font-semibold text-foreground">Aucune vente trouvée</p>
                <p className="mt-1 text-xs">
                  {searchQuery
                    ? 'Aucun résultat ne correspond à votre recherche.'
                    : onglet === 'toutes'
                      ? "Aucune vente n'a encore été enregistrée."
                      : `Aucune ${VENTE_TYPE_LABELS[onglet].toLowerCase()} enregistrée.`}
                </p>
              </div>
              {!searchQuery && (
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="mt-1 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Nouvelle vente
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Type</TableHead>
                    <TableHead className="text-xs font-semibold">Objet vendu</TableHead>
                    <TableHead className="text-xs font-semibold">Quantité</TableHead>
                    <TableHead className="text-xs font-semibold">Acheteur / Adjudicataire</TableHead>
                    {onglet !== 'locale' && <TableHead className="text-xs font-semibold">Mise à prix</TableHead>}
                    <TableHead className="text-right text-xs font-semibold">Montant</TableHead>
                    <TableHead className="text-xs font-semibold">Réf. PV</TableHead>
                    <TableHead className="w-20 text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        <p className="text-foreground">{dateOf(v)}</p>
                        {v.lieu && <p className="text-muted-foreground">{v.lieu}</p>}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                            v.type === 'encheres'
                              ? 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400'
                              : 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400'
                          }`}
                        >
                          {v.type === 'encheres' ? <Gavel className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                          {v.type === 'encheres' ? 'Enchères' : 'Local'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-foreground">{v.designation}</p>
                        {v.organisateur && (
                          <p className="text-[11px] text-muted-foreground">Organisée par {v.organisateur}</p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="font-bold tabular-nums">{v.quantity}</span>{' '}
                        <span className="text-xs text-muted-foreground">{v.unit || 'unité(s)'}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {v.acheteur ? (
                          <span className="font-medium text-foreground">{v.acheteur}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {onglet !== 'locale' && (
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {v.type === 'encheres' ? fcfa(v.prixDepart) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap text-right text-sm font-bold tabular-nums">
                        {fcfa(v.montant)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {v.reference ? (
                          <span className="font-mono text-[11px] text-foreground">{v.reference}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingVente(v)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Modifier la vente"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingVente(v)}
                              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Supprimer la vente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {!isLoading && filtered.length > 0 && (
          <div className="flex flex-wrap justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              {filtered.length} vente{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
            </span>
            <span className="font-semibold text-foreground tabular-nums">
              Total : {fcfa(filtered.reduce((t, v) => t + (Number(v.montant) || 0), 0))}
            </span>
          </div>
        )}
      </Card>

      <VenteDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        defaultType={onglet === 'encheres' ? 'encheres' : 'locale'}
        saisies={saisies || []}
      />
      <VenteDialog
        open={!!editingVente}
        onOpenChange={(open) => !open && setEditingVente(null)}
        vente={editingVente}
        saisies={saisies || []}
      />

      <AlertDialog open={!!deletingVente} onOpenChange={(open) => !open && setDeletingVente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Supprimer cette vente ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La {deletingVente ? VENTE_TYPE_LABELS[deletingVente.type].toLowerCase() : 'vente'} de{' '}
              <span className="font-semibold text-foreground">« {deletingVente?.designation} »</span> (
              {fcfa(deletingVente?.montant)}) sera supprimée définitivement. Le statut de la saisie n&apos;est pas modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
