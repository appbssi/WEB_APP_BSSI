
'use client';

import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoreHorizontal, PlusCircle, Search, Trash2, Loader2, FileDown, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useRole } from '@/hooks/use-role';
import { useLogo } from '@/context/logo-context';
import type { Visitor } from '@/lib/types';
import { EditVisitorSheet } from '@/components/secretariat/edit-visitor-sheet';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { RegisterVisitorForm } from '@/components/secretariat/register-visitor-form';
import { logActivity } from '@/lib/activity-logger';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { ClientOnly } from '@/components/layout/client-only';

export default function SecretariatPage() {
  return (
    <ClientOnly>
      <SecretariatContent />
    </ClientOnly>
  );
}

function SecretariatContent() {
  const firestore = useFirestore();
  const { isObserver } = useRole();
  const { logo } = useLogo();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegisterOpen, setRegisterOpen] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [visitorToDelete, setVisitorToDelete] = useState<Visitor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const visitorsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'visitors') : null), [firestore]);
  const { data: visitors, isLoading: visitorsLoading } = useCollection<Visitor>(visitorsQuery);

  const sortedVisitors = useMemo(() => {
    if (!visitors) return [];
    // Filter out visitors with no entryTime and then sort
    return visitors
      .filter(v => v.entryTime)
      .sort((a, b) => b.entryTime.toMillis() - a.entryTime.toMillis());
  }, [visitors]);

  const filteredVisitors = sortedVisitors.filter(visitor => {
    const searchString = `${visitor.firstName} ${visitor.lastName} ${visitor.occupation}`.toLowerCase();
    return searchString.includes(searchQuery.toLowerCase());
  });

  const handleDeleteVisitor = async () => {
    if (!firestore || !visitorToDelete) return;
    setIsDeleting(true);

    const visitorRef = doc(firestore, 'visitors', visitorToDelete.id);
    deleteDoc(visitorRef).then(() => {
        toast({
        title: 'Visiteur supprimé',
        description: `Le visiteur ${visitorToDelete.firstName} ${visitorToDelete.lastName} a été supprimé.`,
        });
        logActivity(firestore, `Le visiteur ${visitorToDelete.firstName} ${visitorToDelete.lastName} a été supprimé.`, 'Visiteur', '/secretariat');
        setVisitorToDelete(null);
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: visitorRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
        setIsDeleting(false);
    });
  };

  const handleRecordExit = async (visitor: Visitor) => {
    if (!firestore || visitor.exitTime) return;

    const visitorRef = doc(firestore, 'visitors', visitor.id);
    const updateData = { exitTime: Timestamp.now() };

    updateDoc(visitorRef, updateData).then(() => {
        toast({
            title: 'Sortie enregistrée',
            description: `L'heure de sortie pour ${visitor.firstName} ${visitor.lastName} a été enregistrée.`,
        });
        logActivity(firestore, `La sortie du visiteur ${visitor.firstName} ${visitor.lastName} a été enregistrée.`, 'Visiteur', '/secretariat');
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: visitorRef.path,
            operation: 'update',
            requestResourceData: updateData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleExportXLSX = () => {
    const dataToExport = filteredVisitors.map(visitor => ({
        'Date': visitor.entryTime.toDate().toLocaleDateString('fr-FR'),
        'Heure d\'entrée': visitor.entryTime.toDate().toLocaleTimeString('fr-FR'),
        'Heure de sortie': visitor.exitTime ? visitor.exitTime.toDate().toLocaleTimeString('fr-FR') : 'N/A',
        'Prénom': visitor.firstName,
        'Nom': visitor.lastName,
        'Contact': visitor.contact,
        'Fonction': visitor.occupation,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Visiteurs');
    XLSX.writeFile(workbook, 'registre_visiteurs.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const tableTitle = "Registre des Visiteurs";
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
            head: [['Date', 'Entrée', 'Sortie', 'Visiteur', 'Fonction', 'Contact']],
            body: filteredVisitors.map(v => [
                v.entryTime.toDate().toLocaleDateString('fr-FR'),
                v.entryTime.toDate().toLocaleTimeString('fr-FR'),
                v.exitTime ? v.exitTime.toDate().toLocaleTimeString('fr-FR') : 'N/A',
                `${v.lastName.toUpperCase()} ${v.firstName}`,
                v.occupation,
                v.contact,
            ]),
            startY: currentY,
            theme: 'striped',
            headStyles: { fillColor: [39, 55, 70] },
        });
        doc.save('registre_visiteurs.pdf');
    };

    if (logo) {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => addContent(img);
        img.onerror = () => addContent(null);
        img.src = logo;
    } else {
        addContent(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Secrétariat - Registre des Visiteurs</h1>
      </div>
      
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher un visiteur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="button-13 flex items-center justify-center">
                  <FileDown className="mr-2 h-4 w-4" /> Exporter
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={handleExportPDF}>Exporter en PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportXLSX}>Exporter en XLSX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          {!isObserver && (
             <Dialog open={isRegisterOpen} onOpenChange={setRegisterOpen}>
                <DialogTrigger asChild>
                    <button className="button-13 flex items-center justify-center !w-auto px-4">
                        <PlusCircle className="mr-2 h-4 w-4" /> Enregistrer
                    </button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Enregistrer un nouveau visiteur</DialogTitle>
                        <DialogDescription>
                            Remplissez les détails du visiteur ci-dessous.
                        </DialogDescription>
                    </DialogHeader>
                    <RegisterVisitorForm onVisitorRegistered={() => setRegisterOpen(false)} />
                </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Visiteur</TableHead>
              <TableHead>Fonction</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Heure d'entrée</TableHead>
              <TableHead>Heure de sortie</TableHead>
              {!isObserver && <TableHead><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitorsLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">Chargement des visiteurs...</TableCell>
              </TableRow>
            ) : (
              filteredVisitors.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell>
                      <div className="font-medium">{visitor.lastName.toUpperCase()} {visitor.firstName}</div>
                      <div className="text-sm text-muted-foreground">{visitor.contact}</div>
                    </TableCell>
                    <TableCell>{visitor.occupation}</TableCell>
                    <TableCell>{visitor.entryTime.toDate().toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>{visitor.entryTime.toDate().toLocaleTimeString('fr-FR')}</TableCell>
                    <TableCell>{visitor.exitTime ? visitor.exitTime.toDate().toLocaleTimeString('fr-FR') : '...'}</TableCell>
                    {!isObserver && (
                        <TableCell>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => handleRecordExit(visitor)} disabled={!!visitor.exitTime}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Enregistrer la sortie
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditingVisitor(visitor)}>Modifier</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setVisitorToDelete(visitor)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                Supprimer
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </TableCell>
                    )}
                  </TableRow>
                ))
            )}
            {!visitorsLoading && filteredVisitors.length === 0 && (
                <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Aucun visiteur trouvé.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {editingVisitor && (
        <EditVisitorSheet
          visitor={editingVisitor}
          isOpen={!!editingVisitor}
          onOpenChange={(open) => !open && setEditingVisitor(null)}
        />
      )}

      {visitorToDelete && (
        <AlertDialog open={!!visitorToDelete} onOpenChange={(open) => !open && setVisitorToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Le visiteur{' '}
                <span className="font-semibold">{`${visitorToDelete.firstName} ${visitorToDelete.lastName}`}</span> sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setVisitorToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVisitor} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
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
