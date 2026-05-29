
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import type { Vehicle } from '@/lib/types';

const vehicleSchema = z.object({
  plateNumber: z.string().min(2, 'Plaque requise'),
  model: z.string().min(2, 'Modèle requis'),
  type: z.enum(['Pick-up', '4x4', 'Moto', 'Camion', 'Berline']),
  mileage: z.coerce.number().min(0),
  nextMaintenanceMileage: z.coerce.number().min(0).optional(),
});

interface EditVehicleFormProps {
  vehicle: Vehicle;
  onSuccess: () => void;
}

export function EditVehicleForm({ vehicle, onSuccess }: EditVehicleFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const form = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { 
      plateNumber: vehicle.plateNumber, 
      model: vehicle.model, 
      type: vehicle.type, 
      mileage: vehicle.mileage, 
      nextMaintenanceMileage: vehicle.nextMaintenanceMileage 
    },
  });

  const onSubmit = async (values: z.infer<typeof vehicleSchema>) => {
    if (!firestore) return;
    
    try {
      const vehicleRef = doc(firestore, 'vehicles', vehicle.id);
      await updateDoc(vehicleRef, values);
      
      logActivity(firestore, `Véhicule modifié : ${values.model} (${values.plateNumber})`, 'Logistique', '/logistique');
      toast({ title: 'Véhicule mis à jour' });
      onSuccess();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de modifier le véhicule." });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
        <FormField control={form.control} name="type" render={({ field }) => (
          <FormItem>
            <FormLabel>Type de véhicule</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="Pick-up">Pick-up</SelectItem>
                <SelectItem value="4x4">4x4</SelectItem>
                <SelectItem value="Moto">Moto</SelectItem>
                <SelectItem value="Camion">Camion</SelectItem>
                <SelectItem value="Berline">Berline</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        <FormField control={form.control} name="plateNumber" render={({ field }) => (
          <FormItem>
            <FormLabel>Numéro d'immatriculation</FormLabel>
            <FormControl><Input placeholder="Ex: 1234 AB 01" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="model" render={({ field }) => (
          <FormItem>
            <FormLabel>Modèle / Marque</FormLabel>
            <FormControl><Input placeholder="Ex: Toyota Hilux" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="mileage" render={({ field }) => (
            <FormItem>
              <FormLabel>Kilométrage actuel</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="nextMaintenanceMileage" render={({ field }) => (
            <FormItem>
              <FormLabel>Prochain entretien (KM)</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer les modifications
        </Button>
      </form>
    </Form>
  );
}
