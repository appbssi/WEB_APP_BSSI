'use client';

import { useState, useMemo } from 'react';
import { ClientOnly } from '@/components/layout/client-only';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  PlusCircle, 
  Search, 
  Sword, 
  UserPlus, 
  History, 
  AlertTriangle, 
  ArrowLeftRight,
  FileText,
  Loader2,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogDescription, 
  DialogFooter 
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
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, doc, updateDoc, Timestamp, deleteDoc, increment, writeBatch } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Weapon, WeaponAssignment, Agent, Mission } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AddWeaponForm } from '@/components/armurerie/add-weapon-form';
import { AssignWeaponForm } from '@/components/armurerie/assign-weapon-form';
import { logActivity } from '@/lib/activity-logger';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLogo } from '@/context/logo-context';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export default function ArmureriePage() {
  return (
    <ClientOnly>
      <ArmurerieContent />
    </ClientOnly>
  );
}

function ArmurerieContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { logo } = useLogo();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddWeaponOpen, setAddWeaponOpen] = useState(false);
  const [isAssignOpen, setAssignOpen] = useState(false);
  const [weaponToDelete, setWeaponToDelete] = useState<Weapon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearHistoryOpen, setClearHistoryOpen] = useState(false);
  
  const [assignmentToReturn, setAssignmentToReturn] = useState<WeaponAssignment | null>(null);
  const [returnedAmmunition, setReturnedAmmunition] = useState<number>(0);
  const [isReturning, setIsReturning] = useState(false);

  const weaponsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'weapons') : null), [firestore]);
  const assignmentsQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'weaponAssignments'), orderBy('assignedAt', 'desc')) : null), [firestore]);
  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const missionsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'missions') : null), [firestore]);

  const { data: weapons, isLoading: weaponsLoading } = useCollection<Weapon>(weaponsQuery);
  const { data: assignments, isLoading: assignmentsLoading } = useCollection<WeaponAssignment>(assignmentsQuery);
  const { data: agents } = useCollection<Agent>(agentsQuery);
  const { data: missions } = useCollection<Mission>(missionsQuery);

  const agentsById = useMemo(() => {
    if (!agents) return {};
    return agents.reduce((acc, agent) => { acc[agent.id] = agent; return acc; }, {} as Record<string, Agent>);
  }, [agents]);

  const weaponsById = useMemo(() => {
    if (!weapons) return {};
    return weapons.reduce((acc, weapon) => { acc[weapon.id] = weapon; return acc; }, {} as Record<string, Weapon>);
  }, [weapons]);

  const filteredWeapons = useMemo(() => {
    if (!weapons) return [];
    return weapons.filter(w => 
      w.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.model.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [weapons, searchQuery]);

  const handleOpenReturnDialog = (assignment: WeaponAssignment) => {
    setAssignmentToReturn(assignment);
    setReturnedAmmunition(assignment.ammunitionCount || 0);
  };

  const handleConfirmReturn = async () => {
    if (!firestore || !assignmentToReturn) return;
    
    setIsReturning(true);
    try {
      const assignmentRef = doc(firestore, 'weaponAssignments', assignmentToReturn.id);
      await updateDoc(assignmentRef, { 
        returnedAt: Timestamp.now(),
        returnedAmmunitionCount: returnedAmmunition
      });
      
      const weapon = weaponsById[assignmentToReturn.weaponId];
      const agent = agentsById[assignmentToReturn.agentId];
      
      const lotId = assignmentToReturn.munitionLotId || (weapon?.type === 'Munition' ? weapon.id : null);
      
      if (lotId) {
        const weaponRef = doc(firestore, 'weapons', lotId);
        await updateDoc(weaponRef, {
          quantity: increment(returnedAmmunition)
        });
      }
      
      logActivity(firestore, `Retour de matériel : ${weapon?.model} par ${agent?.fullName} (${returnedAmmunition} munitions)`, 'Armurerie', '/armurerie');
      toast({ title: 'Retour enregistré', description: 'Le matériel a été marqué comme retourné et le stock a été mis à jour.' });
      setAssignmentToReturn(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer le retour." });
    } finally {
      setIsReturning(false);
    }
  };

  const handleReportIssue = async (weapon: Weapon) => {
    if (!firestore) return;
    const newStatus = weapon.status === 'En maintenance' ? 'Fonctionnel' : 'En maintenance';
    try {
      const weaponRef = doc(firestore, 'weapons', weapon.id);
      await updateDoc(weaponRef, { 
        status: newStatus,
        lastMaintenanceDate: Timestamp.now()
      });
      toast({ title: 'Statut mis à jour', description: `L'équipement est maintenant marqué comme : ${newStatus}` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de mettre à jour le statut." });
    }
  };

  const handleDeleteWeapon = async () => {
    if (!firestore || !weaponToDelete) return;
    
    const activeAssignments = assignments?.filter(a => a.weaponId === weaponToDelete.id && !a.returnedAt) || [];
    if (activeAssignments.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Action impossible',
        description: 'Ce matériel est actuellement assigné à un agent. Veuillez enregistrer le retour avant de le supprimer.'
      });
      setWeaponToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const weaponRef = doc(firestore, 'weapons', weaponToDelete.id);
      await deleteDoc(weaponRef);
      logActivity(firestore, `Matériel retiré de l'inventaire : ${weaponToDelete.model} (${weaponToDelete.serialNumber})`, 'Armurerie', '/armurerie');
      toast({ title: 'Matériel supprimé' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de supprimer le matériel." });
    } finally {
      setIsDeleting(false);
      setWeaponToDelete(null);
    }
  };

  const handleClearHistory = async () => {
    if (!firestore || !assignments) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);
      assignments.forEach((a) => {
        batch.delete(doc(firestore, 'weaponAssignments', a.id));
      });
      await batch.commit();
      toast({ title: 'Historique réinitialisé', description: "Toutes les archives d'affectation ont été supprimées." });
      logActivity(firestore, `L'historique de l'armurerie a été réinitialisé.`, 'Armurerie', '/armurerie');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de réinitialiser l'historique." });
    } finally {
      setIsDeleting(false);
      setClearHistoryOpen(false);
    }
  };

  const generateDailyReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('fr-FR');

    const addHeader = () => {
      doc.setFontSize(10);
      doc.text("BRIGADE SPECIALE DE SURVEILLANCE ET D'INTERVENTION", pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(16);
      doc.text("RAPPORT QUOTIDIEN ARMURERIE", pageWidth / 2, 25, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Date : ${today}`, 14, 35);
    };

    addHeader();

    const maintenanceWeapons = weapons?.filter(w => w.status === 'En maintenance') || [];
    doc.setFontSize(12);
    doc.text("1. Équipements nécessitant une intervention / En maintenance", 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [['N° Série', 'Modèle', 'Type', 'Dernière Maintenance']],
      body: maintenanceWeapons.map(w => [
        w.serialNumber, 
        w.model, 
        w.type, 
        w.lastMaintenanceDate?.toDate().toLocaleDateString('fr-FR') || 'Jamais'
      ]),
    });

    const activeAssignments = assignments?.filter(a => !a.returnedAt) || [];
    doc.text("2. Affectations en cours (Matériel sorti)", 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Agent', 'Matériel', 'Munitions', 'Chargeurs', 'Sorti le']],
      body: activeAssignments.map(a => [
        agentsById[a.agentId]?.fullName || 'Inconnu',
        weaponsById[a.weaponId]?.model || 'Inconnu',
        a.ammunitionCount || 0,
        a.magazineCount || 0,
        a.assignedAt.toDate().toLocaleString('fr-FR')
      ]),
    });

    doc.save(`rapport_armurerie_${today.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Armurerie</h1>
          <p className="text-muted-foreground">Gestion du matériel, des munitions et de la maintenance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateDailyReport}>
            <FileText className="mr-2 h-4 w-4" /> Rapport Quotidien
          </Button>
          <Dialog open={isAddWeaponOpen} onOpenChange={setAddWeaponOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Nouvel Équipement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer un équipement</DialogTitle></DialogHeader>
              <AddWeaponForm onSuccess={() => setAddWeaponOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={isAssignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <UserPlus className="mr-2 h-4 w-4" /> Attribuer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Attribuer du matériel à un agent</DialogTitle></DialogHeader>
              <AssignWeaponForm 
                weapons={weapons?.filter(w => w.status === 'Fonctionnel' && (w.type !== 'Munition' || w.quantity > 0)) || []} 
                agents={agents || []} 
                assignments={assignments || []}
                missions={missions || []}
                onSuccess={() => setAssignOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory"><Sword className="mr-2 h-4 w-4" /> Inventaire</TabsTrigger>
          <TabsTrigger value="assignments"><ArrowLeftRight className="mr-2 h-4 w-4" /> Affectations</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-2 h-4 w-4" /> Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>État du Stock</CardTitle>
                  <CardDescription>Liste exhaustive du matériel et des munitions.</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="N° Série ou Modèle..." 
                    className="pl-8" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Série</TableHead>
                    <TableHead>Modèle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>État/Qté</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weaponsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Chargement...</TableCell></TableRow>
                  ) : filteredWeapons.length > 0 ? (
                    filteredWeapons.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.serialNumber}</TableCell>
                        <TableCell className="font-medium">{w.model}</TableCell>
                        <TableCell>{w.type}</TableCell>
                        <TableCell>
                          {w.type === 'Munition' ? `${w.quantity} unités` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={w.status === 'Fonctionnel' ? 'default' : w.status === 'En maintenance' ? 'secondary' : 'destructive'}>
                            {w.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleReportIssue(w)}>
                              <AlertTriangle className={cn("h-4 w-4 mr-2", w.status === 'En maintenance' ? "text-green-600" : "text-orange-500")} />
                              {w.status === 'En maintenance' ? 'Remettre en service' : 'Signaler Panne'}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setWeaponToDelete(w)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucun équipement trouvé.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle>Affectations Actuelles</CardTitle>
              <CardDescription>Liste du matériel actuellement entre les mains des agents.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Matériel</TableHead>
                    <TableHead>Dotation</TableHead>
                    <TableHead>Date Sortie</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentsLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center">Chargement...</TableCell></TableRow>
                  ) : assignments?.filter(a => !a.returnedAt).length ? (
                    assignments.filter(a => !a.returnedAt).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{agentsById[a.agentId]?.fullName || '...'}</TableCell>
                        <TableCell>{weaponsById[a.weaponId]?.model || '...'} ({weaponsById[a.weaponId]?.serialNumber})</TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {a.magazineCount > 0 && <span className="block">{a.magazineCount} chargeur(s)</span>}
                            {a.ammunitionCount > 0 && <span className="block">{a.ammunitionCount} munition(s)</span>}
                            {!(a.magazineCount > 0 || a.ammunitionCount > 0) && '-'}
                          </div>
                        </TableCell>
                        <TableCell>{a.assignedAt.toDate().toLocaleString('fr-FR')}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleOpenReturnDialog(a)}>Enregistrer Retour</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aucune affectation en cours.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Historique complet</CardTitle>
                  <CardDescription>Registre de tous les mouvements de matériel.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setClearHistoryOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Réinitialiser l'historique
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Sortie</TableHead>
                    <TableHead>Date Retour</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Matériel</TableHead>
                    <TableHead>Dotation (Retour)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentsLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center">Chargement...</TableCell></TableRow>
                  ) : assignments?.length ? (
                    assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.assignedAt.toDate().toLocaleString('fr-FR')}</TableCell>
                        <TableCell>
                          {a.returnedAt ? a.returnedAt.toDate().toLocaleString('fr-FR') : <Badge variant="outline">Non retourné</Badge>}
                        </TableCell>
                        <TableCell>{agentsById[a.agentId]?.fullName || '...'}</TableCell>
                        <TableCell>{weaponsById[a.weaponId]?.model || '...'}</TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            {a.magazineCount > 0 && <span>{a.magazineCount} ch. </span>}
                            {a.ammunitionCount > 0 && (
                              <span>
                                {a.ammunitionCount} mun.
                                {a.returnedAt && a.returnedAmmunitionCount !== undefined && (
                                  <span className="text-primary font-bold"> (Retour: {a.returnedAmmunitionCount})</span>
                                )}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Aucun historique disponible.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!assignmentToReturn} onOpenChange={(open) => !open && setAssignmentToReturn(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer le retour de matériel</DialogTitle>
            <DialogDescription>
              Veuillez confirmer le matériel retourné et le nombre de munitions restituées.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Agent</Label>
                <p className="font-semibold text-sm">{assignmentToReturn ? agentsById[assignmentToReturn.agentId]?.fullName : '...'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Matériel</Label>
                <p className="font-semibold text-sm">{assignmentToReturn ? weaponsById[assignmentToReturn.weaponId]?.model : '...'}</p>
              </div>
            </div>

            {assignmentToReturn && assignmentToReturn.ammunitionCount > 0 && (
              <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <Label>Munitions reçues</Label>
                  <Badge variant="outline">{assignmentToReturn.ammunitionCount}</Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returned-ammunition">Munitions retournées</Label>
                  <Input 
                    id="returned-ammunition"
                    type="number"
                    value={returnedAmmunition}
                    onChange={(e) => setReturnedAmmunition(Number(e.target.value))}
                    max={assignmentToReturn.ammunitionCount}
                    min={0}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Note : Si le nombre est inférieur à la dotation initiale, le stock global sera mis à jour avec cette valeur.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignmentToReturn(null)}>Annuler</Button>
            <Button onClick={handleConfirmReturn} disabled={isReturning}>
              {isReturning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer le retour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!weaponToDelete} onOpenChange={(open) => !open && setWeaponToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer le matériel <span className="font-semibold">{weaponToDelete?.model} ({weaponToDelete?.serialNumber})</span> de l'inventaire ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWeapon} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isClearHistoryOpen} onOpenChange={setClearHistoryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser l'historique ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera **définitivement** toutes les archives d'attribution et de retour de l'armurerie. L'inventaire actuel ne sera pas affecté.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearHistory} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer la réinitialisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
