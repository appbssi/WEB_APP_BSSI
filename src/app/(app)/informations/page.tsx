'use client';

import { useMemo, useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
import { Loader2, MoreHorizontal, Plus, Radar, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

import { ClientOnly } from '@/components/layout/client-only';
import { RegisterInformationForm } from '@/components/informations/register-information-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { INFORMATION_PRIORITIES, PRIORITY_LABELS, isInformationPriority, sortInformations } from '@/lib/informations';
import { renseignementStateByInformation } from '@/lib/renseignements';
import { PriorityBadge } from '@/components/informations/priority-badge';
import type { Information, InformationPriority, Renseignement, RenseignementStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

function RenseignementBadge({ state }: { state?: RenseignementStatus }) {
  if (!state) return <span className="text-xs text-muted-foreground">À vérifier</span>;
  return state === 'en_cours' ? (
    <Badge className="hover:bg-transparent bg-primary/15 text-primary border border-primary/30">En cours</Badge>
  ) : (
    <Badge className="hover:bg-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
      Compte rendu fait
    </Badge>
  );
}

function formatDate(info: Information) {
  return info.createdAt?.toDate?.().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) ?? '—';
}

export default function InformationsPage() {
  return (
    <ClientOnly>
      <InformationsContent />
    </ClientOnly>
  );
}

function InformationsContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | InformationPriority>('all');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Information | null>(null);
  const [toDelete, setToDelete] = useState<Information | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const informationsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'informations') : null),
    [firestore],
  );
  const { data: informations, isLoading } = useCollection<Information>(informationsQuery);

  const router = useRouter();
  const renseignementsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'renseignements') : null),
    [firestore],
  );
  const { data: renseignements } = useCollection<Renseignement>(renseignementsQuery);
  const rState = useMemo(() => renseignementStateByInformation(renseignements ?? []), [renseignements]);
  const openRenseignement = (info: Information) => router.push(`/renseignements?information=${encodeURIComponent(info.id)}`);

  const counts = useMemo(() => {
    const c: Record<InformationPriority, number> = { urgente: 0, haute: 0, moyenne: 0, basse: 0 };
    informations?.forEach((i) => {
      if (isInformationPriority(i.priority)) c[i.priority] += 1;
    });
    return c;
  }, [informations]);

  const filtered = useMemo(() => {
    if (!informations) return [];
    const q = search.trim().toLowerCase();
    return sortInformations(
      informations.filter(
        (i) =>
          (priorityFilter === 'all' || i.priority === priorityFilter) &&
          (!q || i.source?.toLowerCase().includes(q) || i.objet?.toLowerCase().includes(q)),
      ),
    );
  }, [informations, search, priorityFilter]);

  const handleDelete = () => {
    if (!firestore || !toDelete) return;
    setIsDeleting(true);
    const ref = doc(firestore, 'informations', toDelete.id);
    deleteDoc(ref)
      .then(() => {
        toast({ title: 'Information supprimée' });
        logActivity(firestore, `Suppression d'une information — source : ${toDelete.source}`, 'Information', '/informations');
        setToDelete(null);
      })
      .catch(() => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: ref.path, operation: 'delete' }));
      })
      .finally(() => setIsDeleting(false));
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader icon={Radar} title="Informations" description="Informations reçues : source, objet et degré de priorité.">
        <Dialog open={isCreateOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 font-semibold">
              <Plus className="h-4 w-4" />
              Enregistrer une information
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Enregistrer une information</DialogTitle>
              <DialogDescription>Source, objet et degré de priorité.</DialogDescription>
            </DialogHeader>
            <RegisterInformationForm onSuccess={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Compteurs par priorité : un clic filtre la liste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INFORMATION_PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriorityFilter((cur) => (cur === p ? 'all' : p))}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
              priorityFilter === p && 'ring-2 ring-primary',
            )}
          >
            <PriorityBadge priority={p} />
            <p className="mt-2 text-2xl font-bold tabular-nums">{counts[p]}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher dans la source ou l'objet…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as 'all' | InformationPriority)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les priorités</SelectItem>
            {INFORMATION_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Priorité</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead className="whitespace-nowrap">Reçue le</TableHead>
              <TableHead>Renseignement</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : filtered.length > 0 ? (
              filtered.map((info) => (
                <TableRow key={info.id} className="cursor-pointer" onClick={() => setSelected(info)}>
                  <TableCell>
                    <PriorityBadge priority={info.priority} />
                  </TableCell>
                  <TableCell className="font-medium">{info.source}</TableCell>
                  <TableCell className="max-w-[420px]">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{info.objet}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(info)}</TableCell>
                  <TableCell>
                    <RenseignementBadge state={rState.get(info.id)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setSelected(info)}>Voir le détail</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openRenseignement(info)}>Ouvrir un renseignement</DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setToDelete(info)}
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
                  {informations?.length ? 'Aucune information ne correspond à la recherche.' : 'Aucune information enregistrée.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Information <PriorityBadge priority={selected.priority} />
                </DialogTitle>
                <DialogDescription>
                  Reçue le {formatDate(selected)}
                  {selected.createdBy ? ` — enregistrée par ${selected.createdBy}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Source</p>
                  <p className="mt-1">{selected.source}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Objet</p>
                  <p className="mt-1 whitespace-pre-wrap">{selected.objet}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette information ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'information de la source <span className="font-semibold">{toDelete?.source}</span> sera supprimée
              définitivement.
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
