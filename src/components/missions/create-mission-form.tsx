
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { CalendarIcon, Loader2, Check, Search, Truck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { collection, Timestamp, addDoc, writeBatch, doc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { useState, useMemo, useEffect } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import type { Agent, Mission, Vehicle } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { logActivity } from '@/lib/activity-logger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sendMissionCreationWebhook } from '@/lib/webhooks';

const missionSchema = z.object({
  name: z.string().min(3, 'Le nom de la mission est requis'),
  location: z.string().min(3, 'Le lieu est requis'),
  startDate: z.date({
    required_error: "La date de début est requise.",
  }),
  endDate: z.date({
    required_error: "La date de fin est requise.",
  }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  assignedAgentIds: z.array(z.string()).min(1, "Vous devez assigner au moins un agent."),
  vehicleId: z.string().optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "La date de fin ne peut pas être antérieure à la date de début.",
  path: ["endDate"],
}).refine(data => {
    if (data.startDate && data.endDate && isSameDay(data.startDate, data.endDate)) {
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

export function CreateMissionForm({ onMissionCreated }: { onMissionCreated?: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [agentSearch, setAgentSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      name: '',
      location: '',
      startTime: '08:00',
      endTime: '17:00',
      assignedAgentIds: [],
      vehicleId: 'none',
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
  const isSingleDayMission = startDate && endDate && isSameDay(startDate, endDate);

  const operationalVehicles = useMemo(() => {
    if (!allVehicles) return [];
    return allVehicles.filter(v => v.status === 'Opérationnel');
  }, [allVehicles]);

  useEffect(() => {
    if (!isSingleDayMission) {
      form.clearErrors(['startTime', 'endTime']);
    }
  }, [isSingleDayMission, form]);

  const onSubmit = async (data: MissionFormValues) => {
    if (!firestore || !allAgents) return;
    
    const batch = writeBatch(firestore);

    const missionsCollection = collection(firestore, 'missions');
    const newMissionRef = doc(missionsCollection);
    
    const newMissionData: Omit<Mission, 'id' | 'status'> = {
        name: data.name,
        location: data.location,
        startDate: Timestamp.fromDate(data.startDate),
        endDate: Timestamp.fromDate(data.endDate),
        assignedAgentIds: data.assignedAgentIds,
        status: 'Planification',
        vehicleId: data.vehicleId === 'none' ? undefined : data.vehicleId,
    };

    if (isSingleDayMission) {
        newMissionData.startTime = data.startTime;
        newMissionData.endTime = data.endTime;
    }

    batch.set(newMissionRef, newMissionData);

    batch.commit().then(() => {
        toast({
            title: "Mission créée !",
            description: `La mission "${data.name}" a été créée avec succès.`,
        });
        logActivity(firestore, `La mission "${data.name}" a été créée.`, 'Mission', '/missions');
        
        const agentNames = data.assignedAgentIds.map(id => allAgents.find(a => a.id === id)?.fullName || 'Inconnu');

        // Envoyer le webhook
        sendMissionCreationWebhook({
            ...newMissionData,
            startDate: newMissionData.startDate.toDate().toISOString(),
            endDate: newMissionData.endDate.toDate().toISOString(),
            agents: agentNames,
        });

        form.reset();
        if (onMissionCreated) {
          onMissionCreated();
        }
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: newMissionRef.path,
            operation: 'create',
            requestResourceData: newMissionData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(['name', 'location', 'startDate', 'endDate', 'startTime', 'endTime']);
    if (isValid) {
        setCurrentStep(2);
    }
  };
  
  const availableAgents = useMemo(() => {
    if (!startDate || !endDate || !allAgents || !allMissions) return [];

    const selectedStart = new Date(startDate);
    const selectedEnd = new Date(endDate);
    
    return allAgents
      .filter(agent => {
        if (agent.leaveStartDate && agent.leaveEndDate) {
            const leaveStart = agent.leaveStartDate.toDate();
            const leaveEnd = agent.leaveEndDate.toDate();
            if (selectedStart < leaveEnd && selectedEnd > leaveStart) {
              return false;
            }
        }

        const hasConflict = allMissions.some(mission => {
            if (mission.status === 'Terminée' || mission.status === 'Annulée') {
                return false;
            }
            if (!mission.assignedAgentIds.includes(agent.id)) {
                return false;
            }
            
            const missionStart = mission.startDate.toDate();
            const missionEnd = mission.endDate.toDate();

            return selectedStart < missionEnd && selectedEnd > missionStart;
        });

        return !hasConflict;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [allAgents, allMissions, startDate, endDate]);

  const filteredAgents = useMemo(() => {
    return availableAgents.filter(agent => {
        const matchesSearch = `${agent.fullName} ${agent.registrationNumber}`.toLowerCase().includes(agentSearch.toLowerCase());
        
        let matchesSection;
        if (sectionFilter === 'all') {
            matchesSection = true;
        } else if (sectionFilter === 'Non assigné') {
            matchesSection = !agent.section || agent.section === 'Non assigné';
        } else {
            matchesSection = (agent.section || '').toLowerCase() === sectionFilter.toLowerCase();
        }

        return matchesSearch && matchesSection;
    });
  }, [availableAgents, agentSearch, sectionFilter]);

  return (
    <div className="p-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {currentStep === 1 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">1. Détails de la mission</h3>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Date de début</FormLabel>
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                    )}
                                >
                                    {field.value ? (
                                    format(field.value, "PPP", { locale: fr })
                                    ) : (
                                    <span>Choisissez une date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date < new Date(new Date().setHours(0,0,0,0))
                                }
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
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
                            <Popover>
                            <PopoverTrigger asChild>
                                <FormControl>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                    )}
                                >
                                    {field.value ? (
                                    format(field.value, "PPP", { locale: fr })
                                    ) : (
                                    <span>Choisissez une date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                    date < (form.getValues("startDate") || new Date(new Date().setHours(0,0,0,0)))
                                }
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
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
                                <SelectValue placeholder="Choisir un véhicule (optionnel)" />
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

                    <div className="flex justify-end pt-4">
                        <button type="button" onClick={handleNextStep} className="button-13">Suivant</button>
                    </div>
                </div>
            )}
            
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">2. Assigner les agents</h3>
                <p className="text-sm text-muted-foreground">Sélectionnez les agents à assigner à cette mission. Seuls les agents disponibles pour les dates choisies sont affichés.</p>
                
                 <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Rechercher un agent..."
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                    />
                  </div>
                  <Select value={sectionFilter} onValueChange={setSectionFilter}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filtrer par section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">TOUTES LES SECTIONS</SelectItem>
                      <SelectItem value="Armurerie">ARMURERIE</SelectItem>
                      <SelectItem value="Administration">ADMINISTRATION</SelectItem>
                      <SelectItem value="FAUNE">FAUNE</SelectItem>
                      <SelectItem value="CONDUCTEUR">CONDUCTEUR</SelectItem>
                      <SelectItem value="SECTION FEMININE">SECTION FEMININE</SelectItem>
                      <SelectItem value="DETACHEMENT NOE">DETACHEMENT NOE</SelectItem>
                      <SelectItem value="DETACHEMENT TINGRELA">DETACHEMENT TINGRELA</SelectItem>
                      <SelectItem value="DETACHEMENT MORONDO">DETACHEMENT MORONDO</SelectItem>
                      <SelectItem value="Non assigné">NON ASSIGNÉ</SelectItem>
                    </SelectContent>
                  </Select>
                 </div>

                <Controller
                  control={form.control}
                  name="assignedAgentIds"
                  render={({ field }) => (
                    <FormItem>
                        <div className="rounded-lg border">
                             <ScrollArea className="h-72">
                                <div className="p-4 space-y-2">
                                {agentsLoading || missionsLoading ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/>
                                    </div>
                                ) : filteredAgents.length > 0 ? (
                                    filteredAgents.map((agent) => {
                                        const isChecked = field.value?.includes(agent.id);
                                        return (
                                            <div
                                                key={agent.id}
                                                className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                                onClick={() => {
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
                                                    {agent.fullName}
                                                    <div className="text-sm text-muted-foreground">
                                                        {agent.rank} | {agent.registrationNumber} | {agent.contact}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-center text-muted-foreground p-8">Aucun agent disponible pour ces dates.</p>
                                )}
                                </div>
                            </ScrollArea>
                        </div>
                       <FormMessage />
                    </FormItem>
                    )}
                />
                
                <div className="flex justify-between pt-4">
                  <button type="button" className="button-13" onClick={() => setCurrentStep(1)}>Précédent</button>
                  <button type="submit" className="button-13" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer la mission
                  </button>
                </div>
              </div>
            )}
          </form>
        </Form>
    </div>
  );
}
