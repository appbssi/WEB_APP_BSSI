
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
import { MoreHorizontal, PlusCircle, Search, User, Camera, Trash2, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, deleteDoc, doc } from 'firebase/firestore';
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
import type { Detainee } from '@/lib/types';
import { useRole } from '@/hooks/use-role';
import { logActivity } from '@/lib/activity-logger';
import { FirestorePermissionError } from '@/firebase/errors';
import Image from 'next/image';

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
  const { toast } = useToast();

  const detaineesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'detainees') : null), [firestore]);
  const { data: detainees, isLoading } = useCollection<Detainee>(detaineesQuery);

  const filteredDetainees = useMemo(() => {
    if (!detainees) return [];
    return detainees
      .filter(d => {
        const search = searchQuery.toLowerCase();
        return d.firstName.toLowerCase().includes(search) || d.lastName.toLowerCase().includes(search);
      })
      .sort((a, b) => b.entryTime.toMillis() - a.entryTime.toMillis());
  }, [detainees, searchQuery]);

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
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Enregistrer une personne en GAV</DialogTitle>
              </DialogHeader>
              <RegisterDetaineeForm onSuccess={() => setRegisterOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher par nom..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Photo</TableHead>
              <TableHead>Nom complet</TableHead>
              <TableHead>Date de naissance</TableHead>
              <TableHead>Date d'entrée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center">Chargement...</TableCell></TableRow>
            ) : filteredDetainees.length > 0 ? (
              filteredDetainees.map((detainee) => (
                <TableRow key={detainee.id} className="cursor-pointer" onClick={() => setSelectedDetainee(detainee)}>
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
                  <TableCell>{detainee.entryTime.toDate().toLocaleString('fr-FR')}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setSelectedDetainee(detainee)}>
                          Voir les détails
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
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
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aucun détenu enregistré.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedDetainee && (
        <DetaineeDetailsDialog
          detainee={selectedDetainee}
          isOpen={!!selectedDetainee}
          onOpenChange={(open) => !open && setSelectedDetainee(null)}
        />
      )}

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
