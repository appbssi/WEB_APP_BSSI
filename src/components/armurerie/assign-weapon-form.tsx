'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, Timestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2, Search, Info, AlertCircle } from 'lucide-react';
import type { Weapon, Agent, Mission, WeaponAssignment } from '@/lib/types';
import { logActivity } from '@/lib/activity-logger';
import { useState, useMemo, useEffect } from 'react';
import { getDisplayStatus } from '@/lib/missions';
import { Label } from '@/components/ui/label';

const assignSchema = z.object({
  weaponId: z.string().min(1, 'Sélectionnez un équipement'),
  agentId: z.string().min(1, 'Sélectionnez un agent'),
  ammunitionCount: z.coerce.number().min(0, 'Nombre invalide').default(0),
  magazineCount: z.coerce.number().min(0, 'Nombre invalide').default(0),
  notes: z.string().min(3, "Le motif d'affectation est obligatoire."),
  munitionLotId: z.string().optional(),
});

interface AssignWeaponFormProps {
  weapons: Weapon[];
  agents: Agent[];
  assignments: WeaponAssignment[];
  missions: Mission[];
  onSuccess: () => void;
}

export function AssignWeaponForm({ weapons, agents, assignments, missions, onSuccess }: AssignWeaponFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [selectedMissionId, setSelectedMissionId] = useState<string>('all');
  const [agentSearch, setAgentSearch] = useState('');
  
  const form = useForm<z.infer<typeof assignSchema>>({
    resolver: zodResolver(assignSchema),
    defaultValues: { weaponId: '', agentId: '', notes: '', ammunitionCount: 0, magazineCount: 0, munitionLotId: '' },
  });

  const selectedWeaponId = form.watch('weaponId');
  const ammunitionCount = form.watch('ammunitionCount');
  const selectedMunitionLotId = form.watch('munitionLotId');
  const magazineCount = form.watch('magazineCount');
  
  const selectedWeapon = useMemo(() => 
    weapons.find(w => w.id === selectedWeaponId), 
    [weapons, selectedWeaponId]
  );

  const munitionLots = useMemo(() => 
    weapons.filter(w => w.type === 'Munition' && w.quantity > 0),
    [weapons]
  );

  const activeMunitionLot = useMemo(() => {
    if (selectedWeapon?.type === 'Munition') return selectedWeapon;
    return munitionLots.find(l => l.id === selectedMunitionLotId);
  }, [selectedWeapon, munitionLots, selectedMunitionLotId]);

  const isStockInsufficient = useMemo(() => {
    if (ammunitionCount <= 0) return false;
    if (!activeMunitionLot) return true;
    return ammunitionCount > activeMunitionLot.quantity;
  }, [activeMunitionLot, ammunitionCount]);

  const activeMissions = useMemo(() => {
    if (!missions) return [];
    const now = new Date();
    return missions.filter(m => {
      const status = getDisplayStatus(m, now);
      return status === 'Planification' || status === 'En cours';
    });
  }, [missions]);

  // Si le nombre de chargeurs est 0, on remet les munitions à 0
  useEffect(() => {
    if (Number(magazineCount) <= 0) {
      form.setValue('ammunitionCount', 0);
    }
  }, [magazineCount, form]);

  const filteredAgents = useMemo(() => {
    // 1. Identifier les agents qui ont déjà du matériel non retourné
    const armedAgentIds = new Set(
      assignments.filter(a => !a.returnedAt).map(a => a.agentId)
    );

    // 2. Filtrer la liste de base pour exclure les agents déjà armés
    let list = agents.filter(a => !armedAgentIds.has(a.id));
    
    if (selectedMissionId !== 'all') {
      const mission = activeMissions.find(m => m.id === selectedMissionId);
      if (mission) {
        list = list.filter(a => mission.assignedAgentIds.includes(a.id));
      }
    }

    if (agentSearch) {
      list = list.filter(a => 
        a.fullName.toLowerCase().includes(agentSearch.toLowerCase()) ||
        a.registrationNumber?.toLowerCase().includes(agentSearch.toLowerCase())
      );
    }

    return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [agents, assignments, selectedMissionId, activeMissions, agentSearch]);

  const onSubmit = async (values: z.infer<typeof assignSchema>) => {
    if (!firestore || isStockInsufficient) return;
    
    const weapon = weapons.find(w => w.id === values.weaponId);
    const agent = agents.find(a => a.id === values.agentId);

    if (!weapon || !agent) return;

    const lotId = activeMunitionLot?.id;

    const assignmentData = { 
      weaponId: values.weaponId,
      agentId: values.agentId,
      ammunitionCount: values.ammunitionCount,
      magazineCount: values.magazineCount,
      notes: values.notes,
      munitionLotId: lotId || null,
      assignedAt: Timestamp.now(),
      returnedAt: null,
    };
    
    try {
      // 1. Créer l'attribution
      await addDoc(collection(firestore, 'weaponAssignments'), assignmentData);
      
      // 2. Déduire du stock si c'est des munitions
      if (lotId && values.ammunitionCount > 0) {
        const lotRef = doc(firestore, 'weapons', lotId);
        await updateDoc(lotRef, {
          quantity: increment(-(values.ammunitionCount || 0))
        });
      }
      
      logActivity(firestore, `Attribution : ${weapon.model} assigné à ${agent.fullName} (${values.ammunitionCount} mun.)`, 'Armurerie', '/armurerie');
      toast({ title: 'Attribution réussie' });
      onSuccess();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer l'attribution." });
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
        </div>

        <FormField control={form.control} name="agentId" render={({ field }) => (
          <FormItem>
            <FormLabel>Agent <span className="text-destructive">*</span></FormLabel>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Rechercher un agent..." 
                className="pl-8" 
                value={agentSearch} 
                onChange={(e) => setAgentSearch(e.target.value)} 
              />
            </div>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Choisir un agent" /></SelectTrigger></FormControl>
              <SelectContent>
                {filteredAgents.length > 0 ? (
                  filteredAgents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.fullName} ({a.rank})</SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>Aucun agent disponible (déjà armé ou inexistant)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="weaponId" render={({ field }) => (
          <FormItem>
            <FormLabel>Équipement / Arme <span className="text-destructive">*</span></FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Choisir le matériel" /></SelectTrigger></FormControl>
              <SelectContent>
                {weapons.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.model} - {w.serialNumber} 
                    {w.type === 'Munition' ? ` (Stock: ${w.quantity})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        {selectedWeapon && selectedWeapon.type !== 'Munition' && (
          <FormField control={form.control} name="munitionLotId" render={({ field }) => (
            <FormItem>
              <FormLabel>Source des munitions (facultatif)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Choisir un lot de munitions" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">Aucune munition</SelectItem>
                  {munitionLots.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.model} (Stock: {l.quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className="text-[10px]">Sélectionnez le stock dans lequel prélever les munitions.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="magazineCount" render={({ field }) => (
            <FormItem>
              <FormLabel>Nbre de chargeurs</FormLabel>
              <FormControl><Input type="number" {...field} min={0} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="ammunitionCount" render={({ field }) => (
            <FormItem>
              <FormLabel>Nbre de munitions</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  {...field} 
                  className={isStockInsufficient ? "border-destructive text-destructive" : ""}
                  disabled={Number(magazineCount) <= 0}
                  placeholder={Number(magazineCount) <= 0 ? "Chargeur requis" : ""}
                />
              </FormControl>
              {Number(magazineCount) <= 0 ? (
                <p className="text-[10px] text-orange-600 font-medium mt-1">Vous devez saisir au moins 1 chargeur pour autoriser les munitions.</p>
              ) : activeMunitionLot ? (
                <div className="mt-1">
                  <p className={`flex items-center gap-1 text-[10px] ${isStockInsufficient ? "text-destructive font-bold animate-pulse" : "text-primary"}`}>
                    {isStockInsufficient ? <AlertCircle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                    Stock disponible : {activeMunitionLot.quantity} unités
                  </p>
                  {isStockInsufficient && (
                    <p className="text-[10px] text-destructive mt-0.5">La quantité demandée dépasse le stock disponible.</p>
                  )}
                </div>
              ) : (
                <FormDescription className="text-[10px]">
                  {selectedWeapon?.type !== 'Munition' && ammunitionCount > 0 ? (
                    <span className="text-destructive font-semibold">Sélectionnez une source de munitions ci-dessus.</span>
                  ) : (
                    "Dotation accompagnant l'arme."
                  )}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Motif d'affectation <span className="text-destructive">*</span></FormLabel>
            <FormControl>
              <Input placeholder="Ex: Dotation mission spéciale..." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button 
          type="submit" 
          className="w-full" 
          disabled={form.formState.isSubmitting || isStockInsufficient}
        >
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isStockInsufficient ? 'Stock Insuffisant' : "Confirmer l'attribution"}
        </Button>
      </form>
    </Form>
  );
}