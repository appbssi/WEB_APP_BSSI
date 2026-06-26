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
import { 
  MoreHorizontal, 
  PlusCircle, 
  Search, 
  Trash2, 
  Loader2, 
  FileDown, 
  LogOut,
  Mail,
  Phone,
  BookOpen,
  Plus,
  Edit,
  User,
  ExternalLink
} from 'lucide-react';
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
import { CustomContactForm } from '@/components/secretariat/custom-contacts-form';
import { BroadcastTab } from '@/components/secretariat/broadcast-tab';
import { logActivity } from '@/lib/activity-logger';
import { ClientOnly } from '@/components/layout/client-only';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

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
  const { toast } = useToast();

  // State Tabs
  const [activeTab, setActiveTab] = useState('visitors');

  // Visitor Tab States
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegisterOpen, setRegisterOpen] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [visitorToDelete, setVisitorToDelete] = useState<Visitor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Custom Contact Tab States
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactCategoryFilter, setContactCategoryFilter] = useState('all');
  const [isContactOpen, setContactOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<any | null>(null);
  const [contactToDelete, setContactToDelete] = useState<any | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);

  // Queries
  const visitorsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'visitors') : null), [firestore]);
  const { data: visitors, isLoading: visitorsLoading } = useCollection<Visitor>(visitorsQuery);

  const contactsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'contacts') : null), [firestore]);
  const { data: rawContacts, isLoading: contactsLoading } = useCollection<any>(contactsQuery);
  const contacts = rawContacts || [];

  // Sorted list of visitors
  const sortedVisitors = useMemo(() => {
    if (!visitors) return [];
    return visitors
      .filter(v => v.entryTime)
      .sort((a, b) => b.entryTime.toMillis() - a.entryTime.toMillis());
  }, [visitors]);

  const filteredVisitors = sortedVisitors.filter(visitor => {
    const searchString = `${visitor.firstName} ${visitor.lastName} ${visitor.occupation}`.toLowerCase();
    return searchString.includes(searchQuery.toLowerCase());
  });

  // Filtered lists of Custom Contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((contact: any) => {
      const searchString = `${contact.firstName} ${contact.lastName} ${contact.email} ${contact.phone} ${contact.category}`.toLowerCase();
      const matchesSearch = searchString.includes(contactSearchQuery.toLowerCase());
      const matchesCategory = contactCategoryFilter === 'all' || contact.category === contactCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [contacts, contactSearchQuery, contactCategoryFilter]);

  // Visitor Actions
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

  // Custom Contact Actions
  const handleDeleteContact = async () => {
    if (!firestore || !contactToDelete) return;
    setIsDeletingContact(true);

    const contactRef = doc(firestore, 'contacts', contactToDelete.id);
    deleteDoc(contactRef).then(() => {
        toast({
          title: 'Contact supprimé',
          description: `Le contact-annuaire ${contactToDelete.firstName} ${contactToDelete.lastName} a été supprimé de la base.`,
        });
        logActivity(firestore, `Le contact ${contactToDelete.firstName} ${contactToDelete.lastName} de l'annuaire de diffusion a été supprimé.`, 'Général', '/secretariat');
        setContactToDelete(null);
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: contactRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    }).finally(() => {
        setIsDeletingContact(false);
    });
  };

  // Export Documents Functions
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
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Secrétariat Général</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestion administrative, registre d'accueil des visiteurs externes et modules de liaisons d'urgence simultanées.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        
        {/* Navigation tabs */}
        <div className="border-b">
          <TabsList className="bg-transparent h-12 p-0 space-x-6 border-b border-transparent">
            <TabsTrigger 
              value="visitors" 
              className="relative rounded-none border-b-2 border-transparent px-2 pb-3 pt-2 text-sm font-semibold text-muted-foreground bg-transparent shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent hover:text-foreground hover:border-border transition-all"
            >
              Registre des Visiteurs
            </TabsTrigger>
            <TabsTrigger 
              value="contacts"
              className="relative rounded-none border-b-2 border-transparent px-2 pb-3 pt-2 text-sm font-semibold text-muted-foreground bg-transparent shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent hover:text-foreground hover:border-border transition-all"
            >
              Annuaire de Liaison ({contacts.length})
            </TabsTrigger>
            <TabsTrigger 
              value="broadcast"
              className="relative rounded-none border-b-2 border-transparent px-2 pb-3 pt-2 text-sm font-semibold text-muted-foreground bg-transparent shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent hover:text-foreground hover:border-border transition-all"
            >
              Messagerie & Diffusion Simultanée
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Visitors Registry */}
        <TabsContent value="visitors" className="space-y-4 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10 text-sm"
                  placeholder="Rechercher un visiteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className="button-13 flex items-center justify-center text-sm font-medium border-none text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#4d5d43', color: '#ffffff' }}
                    >
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
                        <button className="button-13 flex items-center justify-center !w-auto px-4 text-sm font-medium">
                            <PlusCircle className="mr-2 h-4 w-4" /> Enregistrer un Visiteur
                        </button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Enregistrer un nouveau visiteur</DialogTitle>
                            <DialogDescription>
                                Remplissez les détails du visiteur pour l'enregistrer au registre de garde.
                            </DialogDescription>
                        </DialogHeader>
                        <RegisterVisitorForm onVisitorRegistered={() => setRegisterOpen(false)} />
                    </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="border border-border/80 rounded-xl overflow-x-auto shadow-sm bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visiteur</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Date d'entrée</TableHead>
                  <TableHead>Heure d'entrée</TableHead>
                  <TableHead>Heure de sortie</TableHead>
                  {!isObserver && <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitorsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex justify-center items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement des visiteurs...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVisitors.map((visitor) => (
                      <TableRow key={visitor.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-sm">{visitor.lastName.toUpperCase()} {visitor.firstName}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{visitor.contact}</div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">{visitor.occupation}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{visitor.entryTime.toDate().toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{visitor.entryTime.toDate().toLocaleTimeString('fr-FR')}</TableCell>
                        <TableCell className="text-sm">
                          {visitor.exitTime ? (
                            <Badge variant="secondary" className="bg-emerald-550/10 text-emerald-650 hover:bg-emerald-550/15 font-semibold text-[11px] border border-emerald-550/20">
                              Sorti({visitor.exitTime.toDate().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5 animate-pulse text-[11px] font-semibold">
                              Présent dans l'enceinte
                            </Badge>
                          )}
                        </TableCell>
                        {!isObserver && (
                            <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button aria-haspopup="true" size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Toggle menu</span>
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => handleRecordExit(visitor)} disabled={!!visitor.exitTime} className="cursor-pointer">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Enregistrer la sortie
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setEditingVisitor(visitor)} className="cursor-pointer">
                                    Modifier la fiche
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setVisitorToDelete(visitor)} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                                    Supprimer du registre
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
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                            Aucun visiteur enregistré aujourd'hui.
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 2: Directory / saved contacts */}
        <TabsContent value="contacts" className="space-y-4 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 w-full max-w-lg">
              <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-10 text-sm"
                    placeholder="Rechercher un contact dans l'annuaire..."
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                  />
              </div>
              <select
                value={contactCategoryFilter}
                onChange={(e) => setContactCategoryFilter(e.target.value)}
                className="text-xs h-10 rounded-md border border-input bg-background px-3 py-1 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">Toutes Catégories</option>
                <option value="Partenaire">Partenaire</option>
                <option value="Ministère">Ministère / Hiérarchie</option>
                <option value="Garde Civile">Garde Civile / Police</option>
                <option value="Urgence">Urgence / Sécurité</option>
                <option value="Autre">Autre Institution</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 justify-end">
              {!isObserver && (
                 <Dialog open={isContactOpen} onOpenChange={(open) => {
                   setContactOpen(open);
                   if (!open) setContactToEdit(null);
                 }}>
                    <DialogTrigger asChild>
                        <button className="button-13 flex items-center justify-center !w-auto px-4 text-sm font-medium">
                            <Plus className="mr-2 h-4 w-4" /> Enregistrer un Contact d'Urgence
                        </button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{contactToEdit ? 'Modifier le Contact' : 'Enregistrer dans l\'Annuaire'}</DialogTitle>
                            <DialogDescription>
                              Enregistrez des contacts diplomatiques ou officiels pour une liaison simultanée ultérieure.
                            </DialogDescription>
                        </DialogHeader>
                        <CustomContactForm 
                          contactToEdit={contactToEdit} 
                          onContactSaved={() => {
                            setContactOpen(false);
                            setContactToEdit(null);
                          }} 
                        />
                    </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="border border-border/80 rounded-xl overflow-x-auto shadow-sm bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Officiel / Contact</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Adresse E-mail</TableHead>
                  <TableHead>N° Téléphone</TableHead>
                  {!isObserver && <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex justify-center items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement de l'annuaire...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact) => (
                      <TableRow key={contact.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-sm flex items-center gap-2">
                            <span className="text-foreground">{contact.lastName.toUpperCase()} {contact.firstName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-cyan-500/20 text-cyan-600 bg-cyan-500/5 font-semibold text-[11px] uppercase">
                            {contact.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{contact.email || '—'}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{contact.phone || '—'}</TableCell>
                        {!isObserver && (
                            <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted rounded-full">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => {
                                  setContactToEdit(contact);
                                  setContactOpen(true);
                                }} className="cursor-pointer">
                                    <Edit className="mr-2 h-4 w-4" /> Modifier la fiche
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setContactToDelete(contact)} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                                    <Trash2 className="mr-2 h-4 w-4" /> Supprimer de l'annuaire
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        )}
                      </TableRow>
                    ))
                )}
                {!contactsLoading && filteredContacts.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                            Aucun contact trouvé dans l'annuaire de liaison. 
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 3: Simultaneous Broadcast Component */}
        <TabsContent value="broadcast" className="outline-none">
          <BroadcastTab />
        </TabsContent>

      </Tabs>

      {/* Visitor Edit Dialog */}
      {editingVisitor && (
        <EditVisitorSheet
          visitor={editingVisitor}
          isOpen={!!editingVisitor}
          onOpenChange={(open) => !open && setEditingVisitor(null)}
        />
      )}

      {/* Visitor Delete Alert Dialog */}
      {visitorToDelete && (
        <AlertDialog open={!!visitorToDelete} onOpenChange={(open) => !open && setVisitorToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous absolument sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est définitive. Le visiteur{' '}
                <span className="font-semibold">{`${visitorToDelete.firstName} ${visitorToDelete.lastName}`}</span> sera effacé des archives.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setVisitorToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVisitor} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                 {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Supprimer de force
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Contact Delete Alert Dialog */}
      {contactToDelete && (
        <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le contact d'urgence ?</AlertDialogTitle>
              <AlertDialogDescription>
                Vous êtes sur le point de retirer{' '}
                <span className="font-semibold">{`${contactToDelete.firstName} ${contactToDelete.lastName}`}</span> de votre annuaire public d'envoi simultané. 
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setContactToDelete(null)}>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteContact} className="bg-destructive hover:bg-destructive/90" disabled={isDeletingContact}>
                 {isDeletingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmer la suppression
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
