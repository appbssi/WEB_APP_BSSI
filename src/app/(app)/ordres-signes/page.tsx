'use client';

import { useMemo, useState } from 'react';
import { collection, deleteField, doc, getDocs, increment, query, Timestamp, where } from 'firebase/firestore';
import { setDoc, writeBatch } from '@/lib/firestore-fast';
import { Eye, FileSignature, Loader2, MoreHorizontal, Printer, Search, Upload } from 'lucide-react';

import { ClientOnly } from '@/components/layout/client-only';
import { ArchiveScanDialog } from '@/components/ordres-signes/archive-scan-dialog';
import { ViewScanDialog } from '@/components/ordres-signes/view-scan-dialog';
import type { PdfDocumentItem } from '@/components/pdf/pdf-history-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import { generateOrdreDeMissionPDF } from '@/lib/pdf-generator-lazy';
import { getOrderStage, missionAgentKeys, STAGE_LABELS, type OrderStage, type SignedOrder } from '@/lib/signed-orders';
import { cn } from '@/lib/utils';

type TabValue = OrderStage | 'all';

type Row = {
  order: PdfDocumentItem;
  record: SignedOrder | undefined;
  stage: OrderStage;
  missionName: string;
};

const STAGE_STYLES: Record<OrderStage, string> = {
  a_imprimer: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
  a_signer: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
  archive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
};

const toDate = (v: unknown): Date | null => {
  const x = v as { toDate?: () => Date; seconds?: number } | null;
  if (!x) return null;
  if (typeof x.toDate === 'function') return x.toDate();
  if (typeof x.seconds === 'number') return new Date(x.seconds * 1000);
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v: unknown) => toDate(v)?.toLocaleDateString('fr-FR') ?? '—';

export default function OrdresSignesPage() {
  return (
    <ClientOnly>
      <OrdresSignesContent />
    </ClientOnly>
  );
}

function OrdresSignesContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabValue>('a_imprimer');
  const [search, setSearch] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<SignedOrder | null>(null);
  const [toRemove, setToRemove] = useState<Row | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Ordres de mission générés (un document par mission validée)
  const ordersQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'pdf_documents'), where('type', '==', 'ordre_de_mission')) : null),
    [firestore],
  );
  const recordsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'signed_orders') : null), [firestore]);
  const { data: orders, isLoading } = useCollection<PdfDocumentItem>(ordersQuery);
  const { data: records } = useCollection<SignedOrder>(recordsQuery);

  const rows = useMemo((): Row[] => {
    const byId = new Map((records ?? []).map((r) => [r.id, r]));
    return (orders ?? [])
      .map((order) => {
        const record = byId.get(order.id);
        return {
          order,
          record,
          stage: getOrderStage(record),
          missionName: order.missionData?.name || order.title?.replace(/^Ordre de Mission - /, '') || 'Mission',
        };
      })
      .sort((a, b) => (toDate(b.order.createdAt)?.getTime() ?? 0) - (toDate(a.order.createdAt)?.getTime() ?? 0));
  }, [orders, records]);

  const counts = useMemo(() => {
    const c: Record<TabValue, number> = { a_imprimer: 0, a_signer: 0, archive: 0, all: rows.length };
    rows.forEach((r) => (c[r.stage] += 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tab === 'all' || r.stage === tab) &&
        (!q ||
          [r.missionName, r.order.missionData?.location, r.order.leaderName, ...(r.order.agentNames ?? []), r.record?.signatory]
            .some((v) => typeof v === 'string' && v.toLowerCase().includes(q))),
    );
  }, [rows, tab, search]);

  // Imprimer (« tirer ») l'ordre pour signature : regénère le PDF et note l'impression
  const handlePrint = async (row: Row) => {
    if (!firestore) return;
    const { order } = row;
    if (!order.missionData) {
      toast({ variant: 'destructive', title: 'Ordre incomplet', description: 'Les données de la mission manquent pour regénérer ce PDF.' });
      return;
    }
    setPrintingId(order.id);
    try {
      const agents =
        order.missionData.agents?.length
          ? order.missionData.agents
          : (order.assignedAgentIds?.length ? order.assignedAgentIds : order.agentIds || []).map((id, i) => ({ id, fullName: order.agentNames?.[i] || 'Agent' }));
      await generateOrdreDeMissionPDF(order.missionData, agents, order.vehiclePlate || undefined, order.leaderId || undefined);

      await setDoc(
        doc(firestore, 'signed_orders', order.id),
        {
          pdfDocId: order.id,
          missionId: order.missionData.id ?? null,
          missionName: row.missionName,
          // Une réimpression ne fait pas perdre l'archive déjà faite
          ...(row.stage === 'archive' ? {} : { status: 'a_signer' }),
          printedAt: Timestamp.now(),
          printCount: increment(1),
          printedBy: deleteField(), // ancien champ (IDC de l'administrateur) : retiré
        },
        { merge: true },
      );
      if (row.stage === 'a_imprimer') {
        logActivity(firestore, `Ordre de mission imprimé pour signature : ${row.missionName}`, 'Mission', '/ordres-signes');
        toast({ title: 'Ordre imprimé', description: 'Faites-le signer, puis archivez le scan signé.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de générer ou d'enregistrer l'impression." });
    } finally {
      setPrintingId(null);
    }
  };

  // Retirer le scan archivé : l'ordre revient « en attente de signature »
  const handleRemoveArchive = async () => {
    if (!firestore || !toRemove) return;
    setIsRemoving(true);
    try {
      const ref = doc(firestore, 'signed_orders', toRemove.order.id);
      const filesSnap = await getDocs(collection(ref, 'files'));
      const batch = writeBatch(firestore);
      filesSnap.forEach((d) => batch.delete(d.ref));
      batch.set(
        ref,
        { status: 'a_signer', archivedAt: null, signedOn: null, signatory: '', notes: '', fileCount: 0, agentIds: [] },
        { merge: true },
      );
      await batch.commit();
      logActivity(firestore, `Scan d'ordre signé retiré : ${toRemove.missionName}`, 'Mission', '/ordres-signes');
      toast({ title: 'Scan retiré', description: "L'ordre est de nouveau en attente de signature." });
      setToRemove(null);
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de retirer le scan.' });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ordres de mission signés</h1>
        <p className="text-sm text-muted-foreground">
          1. Imprimez l’ordre généré · 2. Faites-le signer · 3. Scannez-le et archivez-le ici.
        </p>
      </div>

      {/* Onglets sur une seule ligne (défilement horizontal sur petit écran), recherche compacte à droite */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="min-w-0 max-w-full">
          <TabsList className="flex w-full md:w-auto justify-start overflow-x-auto">
            <TabsTrigger value="a_imprimer" className="shrink-0">À imprimer ({counts.a_imprimer})</TabsTrigger>
            <TabsTrigger value="a_signer" className="shrink-0">À signer ({counts.a_signer})</TabsTrigger>
            <TabsTrigger value="archive" className="shrink-0">Archivés ({counts.archive})</TabsTrigger>
            <TabsTrigger value="all" className="shrink-0">Tous ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-9 text-sm" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mission</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">Chargement…</TableCell>
              </TableRow>
            ) : filtered.length > 0 ? (
              filtered.map((row) => {
                const { order, record, stage } = row;
                const m = order.missionData;
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <p className="font-semibold">{row.missionName}</p>
                      <p className="text-xs text-muted-foreground">{m?.location || '—'} · généré le {fmtDate(order.createdAt)}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDate(m?.startDate)} → {fmtDate(m?.endDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {/* Libellé court ; le détail (date, nombre de pages) apparaît au survol */}
                      <Badge
                        className={cn('hover:bg-transparent', STAGE_STYLES[stage])}
                        title={
                          stage === 'archive'
                            ? `Signé le ${fmtDate(record?.signedOn)} · ${record?.fileCount ?? 0} page(s)`
                            : stage === 'a_signer'
                              ? `Imprimé le ${fmtDate(record?.printedAt)}`
                              : undefined
                        }
                      >
                        {STAGE_LABELS[stage]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {stage === 'a_imprimer' && (
                          <Button size="sm" variant="outline" disabled={printingId === order.id} onClick={() => handlePrint(row)}>
                            {printingId === order.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1 h-3.5 w-3.5" />}
                            Imprimer
                          </Button>
                        )}
                        {stage === 'a_signer' && (
                          <Button size="sm" onClick={() => setArchiving(row)}>
                            <Upload className="mr-1 h-3.5 w-3.5" /> Archiver le scan
                          </Button>
                        )}
                        {stage === 'archive' && record && (
                          <Button size="sm" variant="outline" onClick={() => setViewing(record)}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Voir
                          </Button>
                        )}
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Autres actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => handlePrint(row)}>
                              <Printer className="mr-2 h-4 w-4" /> {stage === 'a_imprimer' ? 'Imprimer' : 'Réimprimer'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setArchiving(row)}>
                              <FileSignature className="mr-2 h-4 w-4" />
                              {stage === 'archive' ? 'Remplacer le scan signé' : 'Archiver le scan signé'}
                            </DropdownMenuItem>
                            {stage === 'archive' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setToRemove(row)}
                                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                >
                                  Retirer le scan archivé
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {tab === 'a_imprimer'
                    ? 'Aucun ordre à imprimer.'
                    : tab === 'a_signer'
                      ? 'Aucun ordre en attente de signature.'
                      : tab === 'archive'
                        ? 'Aucun ordre signé archivé.'
                        : 'Aucun ordre de mission généré.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {archiving && (
        <ArchiveScanDialog
          open={!!archiving}
          onOpenChange={(o) => !o && setArchiving(null)}
          pdfDocId={archiving.order.id}
          missionId={archiving.order.missionData?.id ?? null}
          missionName={archiving.missionName}
          agentIds={missionAgentKeys(archiving.order)}
          existing={archiving.stage === 'archive' ? archiving.record : null}
        />
      )}

      <ViewScanDialog order={viewing} onOpenChange={(o) => !o && setViewing(null)} />

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer le scan archivé ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les pages scannées de l’ordre « {toRemove?.missionName} » seront supprimées définitivement. L’ordre repassera
              « en attente de signature » et ne sera plus visible par les agents de la mission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveArchive} className="bg-destructive hover:bg-destructive/90" disabled={isRemoving}>
              {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
