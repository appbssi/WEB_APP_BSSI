
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Agent, Mission, MissionStatus, Vehicle } from '@/lib/types';
import { Calendar, MapPin, Users, Info, Truck } from 'lucide-react';
import { differenceInDays, isSameDay } from 'date-fns';
import type { MissionWithDisplayStatus } from '@/lib/missions';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemo } from 'react';

interface MissionDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mission: MissionWithDisplayStatus;
  agents: Agent[];
}

export function MissionDetailsDialog({ isOpen, onOpenChange, mission, agents }: MissionDetailsDialogProps) {
  const firestore = useFirestore();
  const vehiclesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'vehicles') : null, [firestore]);
  const { data: vehicles } = useCollection<Vehicle>(vehiclesQuery);

  const assignedVehicle = useMemo(() => {
    if (!vehicles || !mission.vehicleId) return null;
    return vehicles.find(v => v.id === mission.vehicleId);
  }, [vehicles, mission.vehicleId]);

  const startDate = mission.startDate.toDate();
  const endDate = mission.endDate.toDate();
  const isSingleDay = isSameDay(startDate, endDate);
  const duration = differenceInDays(endDate, startDate) + 1;

  const displayStatus = mission.displayStatus;

  const getBadgeVariant = (status: MissionStatus) => {
    switch (status) {
      case 'En cours': return 'default';
      case 'Terminée': return 'outline';
      case 'Annulée': return 'destructive';
      case 'Planification': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mission.name}</DialogTitle>
          <DialogDescription>Détails complets de la mission.</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 mt-1 text-muted-foreground" />
                    <div>
                        <h3 className="font-semibold">Lieu</h3>
                        <p className="text-sm text-foreground">{mission.location}</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 mt-1 text-muted-foreground" />
                    <div>
                        <h3 className="font-semibold">Période</h3>
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
                        <h3 className="font-semibold">Statut</h3>
                        <Badge variant={getBadgeVariant(displayStatus)}>{displayStatus}</Badge>
                    </div>
                </div>
                {assignedVehicle && (
                  <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-primary/10">
                    <Truck className="h-5 w-5 mt-1 text-primary" />
                    <div>
                        <h3 className="font-semibold text-primary">Véhicule assigné</h3>
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
                         <h3 className="font-semibold">Agents Assignés ({agents.length})</h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-2">
                        {agents.length > 0 ? (
                            agents.map(agent => (
                                <div key={agent.id} className="text-sm p-2 bg-muted/50 rounded-md">
                                    <p className="font-medium">{agent.fullName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {agent.rank}
                                        {agent.section === 'Officier' && ` - ${agent.section}`}
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
      </DialogContent>
    </Dialog>
  );
}
