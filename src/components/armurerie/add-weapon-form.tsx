'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-logger';

const weaponSchema = z.object({
  serialNumber: z.string().optional(),
  model: z.string().min(2, 'Modèle requis'),
  type: z.enum(['Arme de poing', "Fusil d'assaut", 'Munition', 'Accessoire', 'Casque', 'Gilets par balle']),
  quantity: z.coerce.number().min(0),
}).refine((data) => {
  // Le numéro de série est requis pour les armes et accessoires, mais pas pour les consommables/protection
  if (!['Munition', 'Casque', 'Gilets par balle'].includes(data.type)) {
    return !!data.serialNumber && data.serialNumber.trim().length >= 3;
  }
  return true;
}, {
  message: 'N° Série requis',
  path: ['serialNumber'],
});

export function AddWeaponForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const form = useForm<z.infer<typeof weaponSchema>>({
    resolver: zodResolver(weaponSchema),
    defaultValues: { serialNumber: '', model: '', type: 'Arme de poing', quantity: 1 },
  });

  const selectedType = form.watch('type');
  
  // Types qui nécessitent un numéro de série unique (une seule unité par enregistrement)
  const isUniqueSerialized = ['Arme de poing', "Fusil d'assaut"].includes(selectedType);
  
  // Types qui ne nécessitent pas de numéro de série (lots / vrac)
  const isBulkType = ['Munition', 'Casque', 'Gilets par balle'].includes(selectedType);
  
  const showSerialNumber = !isBulkType;
  const showQuantityField = !isUniqueSerialized;

  const onSubmit = async (values: z.infer<typeof weaponSchema>) => {
    if (!firestore) return;
    
    // Si le numéro de série est masqué (lots), on génère un identifiant de lot interne
    const finalSerialNumber = showSerialNumber 
      ? (values.serialNumber || '').trim() 
      : `LOT-${values.type.toUpperCase().replace(/ /g, '_')}-${Math.floor(Math.random() * 10000)}`;

    try {
      // Vérification de l'unicité du numéro de série
      const weaponsRef = collection(firestore, 'weapons');
      const q = query(weaponsRef, where("serialNumber", "==", finalSerialNumber));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        form.setError('serialNumber', {
          type: 'manual',
          message: 'Ce numéro de série existe déjà dans l\'inventaire.',
        });
        toast({
          variant: 'destructive',
          title: 'Doublon détecté',
          description: `Un équipement possède déjà le numéro de série : ${finalSerialNumber}`,
        });
        return;
      }

      // Si c'est une arme unique, la quantité est forcément 1
      const finalQuantity = isUniqueSerialized ? 1 : values.quantity;

      const weaponData = { 
        ...values,
        serialNumber: finalSerialNumber,
        quantity: finalQuantity,
        status: 'Fonctionnel',
      };
      
      await addDoc(collection(firestore, 'weapons'), weaponData);
      logActivity(firestore, `Nouvel équipement ajouté : ${values.model} (${finalSerialNumber})`, 'Armurerie', '/armurerie');
      toast({ title: 'Équipement enregistré' });
      onSuccess();
    } catch (error) {
      console.error('Error adding weapon:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer l'équipement." });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
        <FormField control={form.control} name="type" render={({ field }) => (
          <FormItem>
            <FormLabel>Type d'équipement</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
              <SelectContent>
                <SelectItem value="Arme de poing">Arme de poing</SelectItem>
                <SelectItem value="Fusil d'assaut">Fusil d'assaut</SelectItem>
                <SelectItem value="Munition">Munition</SelectItem>
                <SelectItem value="Accessoire">Accessoire</SelectItem>
                <SelectItem value="Casque">Casque</SelectItem>
                <SelectItem value="Gilets par balle">Gilets par balle</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )} />

        {showSerialNumber && (
          <FormField control={form.control} name="serialNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>Numéro de Série</FormLabel>
              <FormControl><Input placeholder="Ex: WPN-2024-001" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <FormField control={form.control} name="model" render={({ field }) => (
          <FormItem>
            <FormLabel>Modèle / Désignation</FormLabel>
            <FormControl><Input placeholder="Ex: AK-47, Sig Sauer P226..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        
        {showQuantityField && (
          <FormField control={form.control} name="quantity" render={({ field }) => (
            <FormItem>
              <FormLabel>Quantité en stock</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enregistrer le matériel
        </Button>
      </form>
    </Form>
  );
}