
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { collection, Timestamp, doc } from 'firebase/firestore';
import { addDoc, updateDoc } from '@/lib/firestore-fast';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import type { Vehicle } from '@/lib/types';
import { useRole } from '@/hooks/use-role';

const anomalySchema = z.object({
  vehicleId: z.string().min(1, 'Sélectionnez un véhicule'),
  description: z.string().min(5, 'Description trop courte'),
  severity: z.enum(['Faible', 'Moyenne', 'Critique']),
});

interface ReportAnomalyFormProps {
  vehicles: Vehicle[];
  onSuccess: () => void;
  initialVehicleId?: string;
}

export function ReportAnomalyForm({ vehicles, onSuccess, initialVehicleId }: ReportAnomalyFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { role } = useRole();
  
  const form = useForm<z.infer<typeof anomalySchema>>({
    resolver: zodResolver(anomalySchema),
    defaultValues: { 
      vehicleId: initialVehicleId || '', 
      description: '', 
      severity: 'Moyenne',
    },
  });

  const onSubmit = async (values: z.infer<typeof anomalySchema>) => {
    if (!firestore) return;
    
    try {
      const selectedVehicle = vehicles.find(v => v.id === values.vehicleId);

      // 1. Enregistrer l'anomalie logistique
      const anomalyData = {
        vehicleId: values.vehicleId,
        description: values.description,
        severity: values.severity,
        date: Timestamp.now(),
        isResolved: false,
        reportedBy: role || 'Utilisateur',
      };

      await addDoc(collection(firestore, 'vehicleAnomalies'), anomalyData);

      // 2. Mettre à jour le statut du véhicule si critique
      if (values.severity === 'Critique') {
        const vehicleRef = doc(firestore, 'vehicles', values.vehicleId);
        await updateDoc(vehicleRef, { status: 'En panne' });
      }

      logActivity(firestore, `Anomalie signalée pour le véhicule ${selectedVehicle?.plateNumber}`, 'Logistique', '/logistique');

      toast({
        title: 'Signalement enregistré',
        description: "L'anomalie a été enregistrée avec succès.",
      });
      
      onSuccess();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de signaler l'anomalie." });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
        <FormField control={form.control} name="vehicleId" render={({ field }) => (
          <FormItem>
            <FormLabel>Véhicule concerné</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
              <FormControl><SelectTrigger><SelectValue placeholder="Choisir un véhicule" /></SelectTrigger></FormControl>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.plateNumber} - {v.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="severity" render={({ field }) => (
          <FormItem>
            <FormLabel>Sévérité</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="Faible">Faible (Entretien mineur)</SelectItem>
                <SelectItem value="Moyenne">Moyenne (Réparation nécessaire)</SelectItem>
                <SelectItem value="Critique">Critique (Immobilisé)</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Détails de l'anomalie ou de l'entretien</FormLabel>
            <FormControl><Textarea placeholder="Décrivez l'anomalie ou les travaux effectués..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer le signalement
        </Button>
      </form>
    </Form>
  );
}
