
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
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CalendarIcon, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { collection, Timestamp, addDoc, writeBatch, doc } from 'firebase/firestore';
import { useFirestore, errorEmitter, useMemoFirebase } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import type { Agent, Mission } from '@/lib/types';
import { useCollection } from '@/firebase/firestore/use-collection';
import { ScrollArea } from '../ui/scroll-area';
import { useMemo } from 'react';
import { getAgentAvailability } from '@/lib/agents';
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
  additionalAgentIds: z.array(z.string()).optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "La date de fin ne peut pas être antérieure à la date de début.",
  path: ["endDate"],
});


type MissionFormValues = z.infer<typeof missionSchema>;

interface CreateMissionFromGatheringFormProps {
    agents: Agent[];
    onMissionCreated: () => void;
    onCancel: () => void;
}

export function CreateMissionFromGatheringForm({ agents, onMissionCreated, onCancel }: CreateMissionFromGatheringFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<MissionFormValues>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      name: '',
      location: '',
      additionalAgentIds: [],
    },
  });
  
  const { isSubmitting } = form.formState;

  const agentsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'agents') : null, [firestore]);
  const missionsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'missions') : null, [firestore]);
  
  const { data: allAgents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);
  const { data: allMissions, isLoading: missionsLoading } = useCollection<Mission>(missionsQuery);

  const onSubmit = async (data: MissionFormValues) => {
    if (!firestore || !allAgents) return;
    
    const batch = writeBatch(firestore);
    const missionsCollection = collection(firestore, 'missions');
    const newMissionRef = doc(missionsCollection);
    
    const preselectedAgentIds = agents.map(agent => agent.id);
    const finalAgentIds = [...new Set([...preselectedAgentIds, ...(data.additionalAgentIds || [])])];

    const newMissionData: Omit<Mission, 'id' | 'status'> = {
        name: data.name,
        location: data.location,
        startDate: Timestamp.fromDate(data.startDate),
        endDate: Timestamp.fromDate(data.endDate),
        status: 'Planification',
        assignedAgentIds: finalAgentIds,
    };
    batch.set(newMissionRef, newMissionData);

    // No need to manually update agent availability

    batch.commit().then(() => {
        toast({
            title: "Mission créée !",
            description: `La mission "${data.name}" a été créée avec les agents sélectionnés.`,
        });

        const agentNames = finalAgentIds.map(id => {
            const agent = agents.find(a => a.id === id) || allAgents.find(a => a.id === id);
            return agent?.fullName || 'Inconnu';
        });

        // Envoyer le webhook
        sendMissionCreationWebhook({
            ...newMissionData,
            startDate: newMissionData.startDate.toDate().toISOString(),
            endDate: newMissionData.endDate.toDate().toISOString(),
            agents: agentNames,
        });

        form.reset();
        onMissionCreated();
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: newMissionRef.path,
            operation: 'create',
            requestResourceData: newMissionData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };
  
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');

  const additionalAvailableAgents = useMemo(() => {
    if (!allAgents || !allMissions || !startDate || !endDate) return [];
    
    const preselectedAgentIds = new Set(agents.map(a => a.id));

    return allAgents
        .filter(agent => {
            if (preselectedAgentIds.has(agent.id) || agent.onLeave) {
                return false;
            }

            const agentMissions = allMissions.filter(m => 
                m.assignedAgentIds.includes(agent.id) && 
                m.status !== 'Annulée' && 
                m.status !== 'Terminée'
            );

            const isOverlapping = agentMissions.some(mission => {
                const missionStart = mission.startDate.toDate();
                const missionEnd = mission.endDate.toDate();
                return startDate < missionEnd && endDate > missionStart;
            });

            return !isOverlapping;
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [allAgents, allMissions, startDate, endDate, agents]);


  return (
    <>
      <DialogHeader>
        <DialogTitle>Créer une mission</DialogTitle>
        <DialogDescription>
          Remplissez les détails pour la nouvelle mission. {agents.length} agent(s) sont présélectionnés.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
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

            <Controller
                control={form.control}
                name="additionalAgentIds"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Agents supplémentaires</FormLabel>
                     <p className="text-sm text-muted-foreground">Ajoutez d'autres agents disponibles à la mission.</p>
                    <div className="rounded-lg border">
                        <ScrollArea className="h-48">
                            <div className="p-4 space-y-2">
                            {agentsLoading || missionsLoading ? (
                                <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/></div>
                            ) : additionalAvailableAgents.length > 0 ? (
                                additionalAvailableAgents.map((agent) => {
                                    const isChecked = field.value?.includes(agent.id);
                                    return (
                                        <div
                                            key={agent.id}
                                            className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                            onClick={() => {
                                                    const currentValues = field.value || [];
                                                    const newValue = isChecked ? currentValues.filter((id) => id !== agent.id) : [...currentValues, agent.id];
                                                    field.onChange(newValue);
                                                }}
                                        >
                                            <div className={cn("h-5 w-5 flex items-center justify-center rounded border", isChecked ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/50")}>
                                                {isChecked && <Check className="h-4 w-4" />}
                                            </div>
                                            <div className="font-medium flex-1">
                                                {agent.fullName}
                                                <div className="text-sm text-muted-foreground">{agent.rank} | {agent.registrationNumber}</div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-muted-foreground p-8">Aucun autre agent disponible pour ces dates.</p>
                            )}
                            </div>
                        </ScrollArea>
                    </div>
                    <FormMessage />
                </FormItem>
                )}
            />

            <div className="flex justify-between pt-4">
                <button type="button" className="button-13" onClick={onCancel}>Annuler</button>
                <button type="submit" className="button-13" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer la mission
                </button>
            </div>
        </form>
      </Form>
    </>
  );
}
