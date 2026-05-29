'use client';

import { useState, useMemo, useEffect } from 'react';
import { ClientOnly } from '@/components/layout/client-only';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Truck, 
  AlertCircle, 
  Settings, 
  Search, 
  PlusCircle, 
  History, 
  CheckCircle2, 
  Wrench,
  Loader2,
  Edit,
  Trash2
} from 'lucide-react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, doc, updateDoc, Timestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import type { Vehicle, VehicleAnomaly } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AddVehicleForm } from '@/components/logistique/add-vehicle-form';
import { EditVehicleForm } from '@/components/logistique/edit-vehicle-form';
import { ReportAnomalyForm } from '@/components/logistique/report-anomaly-form';
import { logActivity } from '@/lib/activity-logger';
import { cn } from '@/lib/utils';
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

export default function LogistiquePage() {
  return (
    <ClientOnly>
      <LogistiqueContent />
    </ClientOnly>
  );
}

function LogistiqueContent() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddVehicleOpen, setAddVehicleOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const [preselectedVehicleId, setPreselectedVehicleId] = useState<string | undefined>(undefined);

  const vehiclesQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'vehicles') : null), [firestore]);
  const anomaliesQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, 'vehicleAnomalies'), orderBy('date', 'desc')) : null), [firestore]);

  const { data: vehicles, isLoading: vehiclesLoading } = useCollection<Vehicle>(vehiclesQuery);
  const { data: anomalies, isLoading: anomaliesLoading } = useCollection<VehicleAnomaly>(anomaliesQuery);

  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter(v => 
      v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.model.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [vehicles, searchQuery]);

  // Logique de signalement automatique
  useEffect(() => {
    if (!firestore || !vehicles || !anomalies) return;

    const checkSystemAnomalies = async () => {
      for (const vehicle of vehicles) {
        // 1. Alerte de maintenance par kilométrage
        if (vehicle.nextMaintenanceMileage && vehicle.mileage >= vehicle.nextMaintenanceMileage) {
          const alreadyReported = anomalies.some(a => 
            a.vehicleId === vehicle.id && 
            a.description.includes("Entretien KM dépassé") && 
            !a.isResolved
          );

          if (!alreadyReported) {
            const anomalyData = {
              vehicleId: vehicle.id,
              description: `SYSTÈME : Entretien KM dépassé (${vehicle.mileage} / ${vehicle.nextMaintenanceMileage} KM)`,
              severity: 'Moyenne' as const,
              date: Timestamp.now(),
              isResolved: false,
              reportedBy: 'Système'
            };
            await addDoc(collection(firestore, 'vehicleAnomalies'), anomalyData);
            logActivity(firestore, `Alerte système : Entretien requis pour ${vehicle.plateNumber}`, 'Logistique', '/logistique');
          }
        }
      }
    };

    checkSystemAnomalies();
  }, [vehicles, anomalies, firestore]);

  const handleResolveAnomaly = async (anomaly: VehicleAnomaly) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'vehicleAnomalies', anomaly.id), { isResolved: true });
      toast({ title: 'Anomalie résolue' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur' });
    }
  };

  const handleOpenMaintenanceForm = (vehicleId: string) => {
    setPreselectedVehicleId(vehicleId);
    setReportOpen(true);
  };

  const handleDeleteVehicle = async () => {
    if (!firestore || !vehicleToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'vehicles', vehicleToDelete.id));
      logActivity(firestore, `Véhicule supprimé : ${vehicleToDelete.plateNumber}`, 'Logistique', '/logistique');
      toast({ title: 'Véhicule supprimé' });
      setVehicleToDelete(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de supprimer le véhicule." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logistique</h1>
          <p className="text-muted-foreground">Gestion de la flotte automobile et équipements.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddVehicleOpen} onOpenChange={setAddVehicleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Nouveau Véhicule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer un véhicule</DialogTitle></DialogHeader>
              <AddVehicleForm onSuccess={() => setAddVehicleOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={isReportOpen} onOpenChange={(open) => {
            setReportOpen(open);
            if (!open) setPreselectedVehicleId(undefined);
          }}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <AlertCircle className="mr-2 h-4 w-4" /> Signaler Anomalie
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Signaler un incident logistique</DialogTitle></DialogHeader>
              <ReportAnomalyForm 
                vehicles={vehicles || []} 
                onSuccess={() => setReportOpen(false)} 
                initialVehicleId={preselectedVehicleId}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="fleet" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fleet"><Truck className="mr-2 h-4 w-4" /> Parc Automobile</TabsTrigger>
          <TabsTrigger value="anomalies"><AlertCircle className="mr-2 h-4 w-4" /> Anomalies en cours</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-2 h-4 w-4" /> Historique Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>État de la Flotte</CardTitle>
                  <CardDescription>Liste exhaustive des véhicules de la brigade.</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Immatriculation ou modèle..." 
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
                    <TableHead>Immatriculation</TableHead>
                    <TableHead>Modèle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Kilométrage</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehiclesLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Chargement...</TableCell></TableRow>
                  ) : filteredVehicles.length > 0 ? (
                    filteredVehicles.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-bold">{v.plateNumber}</TableCell>
                        <TableCell>{v.model}</TableCell>
                        <TableCell>{v.type}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{v.mileage.toLocaleString()} KM</span>
                            <span className="text-[10px] text-muted-foreground">Prochain: {v.nextMaintenanceMileage?.toLocaleString() || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.status === 'Opérationnel' ? 'default' : v.status === 'En maintenance' ? 'secondary' : 'destructive'}>
                            {v.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenMaintenanceForm(v.id)} title="Consigner entretien / anomalie">
                              <Wrench className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingVehicle(v)} title="Modifier les informations">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setVehicleToDelete(v)} title="Supprimer le véhicule">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucun véhicule trouvé.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card>
            <CardHeader>
              <CardTitle>Incidents et Alertes</CardTitle>
              <CardDescription>Anomalies signalées par les agents ou générées par le système.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {anomaliesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : anomalies?.filter(a => !a.isResolved).length ? (
                  anomalies.filter(a => !a.isResolved).map((a) => {
                    const vehicle = vehicles?.find(v => v.id === a.vehicleId);
                    return (
                      <div key={a.id} className={cn(
                        "flex items-start justify-between p-4 rounded-lg border-l-4",
                        a.severity === 'Critique' ? "bg-destructive/10 border-destructive" : 
                        a.severity === 'Moyenne' ? "bg-orange-50 border-orange-500" : "bg-muted border-muted-foreground"
                      )}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{vehicle?.plateNumber || 'Inconnu'}</span>
                            <Badge variant={a.severity === 'Critique' ? 'destructive' : 'outline'}>{a.severity}</Badge>
                            <span className="text-xs text-muted-foreground">{a.date.toDate().toLocaleString('fr-FR')}</span>
                          </div>
                          <p className="text-sm">{a.description}</p>
                          <p className="text-xs text-muted-foreground italic">Signalé par : {a.reportedBy}</p>
                          {a.financeStatus && (
                            <Badge variant={a.financeStatus === 'Validé' ? 'default' : a.financeStatus === 'Refusé' ? 'destructive' : 'secondary'} className="mt-1 text-[10px]">
                              Validation Finance : {a.financeStatus}
                            </Badge>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleResolveAnomaly(a)}
                          className={cn(
                            a.financeStatus === 'Validé' && "bg-orange-500 text-white hover:bg-orange-600 border-orange-600",
                            a.financeStatus === 'Refusé' && "bg-destructive text-white hover:bg-destructive/90 border-destructive"
                          )}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Résoudre
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Aucune anomalie active. Tout est en ordre.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Archive des interventions</CardTitle>
              <CardDescription>Historique des réparations et résolutions d'anomalies.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies?.filter(a => a.isResolved).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.date.toDate().toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>{vehicles?.find(v => v.id === a.vehicleId)?.plateNumber || '...'}</TableCell>
                      <TableCell>{a.description}</TableCell>
                      <TableCell><Badge variant="outline" className="text-green-600 border-green-600">Résolu</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editingVehicle && (
        <Dialog open={!!editingVehicle} onOpenChange={(open) => !open && setEditingVehicle(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Modifier le véhicule</DialogTitle></DialogHeader>
            <EditVehicleForm vehicle={editingVehicle} onSuccess={() => setEditingVehicle(null)} />
          </DialogContent>
        </Dialog>
      )}

      {vehicleToDelete && (
        <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer définitivement le véhicule <span className="font-semibold">{vehicleToDelete.plateNumber} ({vehicleToDelete.model})</span> ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteVehicle} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
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
