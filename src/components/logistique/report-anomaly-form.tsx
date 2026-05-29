
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2, Banknote } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';
import type { Vehicle } from '@/lib/types';
import { useRole } from '@/hooks/use-role';

const anomalySchema = z.object({
  vehicleId: z.string().min(1, 'Sélectionnez un véhicule'),
  description: z.string().min(5, 'Description trop courte'),
  severity: z.enum(['Faible', 'Moyenne', 'Critique']),
  estimatedAmount: z.coerce.number().min(0).optional(),
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
      estimatedAmount: 0,
    },
  });

  const onSubmit = async (values: z.infer<typeof anomalySchema>) => {
    if (!firestore) return;
    
    try {
      const selectedVehicle = vehicles.find(v => v.id === values.vehicleId);
      const hasFinanceRequest = values.estimatedAmount && values.estimatedAmount > 0;
      
      // 1. Enregistrer l'anomalie logistique
      const anomalyData = { 
        vehicleId: values.vehicleId,
        description: values.description,
        severity: values.severity,
        date: Timestamp.now(),
        isResolved: false,
        reportedBy: role || 'Utilisateur',
        ...(hasFinanceRequest ? { financeStatus: 'En attente' } : {})
      };
      
      const anomalyRef = await addDoc(collection(firestore, 'vehicleAnomalies'), anomalyData);
      
      // 2. Mettre à jour le statut du véhicule si critique
      if (values.severity === 'Critique') {
        const vehicleRef = doc(firestore, 'vehicles', values.vehicleId);
        await updateDoc(vehicleRef, { status: 'En panne' });
      }

      // 3. Si un montant est saisi, créer une dépense en attente dans le volet Finances
      if (hasFinanceRequest) {
        const expenseData = {
          description: `RÉPARATION : ${selectedVehicle?.plateNumber} - ${values.description}`,
          amount: values.estimatedAmount,
          category: 'Logistique',
          date: Timestamp.now(),
          status: 'En attente',
          missionId: null,
          anomalyId: anomalyRef.id,
        };
        await addDoc(collection(firestore, 'expenses'), expenseData);
        logActivity(firestore, `Demande de fonds (En attente) : ${values.estimatedAmount} FCFA pour ${selectedVehicle?.plateNumber}`, 'Logistique', '/finance');
      }

      logActivity(firestore, `Anomalie signalée pour le véhicule ${selectedVehicle?.plateNumber}`, 'Logistique', '/logistique');
      
      toast({ 
        title: 'Signalement enregistré', 
        description: hasFinanceRequest 
          ? "L'anomalie a été créée et une demande de fonds a été envoyée aux finances." 
          : "L'anomalie a été enregistrée avec succès." 
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

        <div className="grid grid-cols-2 gap-4">
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

          <FormField control={form.control} name="estimatedAmount" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" /> Montant (FCFA)
              </FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormDescription className="text-[10px]">Optionnel. Crée une dépense à valider.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        </div>

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
