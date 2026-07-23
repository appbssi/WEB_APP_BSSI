'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc, Timestamp, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PackageCheck, Loader2 } from 'lucide-react';
import type { Agent, Saisie, SaisieStatus } from '@/lib/types';

const CATEGORIES = [
  'Stupéfiants & Drogues',
  'Armes & Munitions',
  'Contrebande & Devises',
  'Véhicules & Engins',
  'Électronique & High-Tech',
  'Documents / Faux Papiers',
  'Autre',
];

const UNITS = [
  'Unité(s)',
  'Kg',
  'Grammes',
  'Litre(s)',
  'Carton(s)',
  'Sachet(s)',
  'Lot(s)',
  'Pièce(s)',
  'Balle(s) / Munitions',
];

const STATUSES: SaisieStatus[] = [
  'En Dépôt / Scellé',
  'Transféré au Parquet',
  'Restitué',
  'Détruit',
  'En Dépôt Coffre-Fort',
];

const editSaisieSchema = z.object({
  designation: z.string().min(2, 'La désignation est obligatoire'),
  quantity: z.coerce.number().min(1, 'La quantité doit être supérieure à 0'),
  unit: z.string().default('Unité(s)'),
  category: z.string().min(1, 'Veuillez sélectionner une catégorie'),
  dateSaisie: z.string().min(1, 'La date est obligatoire'),
  location: z.string().optional(),
  agentId: z.string().optional(),
  detaineeName: z.string().optional(),
  pvNumber: z.string().optional(),
  status: z.string(),
  notes: z.string().optional(),
});

type EditSaisieFormValues = z.infer<typeof editSaisieSchema>;

interface EditSaisieDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saisie: Saisie | null;
  agents?: Agent[];
}

export function EditSaisieDialog({
  open,
  onOpenChange,
  saisie,
  agents = [],
}: EditSaisieDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const agentList = agents || [];

  const form = useForm<EditSaisieFormValues>({
    resolver: zodResolver(editSaisieSchema),
    defaultValues: {
      designation: '',
      quantity: 1,
      unit: 'Unité(s)',
      category: 'Stupéfiants & Drogues',
      dateSaisie: '',
      location: '',
      agentId: 'none',
      detaineeName: '',
      pvNumber: '',
      status: 'En Dépôt / Scellé',
      notes: '',
    },
  });

  useEffect(() => {
    if (saisie) {
      let dateStr = new Date().toISOString().split('T')[0];
      if (saisie.dateSaisie && (saisie.dateSaisie as any).toDate) {
        dateStr = (saisie.dateSaisie as any).toDate().toISOString().split('T')[0];
      }

      form.reset({
        designation: saisie.designation || '',
        quantity: saisie.quantity || 1,
        unit: saisie.unit || 'Unité(s)',
        category: saisie.category || 'Stupéfiants & Drogues',
        dateSaisie: dateStr,
        location: saisie.location || '',
        agentId: saisie.agentId || 'none',
        detaineeName: saisie.detaineeName || '',
        pvNumber: saisie.pvNumber || '',
        status: saisie.status || 'En Dépôt / Scellé',
        notes: saisie.notes || '',
      });
    }
  }, [saisie, form]);

  const onSubmit = async (values: EditSaisieFormValues) => {
    if (!firestore || !saisie) return;

    setIsSubmitting(true);
    try {
      const [year, month, day] = values.dateSaisie.split('-').map(Number);
      const saisieDate = new Date(year, month - 1, day, 12, 0);

      let agentName = saisie.agentName || '';
      let agentSection = (saisie as any).section || null;
      if (values.agentId && values.agentId !== 'none') {
        const found = agentList.find((a) => a.id === values.agentId);
        if (found) {
          agentName = `${found.rank ? found.rank + ' ' : ''}${found.fullName}`;
          if (found.section) {
            agentSection = found.section;
          }
        }
      }

      const saisieRef = doc(firestore, 'saisies', saisie.id);
      await updateDoc(saisieRef, {
        designation: values.designation.trim(),
        quantity: Number(values.quantity),
        unit: values.unit,
        category: values.category,
        dateSaisie: Timestamp.fromDate(saisieDate),
        location: values.location?.trim() || 'Non spécifié',
        agentId: values.agentId === 'none' ? null : values.agentId,
        agentName: agentName,
        section: agentSection,
        detaineeName: values.detaineeName?.trim() || null,
        pvNumber: values.pvNumber?.trim() || null,
        status: values.status as SaisieStatus,
        notes: values.notes?.trim() || null,
      });

      // Log activity
      await addDoc(collection(firestore, 'activity_logs'), {
        description: `Saisie modifiée: "${values.designation}" (Statut: ${values.status})`,
        timestamp: serverTimestamp(),
        type: 'Général',
      });

      toast({
        title: 'Mise à jour réussie',
        description: `La saisie "${values.designation}" a été mise à jour.`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Erreur de modification de la saisie:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de modifier la saisie.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 text-white border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <PackageCheck className="h-5 w-5 text-amber-400" />
            Modifier / Mettre à jour la Saisie
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Modifiez la désignation, les quantités ou mettez à jour le statut du scellé (ex: Transféré au Parquet).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Designation */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300">Désignation de la Saisie</Label>
            <Input
              className="bg-zinc-950 border-zinc-800 text-white focus:border-amber-500"
              {...form.register('designation')}
            />
          </div>

          {/* Quantité & Unité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Nombre / Quantité</Label>
              <Input
                type="number"
                min={1}
                className="bg-zinc-950 border-zinc-800 text-white focus:border-amber-500"
                {...form.register('quantity')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Unité</Label>
              <Select
                value={form.watch('unit')}
                onValueChange={(val) => form.setValue('unit', val)}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Catégorie & Statut */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Catégorie</Label>
              <Select
                value={form.watch('category')}
                onValueChange={(val) => form.setValue('category', val)}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Statut du Scellé</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(val) => form.setValue('status', val)}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date de Saisie */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300">Date de Saisie</Label>
            <Input
              type="date"
              className="bg-zinc-950 border-zinc-800 text-white focus:border-amber-500"
              {...form.register('dateSaisie')}
            />
          </div>

          {/* Remarques */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300">Remarques / Observations</Label>
            <Textarea
              rows={2}
              className="bg-zinc-950 border-zinc-800 text-white focus:border-amber-500 text-xs"
              {...form.register('notes')}
            />
          </div>

          <DialogFooter className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border-zinc-700 text-xs"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-600 text-white hover:bg-amber-500 font-semibold text-xs gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                'Enregistrer les modifications'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
