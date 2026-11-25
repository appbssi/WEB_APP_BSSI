
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Agent, Mission, Vehicle } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CalendarIcon, Loader2, Check, Search, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { collection, Timestamp, doc } from 'firebase/firestore';
import { updateDoc, writeBatch } from '@/lib/firestore-fast';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { useCollection } from '@/firebase/firestore/use-collection';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { logActivity } from '@/lib/activity-logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { checkAgentMissionConflict } from '@/lib/missions';


const formatDateToInputString = (timestamp: any) => {
  if (!timestamp) return '';
  const d = timestamp.toDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getMidnightTimestamp = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const missionSchema = z.object({
  name: z.string().min(3, 'Le nom de la mission est requis'),
  location: z.string().min(3, 'Le lieu est requis'),
  startDate: z.string().min(1, 'La date de début est requise.'),
  endDate: z.string().min(1, 'La date de fin est requise.'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  assignedAgentIds: z.array(z.string()).min(1, "Vous devez assigner au moins un agent."),
  vehicleId: z.string().optional(),
}).refine(data => {
  const start = parseLocalDate(data.startDate);
  const end = parseLocalDate(data.endDate);
  return getMidnightTimestamp(end) >= getMidnightTimestamp(start);
}, {
  message: "La date de fin ne peut pas être antérieure à la date de début.",
  path: ["endDate"],
}).refine(data => {
    if (data.startDate && data.endDate && data.startDate === data.endDate) {
        return !!data.startTime && !!data.endTime;
    }
    return true;
}, {
    message: "Les heures de début et de fin sont requises pour une mission d'une journée.",
    path: ["startTime"],
}).refine(data => {
    if (data.startTime && data.endTime) {
        return data.endTime > data.startTime;
    }
    return true;
}, {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ["endTime"],
});

type MissionFormValues = z.infer<typeof missionSchema>;

interface EditMissionDialogProps {
  mission: Mission;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function EditMissionDialog({ mission, isOpen, onOpenChange }: EditMissionDialogProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [agentSearch, setAgentSearch] = useState('');
  const [isStartOpen, setStartOpen] = useState(false);
  const [isEndOpen, setEndOpen] = useState(false);

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      name: mission.name,
      location: mission.location,
      startDate: formatDateToInputString(mission.startDate),
      endDate: formatDateToInputString(mission.endDate),
      startTime: mission.startTime || '08:00',
      endTime: mission.endTime || '17:00',
      assignedAgentIds: mission.assignedAgentIds || [],
      vehicleId: mission.vehicleId || 'none',
    },
  });
  
  const { isSubmitting } = form.formState;

  const agentsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'agents') : null, [firestore]);
  const missionsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'missions') : null, [firestore]);
  const vehiclesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'vehicles') : null, [firestore]);
  
  const { data: allAgents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  const { data: allMissions, isLoading: missionsLoading } = useCollection<Mission>(missionsQuery);
  const { data: allVehicles, isLoading: vehiclesLoading } = useCollection<Vehicle>(vehiclesQuery);
  
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');
  const isSingleDayMission = startDate && endDate && startDate === endDate;

  const operationalVehicles = useMemo(() => {
    if (!allVehicles) return [];
    return allVehicles.filter(v => v.status === 'Opérationnel' || v.id === mission.vehicleId);
  }, [allVehicles, mission.vehicleId]);

   useEffect(() => {
    if (!isSingleDayMission) {
      form.clearErrors(['startTime', 'endTime']);
    }
  }, [isSingleDayMission, form]);

  useEffect(() => {
    form.reset({
      name: mission.name,
      location: mission.location,
      startDate: formatDateToInputString(mission.startDate),
      endDate: formatDateToInputString(mission.endDate),
      startTime: mission.startTime || '08:00',
      endTime: mission.endTime || '17:00',
      assignedAgentIds: mission.assignedAgentIds || [],
      vehicleId: mission.vehicleId || 'none',
    });
  }, [mission, form, isOpen]);


  const onSubmit = async (data: MissionFormValues) => {
    if (!firestore) return;

    const safeAgents = allAgents || [];

    // Vérifier les conflits de planning pour les agents assignés
    for (const agentId of data.assignedAgentIds) {
      const agentObj = safeAgents.find(a => a.id === agentId);
      if (agentObj) {
        const conflict = checkAgentMissionConflict(
          agentObj,
          allMissions || [],
          data.startDate,
          data.endDate,
          data.startTime,
          data.endTime,
          mission.id
        );
        if (conflict.hasConflict) {
          toast({
            title: "Conflit de planning",
            description: `L'agent ${agentObj.fullName} ne peut pas être affecté : ${conflict.reason}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    const batch = writeBatch(firestore);

    const missionRef = doc(firestore, 'missions', mission.id);
    const missionUpdateData: any = {
        name: data.name,
        location: data.location,
        startDate: Timestamp.fromDate(parseLocalDate(data.startDate)),
        endDate: Timestamp.fromDate(parseLocalDate(data.endDate)),
        assignedAgentIds: data.assignedAgentIds,
        vehicleId: data.vehicleId === 'none' ? null : data.vehicleId,
    };

    if (isSingleDayMission) {
        missionUpdateData.startTime = data.startTime || null;
        missionUpdateData.endTime = data.endTime || null;
    } else {
        missionUpdateData.startTime = null;
        missionUpdateData.endTime = null;
    }
    
    batch.update(missionRef, missionUpdateData);
    
    batch.commit().then(() => {
        toast({
            title: "Mission mise à jour !",
            description: `La mission "${data.name}" a été mise à jour.`,
        });
        logActivity(firestore, `La mission "${data.name}" a été modifiée.`, 'Mission', '/missions');
        onOpenChange(false);
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: missionRef.path,
            operation: 'update',
            requestResourceData: missionUpdateData
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };
  
  const filteredAgents = useMemo(() => {
    if (!allAgents) return [];
    return allAgents
      .filter(agent => 
        `${agent.fullName} ${agent.registrationNumber}`.toLowerCase().includes(agentSearch.toLowerCase())
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [allAgents, agentSearch]);


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Modifier la mission</DialogTitle>
          <DialogDescription>
            Mettez à jour les détails et les agents assignés de la mission.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom de la mission</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lieu</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date de début</FormLabel>
                    <FormControl>
                        <Input
                            type="date"
                            className="w-full"
                            {...field}
                        />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date de fin</FormLabel>
                    <FormControl>
                        <Input
                            type="date"
                            className="w-full"
                            {...field}
                        />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

             {isSingleDayMission && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Heure de début</FormLabel>
                            <FormControl>
                                <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                        <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Heure de fin</FormLabel>
                            <FormControl>
                                <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
            )}

            <FormField
              control={form.control}
              name="vehicleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Truck className="h-4 w-4" /> Véhicule de transport
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Changer le véhicule (optionnel)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Aucun véhicule assigné</SelectItem>
                      {operationalVehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plateNumber} - {v.model} ({v.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="assignedAgentIds"
              render={() => (
                <FormItem>
                  <FormLabel>Agents assignés</FormLabel>
                   <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Rechercher un agent..."
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                    />
                  </div>
                  <Controller
                    control={form.control}
                    name="assignedAgentIds"
                    render={({ field }) => (
                      <>
                        <ScrollArea className="h-48 w-full rounded-md border">
                            <div className="p-4 space-y-2">
                            {agentsLoading || missionsLoading ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/>
                                </div>
                            ) : filteredAgents.length > 0 ? (
                                filteredAgents.map((agent) => {
                                    const isChecked = field.value?.includes(agent.id);
                                    const isCurrentlyAssigned = (mission.assignedAgentIds || []).includes(agent.id);
                                    
                                    const conflict = checkAgentMissionConflict(
                                      agent,
                                      allMissions || [],
                                      startDate,
                                      endDate,
                                      startTime,
                                      endTime,
                                      mission.id
                                    );

                                    const isDisabled = !isCurrentlyAssigned && conflict.hasConflict;

                                    return (
                                        <div
                                            key={agent.id}
                                            className={cn("flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground", isDisabled ? "opacity-60 cursor-not-allowed bg-muted/40" : "cursor-pointer")}
                                            onClick={() => {
                                                if(isDisabled) return;
                                                const currentValues = field.value || [];
                                                const newValue = isChecked
                                                    ? currentValues.filter((id) => id !== agent.id)
                                                    : [...currentValues, agent.id];
                                                field.onChange(newValue);
                                            }}
                                        >
                                            <div className={cn("h-5 w-5 flex items-center justify-center rounded border", isChecked ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/50")}>
                                              {isChecked && <Check className="h-4 w-4" />}
                                            </div>
                                            <div className="font-medium flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span>{agent.fullName}</span>
                                                  {isDisabled && (
                                                    <span className="text-xs text-destructive font-normal">({conflict.reason})</span>
                                                  )}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                  {agent.rank} | {agent.registrationNumber}
                                                </div>
                                            </div>
                                             <Badge variant={isDisabled ? 'destructive' : isChecked ? 'default' : 'outline'}>
                                                {isDisabled ? (conflict.type === 'leave' ? 'En congé' : 'Indisponible') : isChecked ? 'Assigné' : 'Disponible'}
                                             </Badge>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-muted-foreground p-8">Aucun agent disponible.</p>
                            )}
                            </div>
                        </ScrollArea>
                      </>
                    )}
                  />
                   <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sauvegarder les modifications
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
