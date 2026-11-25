
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Agent, Mission, MissionStatus, Vehicle } from '@/lib/types';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Info, 
  Truck, 
  FileDown, 
  CheckCircle2, 
  XCircle, 
  Pencil, 
  Trash2,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Loader2,
  Ban
} from 'lucide-react';
import { differenceInDays, isSameDay } from 'date-fns';
import type { MissionWithDisplayStatus } from '@/lib/missions';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, Timestamp } from 'firebase/firestore';
import { updateDoc, addDoc } from '@/lib/firestore-fast';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRole } from '@/hooks/use-role';
import { generateOrdreDeMissionPDF } from '@/lib/pdf-generator-lazy';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import { Textarea } from '@/components/ui/textarea';

interface MissionDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mission: MissionWithDisplayStatus;
  agents: Agent[];
  onEdit?: (mission: Mission) => void;
  onComplete?: (mission: Mission) => void;
  onCancel?: (mission: Mission) => void;
  onDelete?: (mission: Mission) => void;
}

export function MissionDetailsDialog({
  isOpen,
  onOpenChange,
  mission,
  agents,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
}: MissionDetailsDialogProps) {
  const { role, isObserver } = useRole();
  const isAdmin = role === 'admin';
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isValidating, setIsValidating] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const vehiclesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'vehicles') : null, [firestore]);
  const { data: vehicles } = useCollection<Vehicle>(vehiclesQuery);

  const assignedVehicle = useMemo(() => {
    if (!vehicles || !mission.vehicleId) return null;
    return vehicles.find(v => v.id === mission.vehicleId);
  }, [vehicles, mission.vehicleId]);

  const parseDateSafe = (d: any): Date => {
    if (!d) return new Date();
    if (typeof d.toDate === 'function') return d.toDate();
    if (d instanceof Date) return d;
    if (typeof d === 'string' || typeof d === 'number') {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    if (typeof d === 'object' && d.seconds !== undefined) {
      return new Date(d.seconds * 1000);
    }
    return new Date();
  };

  const startDate = parseDateSafe(mission.startDate);
  const endDate = parseDateSafe(mission.endDate);
  const isSingleDay = isSameDay(startDate, endDate);
  const duration = differenceInDays(endDate, startDate) + 1;

  const displayStatus = mission.displayStatus || mission.status;
  const isPending = displayStatus === 'En attente' || mission.validationStatus === 'En attente';
  const isRejected = displayStatus === 'Rejetée' || mission.validationStatus === 'Rejetée';
  const isValidated = !isPending && !isRejected;

  const getBadgeVariant = (status: MissionStatus) => {
    switch (status) {
      case 'En cours': return 'default';
      case 'Terminée': return 'outline';
      case 'Annulée': return 'destructive';
      case 'Rejetée': return 'destructive';
      case 'En attente': return 'secondary';
      case 'Planification': return 'secondary';
      default: return 'secondary';
    }
  };

  const handleValidateMission = async () => {
    if (!firestore || !isAdmin) return;
    setIsValidating(true);

    try {
      const missionRef = doc(firestore, 'missions', mission.id);
      await updateDoc(missionRef, {
        status: 'Planification',
        validationStatus: 'Validée',
        validatedBy: 'Administrateur',
        validatedAt: Timestamp.now(),
      });

      // Générer l'ordre de mission PDF dès la validation
      const vehiclePlate = assignedVehicle ? `${assignedVehicle.model} (${assignedVehicle.plateNumber})` : undefined;
      generateOrdreDeMissionPDF(
        mission,
        agents,
        vehiclePlate,
        mission.leaderId
      );

      // Enregistrer le PDF généré dans Firestore
      await addDoc(collection(firestore, 'pdf_documents'), {
        title: `Ordre de Mission - ${mission.name}`,
        type: 'ordre_de_mission',
        createdAt: Timestamp.now(),
        // Ordre non signé : aucun agent n'y a accès (agentIds vide). Les agents de la mission
        // reçoivent seulement la version signée, via le volet « Ordres signés ».
        agentIds: [],
        assignedAgentIds: mission.assignedAgentIds || [],
        agentNames: agents.map(a => a.fullName),
        leaderId: mission.leaderId || null,
        leaderName: agents.find(a => a.id === mission.leaderId)?.fullName || 'Non désigné',
        missionData: {
          id: mission.id,
          name: mission.name,
          location: mission.location,
          startDate: mission.startDate,
          endDate: mission.endDate,
          startTime: mission.startTime || null,
          endTime: mission.endTime || null,
          leaderId: mission.leaderId || null,
          agents: agents,
        },
        vehiclePlate: vehiclePlate || null,
      });

      logActivity(firestore, `La mission "${mission.name}" a été validée par l'administrateur. Ordre de mission émis.`, 'Mission', '/missions');

      toast({
        title: "Mission validée avec succès !",
        description: `La mission "${mission.name}" est validée et l'ordre de mission officiel a été généré et téléchargé.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erreur validation mission:", err);
      toast({
        title: "Erreur de validation",
        description: err?.message || "Impossible de valider la mission.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRejectMission = async () => {
    if (!firestore || !isAdmin) return;
    setIsRejecting(true);

    try {
      const missionRef = doc(firestore, 'missions', mission.id);
      await updateDoc(missionRef, {
        status: 'Rejetée',
        validationStatus: 'Rejetée',
        rejectedBy: 'Administrateur',
        rejectedAt: Timestamp.now(),
        rejectionReason: rejectionReason.trim() || 'Mission rejetée par l\'administrateur',
      });

      logActivity(firestore, `La mission "${mission.name}" a été rejetée par l'administrateur.`, 'Mission', '/missions');

      toast({
        title: "Mission rejetée",
        description: `La mission "${mission.name}" a été rejetée. Aucun ordre de mission ne sera généré.`,
        variant: "destructive",
      });
      setIsRejectDialogOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erreur rejet mission:", err);
      toast({
        title: "Erreur",
        description: err?.message || "Impossible de rejeter la mission.",
        variant: "destructive",
      });
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="text-xl font-bold">{mission.name}</DialogTitle>
            </div>
            <DialogDescription>Détails complets de la mission.</DialogDescription>
          </DialogHeader>

          {/* Bandeau d'état de validation */}
          {isPending && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                    Mission en attente de validation par l'administrateur
                  </h4>
                  <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                    Cette mission doit être confirmée par un administrateur pour être enregistrée définitivement. L'ordre de mission officiel ne sera généré qu'après validation.
                  </p>
                </div>
              </div>

              {isAdmin && !isObserver && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
                  <Button
                    size="sm"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-9 cursor-pointer"
                    onClick={handleValidateMission}
                    disabled={isValidating}
                  >
                    {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    <span>Valider la mission & Générer l'Ordre de Mission</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-2 font-medium text-xs h-9 cursor-pointer"
                    onClick={() => setIsRejectDialogOpen(true)}
                    disabled={isValidating}
                  >
                    <Ban className="h-4 w-4" />
                    <span>Rejeter la mission</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {isRejected && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-destructive text-sm">
                    Mission Rejetée par l'administrateur
                  </h4>
                  <p className="text-xs text-destructive/90 mt-0.5">
                    Cette mission a été refusée. Aucun ordre de mission n'a été émis.
                  </p>
                  {mission.rejectionReason && (
                    <p className="text-xs font-medium text-foreground mt-2 bg-background/60 p-2 rounded border">
                      <span className="font-semibold text-muted-foreground">Motif : </span>
                      {mission.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 py-2">
              <div className="space-y-4">
                  <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 mt-1 text-muted-foreground" />
                      <div>
                          <h3 className="font-semibold text-sm">Lieu</h3>
                          <p className="text-sm text-foreground">{mission.location}</p>
                      </div>
                  </div>
                  <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 mt-1 text-muted-foreground" />
                      <div>
                          <h3 className="font-semibold text-sm">Période</h3>
                           <p className="text-sm text-foreground">
                              {startDate.toLocaleDateString('fr-FR')} - {endDate.toLocaleDateString('fr-FR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                              {isSingleDay ? `${mission.startTime || ''} - ${mission.endTime || ''}` : `${duration} jour(s)`}
                          </p>
                      </div>
                  </div>
                   <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 mt-1 text-muted-foreground" />
                      <div>
                          <h3 className="font-semibold text-sm">Statut</h3>
                          <Badge 
                            variant={getBadgeVariant(displayStatus)}
                            className={
                              displayStatus === 'En attente' 
                                ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400' 
                                : displayStatus === 'Rejetée'
                                ? 'bg-destructive/15 text-destructive border-destructive/30'
                                : ''
                            }
                          >
                            {displayStatus}
                          </Badge>
                      </div>
                  </div>
                  {assignedVehicle && (
                    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-primary/10">
                      <Truck className="h-5 w-5 mt-1 text-primary" />
                      <div>
                          <h3 className="font-semibold text-primary text-sm">Véhicule assigné</h3>
                          <p className="text-sm font-medium">{assignedVehicle.plateNumber}</p>
                          <p className="text-xs text-muted-foreground">{assignedVehicle.model} ({assignedVehicle.type})</p>
                      </div>
                    </div>
                  )}
              </div>
               <div className="space-y-4">
                  <div className="space-y-2">
                      <div className="flex items-center gap-3">
                           <Users className="h-5 w-5 text-muted-foreground" />
                           <h3 className="font-semibold text-sm">Agents Assignés ({agents.length})</h3>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-2">
                          {agents.length > 0 ? (
                              agents.map(agent => (
                                  <div key={agent.id} className="text-sm p-2 bg-muted/50 rounded-md">
                                      <p className="font-medium">{agent.fullName}</p>
                                      <p className="text-xs text-muted-foreground">
                                          {agent.rank}
                                          {agent.section === 'Officier' && ` - ${agent.section}`}
                                          {mission.leaderId === agent.id && (
                                            <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">(Chef de Mission)</span>
                                          )}
                                      </p>
                                  </div>
                              ))
                          ) : (
                              <p className="text-sm text-center text-muted-foreground py-4">Aucun agent assigné.</p>
                          )}
                      </div>
                  </div>
              </div>
          </div>

          <div className="border-t pt-4 mt-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Document Officiel</h4>
                {isValidated ? (
                  <Button
                    size="sm"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-xs h-9 cursor-pointer"
                    onClick={() => generateOrdreDeMissionPDF(
                      mission,
                      agents,
                      assignedVehicle ? `${assignedVehicle.model} (${assignedVehicle.plateNumber})` : undefined,
                      mission.leaderId
                    )}
                  >
                    <FileDown className="h-4 w-4" />
                    <span>Télécharger l'Ordre de Mission</span>
                  </Button>
                ) : isPending ? (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>Ordre de mission indisponible (En attente de validation)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-destructive font-medium">
                    <Ban className="h-4 w-4 shrink-0" />
                    <span>Ordre de mission non généré (Mission rejetée)</span>
                  </div>
                )}
              </div>

              {!isObserver && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-9 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-medium cursor-pointer"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit?.(mission);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Modifier/Prolonger</span>
                  </Button>

                  {displayStatus !== 'Terminée' && displayStatus !== 'Annulée' && displayStatus !== 'Rejetée' && displayStatus !== 'En attente' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-9 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium cursor-pointer"
                        onClick={() => {
                          onOpenChange(false);
                          onComplete?.(mission);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Terminer</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-9 border-destructive/30 text-destructive hover:bg-destructive/10 font-medium cursor-pointer"
                        onClick={() => {
                          onOpenChange(false);
                          onCancel?.(mission);
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Annuler</span>
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-9 border-destructive/50 text-destructive hover:bg-destructive/10 font-medium cursor-pointer"
                    onClick={() => {
                      onOpenChange(false);
                      onDelete?.(mission);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Supprimer</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Boîte de dialogue pour le motif de rejet */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Rejeter la mission
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir rejeter la mission « {mission.name} » ? Aucun ordre de mission ne sera généré.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-foreground">Motif du rejet (optionnel) :</label>
            <Textarea
              placeholder="Indiquez la raison du rejet (ex: manque d'effectif, véhicule non disponible...)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsRejectDialogOpen(false)}
              disabled={isRejecting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectMission}
              disabled={isRejecting}
            >
              {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer le Rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
