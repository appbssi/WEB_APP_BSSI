
'use client';

import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { CalendarIcon, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { collection, Timestamp, addDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, errorEmitter } from '@/firebase';
import { FirestorePermissionError } from '@/firebase/errors';
import { useCollection } from '@/firebase/firestore/use-collection';
import type { Agent } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { logActivity } from '@/lib/activity-logger';

const gatheringSchema = z.object({
  name: z.string().min(3, 'Le nom du rassemblement est requis.'),
  date: z.date({ required_error: "La date est requise." }),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "L'heure doit être au format HH:MM."),
  assignedAgentIds: z.array(z.string()).min(1, "Vous devez assigner au moins un agent."),
});

type GatheringFormValues = z.infer<typeof gatheringSchema>;

interface CreateGatheringFormProps {
  onGatheringCreated: () => void;
}

export function CreateGatheringForm({ onGatheringCreated }: CreateGatheringFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();
  const firestore = useFirestore();

  const form = useForm<GatheringFormValues>({
    resolver: zodResolver(gatheringSchema),
    defaultValues: {
      name: '',
      time: '08:00',
      assignedAgentIds: [],
    },
  });
  
  const { isSubmitting } = form.formState;

  const agentsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'agents') : null, [firestore]);
  const { data: allAgents, isLoading: agentsLoading } = useCollection<Agent>(agentsQuery);

  const availableAgents = useMemo(() => {
    if (!allAgents) return [];
    return [...allAgents]
      .filter(agent => !agent.onLeave)
      .sort((a, b) => {
        const nameA = a.fullName || '';
        const nameB = b.fullName || '';
        return nameA.localeCompare(nameB);
      });
  }, [allAgents]);


  const onSubmit = async (data: GatheringFormValues) => {
    if (!firestore) return;

    const [hours, minutes] = data.time.split(':').map(Number);
    const dateTime = new Date(data.date);
    dateTime.setHours(hours, minutes, 0, 0);

    const gatheringData = {
        name: data.name,
        dateTime: Timestamp.fromDate(dateTime),
        assignedAgentIds: data.assignedAgentIds,
        absentAgentIds: [],
    };
    
    addDoc(collection(firestore, 'gatherings'), gatheringData).then(() => {
        toast({
            title: "Rassemblement créé !",
            description: `Le rassemblement "${data.name}" a été créé avec succès.`,
        });
        logActivity(firestore, `Le rassemblement "${data.name}" a été créé.`, 'Rassemblement', '/gatherings');
        form.reset();
        setCurrentStep(1);
        onGatheringCreated();
    }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'gatherings',
            operation: 'create',
            requestResourceData: gatheringData,
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(['name', 'date', 'time']);
    if (isValid) {
        setCurrentStep(2);
    }
  };

  const assignedAgentIds = form.watch('assignedAgentIds');
  const allAvailableAgentIds = availableAgents.map(agent => agent.id);
  const areAllSelected = allAvailableAgentIds.length > 0 && allAvailableAgentIds.every(id => assignedAgentIds.includes(id));

  const handleToggleSelectAll = () => {
    if (areAllSelected) {
        form.setValue('assignedAgentIds', []);
    } else {
        form.setValue('assignedAgentIds', allAvailableAgentIds);
    }
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Créer un nouveau rassemblement</DialogTitle>
          <DialogDescription>
            Planifiez un rassemblement et assignez-y des agents.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            {currentStep === 1 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">1. Détails du rassemblement</h3>
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nom du rassemblement</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="date" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                {field.value ? format(field.value, "PPP", { locale: fr }) : <span>Choisissez une date</span>}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                         <FormField control={form.control} name="time" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Heure (HH:MM)</FormLabel>
                                <FormControl><Input type="time" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="button" onClick={handleNextStep}>Suivant</Button>
                    </div>
                </div>
            )}
            
            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">2. Assigner les agents</h3>
                <p className="text-sm text-muted-foreground">Sélectionnez les agents à assigner. Les agents en congé ne sont pas listés.</p>
                
                <Controller control={form.control} name="assignedAgentIds" render={({ field }) => (
                    <FormItem>
                        <div className="flex justify-end mb-2">
                            <Button type="button" variant="link" onClick={handleToggleSelectAll} disabled={availableAgents.length === 0}>
                                {areAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </Button>
                        </div>
                        <div className="rounded-lg border">
                             <ScrollArea className="h-72">
                                <div className="p-4 space-y-2">
                                {agentsLoading ? (
                                    <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground"/></div>
                                ) : availableAgents.length > 0 ? (
                                    availableAgents.map((agent) => {
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
                                    <p className="text-center text-muted-foreground p-8">Aucun agent disponible.</p>
                                )}
                                </div>
                            </ScrollArea>
                        </div>
                       <FormMessage />
                    </FormItem>
                    )}
                />
                
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={() => setCurrentStep(1)}>Précédent</Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer le rassemblement
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Form>
    </>
  );
}
