
'use client';

import { useState, useMemo } from 'react';
import { ClientOnly } from '@/components/layout/client-only';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoreHorizontal, PlusCircle, Search, User, Camera, Trash2, Loader2, Scale, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { deleteDoc } from '@/lib/firestore-fast';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { RegisterDetaineeForm } from '@/components/gav/register-detainee-form';
import { DetaineeDetailsDialog } from '@/components/gav/detainee-details-dialog';
import { DeferDetaineeDialog } from '@/components/gav/defer-detainee-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { writeBatch } from '@/lib/firestore-fast';
import type { Detainee, GavPv } from '@/lib/types';
import { ViewGavPvDialog } from '@/components/gav/view-gav-pv-dialog';
import { DetaineeStatutBadge, isDefere } from '@/components/gav/detainee-statut-badge';

import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { FirestorePermissionError } from '@/firebase/errors';
import Image from 'next/image';

type Filtre = 'tous' | 'interpelle' | 'defere';

export default function GAVPage() {
  return (
    <ClientOnly>
      <GAVContent />
    </ClientOnly>
  );
}

function GAVContent() {
  const firestore = useFirestore();
  const { isAdmin, isObserver } = useRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegisterOpen, setRegisterOpen] = useState(false);
  const [selectedDetainee, setSelectedDetainee] = useState<Detainee | null>(null);
  const [detaineeToDelete, setDetaineeToDelete] = useState<Detainee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [detaineesToDefer, setDetaineesToDefer] = useState<Detainee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detaineeToUndefer, setDetaineeToUndefer] = useState<Detainee | null>(null);
  const [isUndeferring, setIsUndeferring] = useState(false);
  const [pvToView, setPvToView] = useState<string | null>(null);
  const { toast } = useToast();

  const detaineesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'detainees') : null), [firestore]);
  const { data: detainees, isLoading } = useCollection<Detainee>(detaineesQuery);

  const counts = useMemo(() => {
    const list = detainees || [];
    const deferes = list.filter(isDefere).length;
    return { tous: list.length, interpelle: list.length - deferes, defere: deferes };
  }, [detainees]);

  const filteredDetainees = useMemo(() => {
    if (!detainees) return [];
    return detainees
      .filter((d) => filtre === 'tous' || (filtre === 'defere' ? isDefere(d) : !isDefere(d)))
      .filter(d => {
        const search = searchQuery.toLowerCase();
        return (
          d.firstName.toLowerCase().includes(search) ||
          d.lastName.toLowerCase().includes(search) ||
          (d.nationalite || '').toLowerCase().includes(search) ||
          (d.service || '').toLowerCase().includes(search)
        );
      })
      .sort((a, b) => b.entryTime.toMillis() - a.entryTime.toMillis());
  }, [detainees, searchQuery, filtre]);

  // --- Sélection de plusieurs personnes interpellées à déférer ensemble ---
  const canDefer = !isObserver;
  const selectable = useMemo(() => filteredDetainees.filter((d) => !isDefere(d)), [filteredDetainees]);
  // Seules les personnes encore visibles et non déférées restent sélectionnées
  const selectedDetainees = useMemo(
    () => (detainees || []).filter((d) => selectedIds.has(d.id) && !isDefere(d)),
    [detainees, selectedIds]
  );
  const allSelected = selectable.length > 0 && selectable.every((d) => selectedIds.has(d.id));
  const someSelected = selectable.some((d) => selectedIds.has(d.id));

  const toggleOne = (id: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (allSelected) selectable.forEach((d) => next.delete(d.id));
      else selectable.forEach((d) => next.add(d.id));
      return next;
    });

  // Revenir au statut « Interpellé » (déferrement saisi par erreur)
  const handleUndefer = async () => {
    if (!firestore || !detaineeToUndefer) return;
    setIsUndeferring(true);
    try {
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'detainees', detaineeToUndefer.id), {
        statut: 'interpelle',
        defereAt: null,
        defereParquet: null,
        defereObservation: null,
        pvId: null,
        pvNumero: null,
      });
      // Le PV ne concerne plus cette personne ; s'il n'en reste aucune, il est supprimé avec ses pages
      if (detaineeToUndefer.pvId) {
        const pvRef = doc(firestore, 'gav_pvs', detaineeToUndefer.pvId);
        const pvSnap = await getDoc(pvRef);
        if (pvSnap.exists()) {
          const pv = pvSnap.data() as Omit<GavPv, 'id'>;
          const index = pv.detaineeIds.indexOf(detaineeToUndefer.id);
          const remainingIds = pv.detaineeIds.filter((_, i) => i !== index);
          if (remainingIds.length === 0) {
            const pages = await getDocs(collection(pvRef, 'files'));
            pages.forEach((p) => batch.delete(p.ref));
            batch.delete(pvRef);
          } else {
            batch.update(pvRef, {
              detaineeIds: remainingIds,
              detaineeNames: pv.detaineeNames.filter((_, i) => i !== index),
            });
          }
        }
      }
      await batch.commit();
      logActivity(
        firestore,
        `GAV : déferrement annulé pour ${detaineeToUndefer.lastName.toUpperCase()} ${detaineeToUndefer.firstName}`,
        'GAV',
        '/gav'
      );
      toast({ title: 'Déferrement annulé', description: 'La personne est de nouveau marquée « Interpellé ».' });
      setDetaineeToUndefer(null);
    } catch (e) {
      console.error("Erreur lors de l'annulation du déferrement:", e);
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'annuler le déferrement." });
    } finally {
      setIsUndeferring(false);
    }
  };

  const handleDeleteDetainee = async () => {
    if (!firestore || !detaineeToDelete) return;
    setIsDeleting(true);

    const detaineeRef = doc(firestore, 'detainees', detaineeToDelete.id);
    deleteDoc(detaineeRef).then(() => {
        toast({
            title: 'Dossier supprimé',
            description: `Le dossier GAV de ${detaineeToDelete.firstName} ${detaineeToDelete.lastName} a été supprimé.`,
        });
        logActivity(firestore, `Suppression dossier GAV: ${detaineeToDelete.firstName} ${detaineeToDelete.lastName}`, 'GAV', '/gav');
        setDetaineeToDelete(null);
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: detaineeRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
        setIsDeleting(false);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Garde À Vue (GAV)</h1>
        {!isObserver && (
          <Dialog open={isRegisterOpen} onOpenChange={setRegisterOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Nouvel Enregistrement
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Enregistrer une personne en GAV</DialogTitle>
              </DialogHeader>
              <RegisterDetaineeForm onSuccess={() => setRegisterOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={filtre} onValueChange={(v) => setFiltre(v as Filtre)}>
          <TabsList>
            <TabsTrigger value="tous" className="text-xs">Tous ({counts.tous})</TabsTrigger>
            <TabsTrigger value="interpelle" className="text-xs">Interpellés ({counts.interpelle})</TabsTrigger>
            <TabsTrigger value="defere" className="text-xs">Déférés ({counts.defere})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher par nom, nationalité ou service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {canDefer && selectedDetainees.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm">
            <span className="font-semibold">{selectedDetainees.length}</span> personne
            {selectedDetainees.length > 1 ? 's' : ''} sélectionnée{selectedDetainees.length > 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Tout désélectionner
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDetaineesToDefer(selectedDetainees)}>
              <Scale className="h-4 w-4" />
              Déférer la sélection ({selectedDetainees.length})
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canDefer && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Sélectionner tous les interpellés affichés"
                    disabled={selectable.length === 0}
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-[80px]">Photo</TableHead>
              <TableHead>Nom complet</TableHead>
              <TableHead>Date de naissance</TableHead>
              <TableHead>Nationalité</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Date d'entrée</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={canDefer ? 9 : 8} className="text-center">Chargement...</TableCell></TableRow>
            ) : filteredDetainees.length > 0 ? (
              filteredDetainees.map((detainee) => (
                <TableRow
                  key={detainee.id}
                  className="cursor-pointer"
                  data-state={selectedIds.has(detainee.id) && !isDefere(detainee) ? 'selected' : undefined}
                  onClick={() => setSelectedDetainee(detainee)}
                >
                  {canDefer && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!isDefere(detainee) && (
                        <Checkbox
                          aria-label={`Sélectionner ${detainee.lastName} ${detainee.firstName}`}
                          checked={selectedIds.has(detainee.id)}
                          onCheckedChange={() => toggleOne(detainee.id)}
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    {detainee.photo ? (
                      <div className="relative h-10 w-10 overflow-hidden rounded-full border">
                        <Image src={detainee.photo} alt="Identity" fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {detainee.lastName.toUpperCase()} {detainee.firstName}
                  </TableCell>
                  <TableCell>{detainee.birthDate.toDate().toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell>{detainee.nationalite || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">{detainee.service || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{detainee.entryTime.toDate().toLocaleString('fr-FR')}</TableCell>
                  <TableCell><DetaineeStatutBadge detainee={detainee} /></TableCell>
                  <TableCell className="text-right">
                    {/* modal={false} : le menu ne bloque pas la page ; il se referme proprement avant l'ouverture des détails */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      {/* Empêche les clics du menu de remonter jusqu'à la ligne du tableau */}
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setSelectedDetainee(detainee)}>
                          Voir les détails
                        </DropdownMenuItem>
                        {!isObserver &&
                          (isDefere(detainee) ? (
                            <>
                              {detainee.pvId && (
                                <DropdownMenuItem onSelect={() => setPvToView(detainee.pvId!)}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Voir le PV
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => setDetaineeToUndefer(detainee)}>
                                Annuler le déferrement
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onSelect={() => setDetaineesToDefer([detainee])}>
                              <Scale className="mr-2 h-4 w-4" />
                              Déférer au parquet
                            </DropdownMenuItem>
                          ))}
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDetaineeToDelete(detainee)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              Supprimer
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={canDefer ? 9 : 8} className="text-center text-muted-foreground">Aucun détenu enregistré.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedDetainee && (
        <DetaineeDetailsDialog
          detainee={selectedDetainee}
          isOpen={!!selectedDetainee}
          onOpenChange={(open) => !open && setSelectedDetainee(null)}
          onViewPv={(id) => setPvToView(id)}
        />
      )}

      <ViewGavPvDialog pvId={pvToView} onOpenChange={(open) => !open && setPvToView(null)} />

      <DeferDetaineeDialog
        detainees={detaineesToDefer}
        onOpenChange={(open) => !open && setDetaineesToDefer([])}
        onDone={() => setSelectedIds(new Set())}
      />

      <AlertDialog open={!!detaineeToUndefer} onOpenChange={(open) => !open && !isUndeferring && setDetaineeToUndefer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler le déferrement ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">
                {detaineeToUndefer?.lastName.toUpperCase()} {detaineeToUndefer?.firstName}
              </span>{' '}
              redeviendra « Interpellé ». La date, le parquet et le lien vers le PV seront effacés ; si le PV ne concerne personne d'autre, il sera supprimé avec ses pages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUndeferring}>Retour</AlertDialogCancel>
            <AlertDialogAction onClick={handleUndefer} disabled={isUndeferring}>
              {isUndeferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Annuler le déferrement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detaineeToDelete && (
        <AlertDialog open={!!detaineeToDelete} onOpenChange={(open) => !open && setDetaineeToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action supprimera définitivement le dossier de <span className="font-semibold">{detaineeToDelete.firstName} {detaineeToDelete.lastName}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteDetainee} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
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
