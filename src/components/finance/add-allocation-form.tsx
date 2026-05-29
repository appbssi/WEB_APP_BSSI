
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { collection, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2, Search } from 'lucide-react';
import type { Agent, Mission } from '@/lib/types';
import { useState, useMemo, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getDisplayStatus } from '@/lib/missions';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const allocationSchema = z.object({
  agentIds: z.array(z.string()).min(1, 'Veuillez sélectionner au moins un agent'),
  amount: z.coerce.number().min(1, 'Montant invalide'),
  purpose: z.string().min(3, 'Motif requis'),
});

interface AddAllocationFormProps {
  agents: Agent[];
  missions: Mission[];
  onSuccess: () => void;
}

export function AddAllocationForm({ agents, missions, onSuccess }: AddAllocationFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [search, setSearch] = useState('');
  const [selectedMissionId, setSelectedMissionId] = useState<string>('all');
  
  const form = useForm<z.infer<typeof allocationSchema>>({
    resolver: zodResolver(allocationSchema),
    defaultValues: { 
      agentIds: [], 
      amount: 0, 
      purpose: '',
    },
  });

  const activeMissions = useMemo(() => {
    if (!missions) return [];
    const now = new Date();
    return missions.filter(m => {
      const status = getDisplayStatus(m, now);
      return status === 'Planification' || status === 'En cours';
    });
  }, [missions]);

  // Réinitialiser la sélection quand la mission change pour éviter les erreurs
  useEffect(() => {
    form.setValue('agentIds', []);
  }, [selectedMissionId, form]);

  const filteredAgents = useMemo(() => {
    let list = agents;
    
    if (selectedMissionId !== 'all') {
      const mission = activeMissions.find(m => m.id === selectedMissionId);
      if (mission) {
        list = agents.filter(a => mission.assignedAgentIds.includes(a.id));
      }
    } else {
      const allActiveAgentIds = new Set<string>();
      activeMissions.forEach(m => m.assignedAgentIds.forEach(id => allActiveAgentIds.add(id)));
      list = agents.filter(a => allActiveAgentIds.has(a.id));
    }

    return list.filter(a => a.fullName.toLowerCase().includes(search.toLowerCase()));
  }, [agents, selectedMissionId, activeMissions, search]);

  const onSubmit = async (values: z.infer<typeof allocationSchema>) => {
    if (!firestore) return;
    
    const batch = writeBatch(firestore);
    const allocationsRef = collection(firestore, 'allocations');
    
    values.agentIds.forEach(agentId => {
      const newAllocationRef = doc(allocationsRef);
      batch.set(newAllocationRef, { 
        agentId,
        amount: values.amount,
        purpose: values.purpose,
        date: Timestamp.now() 
      });
    });
    
    try {
      await batch.commit();
      toast({ 
        title: 'Allocations enregistrées', 
        description: `${values.agentIds.length} agent(s) ont reçu l'allocation.`
      });
      onSuccess();
    } catch (error) {
      toast({ 
        variant: 'destructive',
        title: 'Erreur', 
        description: "Impossible d'enregistrer les allocations." 
      });
    }
  };

  const selectedAgentIds = form.watch('agentIds');
  const currentAmount = form.watch('amount');

  const handleToggleAgent = (agentId: string) => {
    const current = form.getValues('agentIds');
    if (current.includes(agentId)) {
      form.setValue('agentIds', current.filter(id => id !== agentId));
    } else {
      form.setValue('agentIds', [...current, agentId]);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
        
        <div className="space-y-2">
          <Label className="text-sm font-medium">Filtrer par Mission (Actives)</Label>
          <Select value={selectedMissionId} onValueChange={setSelectedMissionId}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes les missions actives" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les missions actives (Planifiées / En cours)</SelectItem>
              {activeMissions.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[0.8rem] text-muted-foreground">
            Affiche uniquement les agents désignés pour la mission sélectionnée.
          </p>
        </div>

        <FormField control={form.control} name="agentIds" render={() => (
          <FormItem>
            <FormLabel>Agents ({selectedAgentIds.length} sélectionnés)</FormLabel>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher un agent..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            
            <div className="border rounded-md overflow-hidden">
              <ScrollArea className="h-48">
                <div className="p-2 space-y-1">
                  {filteredAgents.length > 0 ? (
                    filteredAgents.map(a => (
                      <div 
                        key={a.id} 
                        className={cn(
                          "flex items-center space-x-3 p-2 rounded-sm cursor-pointer transition-colors hover:bg-accent",
                          selectedAgentIds.includes(a.id) && "bg-accent/50"
                        )}
                        onClick={() => handleToggleAgent(a.id)}
                      >
                        <Checkbox 
                          checked={selectedAgentIds.includes(a.id)} 
                          onCheckedChange={() => handleToggleAgent(a.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{a.fullName}</span>
                          <span className="text-xs text-muted-foreground">{a.rank} | {a.registrationNumber}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-center text-muted-foreground">Aucun agent trouvé</div>
                  )}
                </div>
              </ScrollArea>
            </div>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="purpose" render={({ field }) => (
          <FormItem><FormLabel>Motif de l'allocation</FormLabel><FormControl><Input placeholder="Ex: Frais de mission, Prime..." {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem><FormLabel>Montant par agent (FCFA)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        
        {selectedAgentIds.length > 0 && currentAmount > 0 && (
          <div className="p-3 bg-primary/10 rounded-lg text-sm font-bold text-primary">
            Total à verser : {(currentAmount * selectedAgentIds.length).toLocaleString('fr-FR')} FCFA
          </div>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || selectedAgentIds.length === 0}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer les allocations ({selectedAgentIds.length})
        </Button>
      </form>
    </Form>
  );
}
