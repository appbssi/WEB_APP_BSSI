'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
import { FileText, Loader2, MoreHorizontal, Plus, ScanSearch, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

import { ClientOnly } from '@/components/layout/client-only';
import { OpenRenseignementForm } from '@/components/renseignements/open-renseignement-form';
import { CompteRenduForm } from '@/components/renseignements/compte-rendu-form';
import { PriorityBadge } from '@/components/informations/priority-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import { priorityRank } from '@/lib/informations';
import { CONCLUSION_LABELS, STATUS_LABELS } from '@/lib/renseignements';
import type { Information, Renseignement, RenseignementConclusion } from '@/lib/types';
import { cn } from '@/lib/utils';

type TabValue = 'en_cours' | 'termine' | 'all';

const CONCLUSION_STYLES: Record<RenseignementConclusion, string> = {
  confirmee: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
  partielle: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30',
  infirmee: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30',
  indeterminee: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
};

function StatusBadge({ r }: { r: Renseignement }) {
  if (r.status === 'termine' && r.conclusion && CONCLUSION_STYLES[r.conclusion]) {
    return (
      <Badge className={cn('hover:bg-transparent', CONCLUSION_STYLES[r.conclusion])}>{CONCLUSION_LABELS[r.conclusion]}</Badge>
    );
  }
  return <Badge className="hover:bg-transparent bg-primary/15 text-primary border border-primary/30">{STATUS_LABELS.en_cours}</Badge>;
}

function fmt(ts?: { toDate?: () => Date } | null) {
  return ts?.toDate?.().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) ?? '—';
}

export default function RenseignementsPage() {
  return (
    <ClientOnly>
      <RenseignementsContent />
    </ClientOnly>
  );
}

function RenseignementsContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabValue>('en_cours');
  const [search, setSearch] = useState('');
  const [openForInformation, setOpenForInformation] = useState<string | null>(null); // '' = sans présélection
  const [selected, setSelected] = useState<Renseignement | null>(null);
  const [writing, setWriting] = useState<Renseignement | null>(null);
  const [toDelete, setToDelete] = useState<Renseignement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const renseignementsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'renseignements') : null),
    [firestore],
  );
  const informationsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'informations') : null),
    [firestore],
  );
  const { data: renseignements, isLoading } = useCollection<Renseignement>(renseignementsQuery);
  const { data: informations } = useCollection<Information>(informationsQuery);

  // Lien depuis la page Informations : /renseignements?information=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('information');
    if (id) {
      setOpenForInformation(id);
      window.history.replaceState(null, '', '/renseignements');
    }
  }, []);

  // Garder le détail à jour après la rédaction du compte rendu
  useEffect(() => {
    if (!selected || !renseignements) return;
    const fresh = renseignements.find((r) => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [renseignements, selected]);

  const counts = useMemo(() => {
    const list = renseignements ?? [];
    const enCours = list.filter((r) => r.status !== 'termine').length;
    return { en_cours: enCours, termine: list.length - enCours, all: list.length };
  }, [renseignements]);

  const filtered = useMemo(() => {
    if (!renseignements) return [];
    const q = search.trim().toLowerCase();
    return renseignements
      .filter((r) => tab === 'all' || (tab === 'termine' ? r.status === 'termine' : r.status !== 'termine'))
      .filter(
        (r) =>
          !q ||
          [r.informationSource, r.informationObjet, r.assignedTo, r.compteRendu]
            .some((v) => v?.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          (tab === 'termine' ? 0 : priorityRank(a.informationPriority) - priorityRank(b.informationPriority)) ||
          (b.compteRenduAt?.toMillis?.() ?? b.startedAt?.toMillis?.() ?? 0) -
            (a.compteRenduAt?.toMillis?.() ?? a.startedAt?.toMillis?.() ?? 0),
      );
  }, [renseignements, search, tab]);

  const handleDelete = () => {
    if (!firestore || !toDelete) return;
    setIsDeleting(true);
    const ref = doc(firestore, 'renseignements', toDelete.id);
    deleteDoc(ref)
      .then(() => {
        toast({ title: 'Renseignement supprimé' });
        logActivity(firestore, `Suppression d'un renseignement — information « ${toDelete.informationSource} »`, 'Renseignement', '/renseignements');
        if (selected?.id === toDelete.id) setSelected(null);
        setToDelete(null);
      })
      .catch(() => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ref.path, operation: 'delete' }));
      })
      .finally(() => setIsDeleting(false));
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={ScanSearch}
        title="Renseignements"
        description="Vérification des informations enregistrées, puis compte rendu."
      >
        <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setOpenForInformation('')}>
          <Plus className="h-4 w-4" />
          Nouveau renseignement
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="en_cours">En cours ({counts.en_cours})</TabsTrigger>
            <TabsTrigger value="termine">Comptes rendus ({counts.termine})</TabsTrigger>
            <TabsTrigger value="all">Tous ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-sm sm:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Priorité</TableHead>
              <TableHead>Information</TableHead>
              <TableHead>Chargé(s)</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="whitespace-nowrap">Ouvert le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Chargement…</TableCell>
              </TableRow>
            ) : filtered.length > 0 ? (
              filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell><PriorityBadge priority={r.informationPriority} /></TableCell>
                  <TableCell className="max-w-[360px]">
                    <p className="font-medium">{r.informationSource}</p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">{r.informationObjet}</p>
                  </TableCell>
                  <TableCell className="text-sm">{r.assignedTo}</TableCell>
                  <TableCell><StatusBadge r={r} /></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.startedAt)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setSelected(r)}>Voir le détail</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setWriting(r)}>
                          {r.status === 'termine' ? 'Modifier le compte rendu' : 'Rédiger le compte rendu'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setToDelete(r)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {tab === 'en_cours' ? 'Aucun renseignement en cours.' : tab === 'termine' ? 'Aucun compte rendu.' : 'Aucun renseignement.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Ouvrir un renseignement */}
      <Dialog open={openForInformation !== null} onOpenChange={(o) => !o && setOpenForInformation(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Ouvrir un renseignement</DialogTitle>
            <DialogDescription>Choisissez l'information à vérifier et qui en est chargé.</DialogDescription>
          </DialogHeader>
          {openForInformation !== null && (
            <OpenRenseignementForm
              informations={informations ?? []}
              defaultInformationId={openForInformation || undefined}
              onSuccess={() => {
                setOpenForInformation(null);
                setTab('en_cours');
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Compte rendu */}
      <Dialog open={!!writing} onOpenChange={(o) => !o && setWriting(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{writing?.status === 'termine' ? 'Modifier le compte rendu' : 'Compte rendu de renseignement'}</DialogTitle>
            <DialogDescription>Le renseignement passe en « compte rendu fait » une fois enregistré.</DialogDescription>
          </DialogHeader>
          {writing && <CompteRenduForm renseignement={writing} onSuccess={() => setWriting(null)} />}
        </DialogContent>
      </Dialog>

      {/* Détail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  Renseignement <PriorityBadge priority={selected.informationPriority} /> <StatusBadge r={selected} />
                </DialogTitle>
                <DialogDescription>
                  Ouvert le {fmt(selected.startedAt)}
                  {selected.createdBy ? ` par ${selected.createdBy}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <section>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Information — source : {selected.informationSource}</p>
                  <p className="mt-1 whitespace-pre-wrap">{selected.informationObjet}</p>
                </section>
                <section className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Chargé(s)</p>
                    <p className="mt-1">{selected.assignedTo}</p>
                  </div>
                  {selected.instructions && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Consignes</p>
                      <p className="mt-1 whitespace-pre-wrap">{selected.instructions}</p>
                    </div>
                  )}
                </section>
                <section className="rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Compte rendu</p>
                  {selected.status === 'termine' && selected.compteRendu ? (
                    <>
                      <p className="mt-1 whitespace-pre-wrap">{selected.compteRendu}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Rédigé le {fmt(selected.compteRenduAt)}
                        {selected.compteRenduBy ? ` par ${selected.compteRenduBy}` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Pas encore rédigé.</p>
                  )}
                </section>
                <Button className="w-full" variant={selected.status === 'termine' ? 'outline' : 'default'} onClick={() => setWriting(selected)}>
                  <FileText className="mr-2 h-4 w-4" />
                  {selected.status === 'termine' ? 'Modifier le compte rendu' : 'Rédiger le compte rendu'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce renseignement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le renseignement et son compte rendu seront supprimés définitivement. L'information d'origine est conservée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
