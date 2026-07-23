'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
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
import type { Agent, SaisieStatus } from '@/lib/types';

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

const saisieSchema = z.object({
  designation: z.string().min(2, 'La désignation est obligatoire (min 2 caractères)'),
  quantity: z.coerce.number().min(1, 'La quantité doit être supérieure à 0'),
  unit: z.string().default('Unité(s)'),
  category: z.string().min(1, 'Veuillez sélectionner une catégorie'),
  dateSaisie: z.string().min(1, 'La date de saisie est obligatoire'),
  timeSaisie: z.string().default('12:00'),
  location: z.string().optional(),
  agentId: z.string().optional(),
  detaineeName: z.string().optional(),
  pvNumber: z.string().optional(),
  status: z.string().default('En Dépôt / Scellé'),
  notes: z.string().optional(),
});

type SaisieFormValues = z.infer<typeof saisieSchema>;

interface CreateSaisieDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: Agent[];
  currentAgentName?: string;
  currentAgentId?: string;
}

export function CreateSaisieDialog({
  open,
  onOpenChange,
  agents = [],
  currentAgentName = '',
  currentAgentId = '',
}: CreateSaisieDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const agentList = agents || [];

  const todayStr = new Date().toISOString().split('T')[0];
  const nowTimeStr = new Date().toTimeString().slice(0, 5);

  const form = useForm<SaisieFormValues>({
    resolver: zodResolver(saisieSchema),
    defaultValues: {
      designation: '',
      quantity: 1,
      unit: 'Unité(s)',
      category: 'Stupéfiants & Drogues',
      dateSaisie: todayStr,
      timeSaisie: nowTimeStr,
      location: '',
      agentId: currentAgentId || 'none',
      detaineeName: '',
      pvNumber: '',
      status: 'En Dépôt / Scellé',
      notes: '',
    },
  });

  const onSubmit = async (values: SaisieFormValues) => {
    if (!firestore) return;

    setIsSubmitting(true);
    try {
      // Build date timestamp
      const [year, month, day] = values.dateSaisie.split('-').map(Number);
      const [hours, minutes] = (values.timeSaisie || '12:00').split(':').map(Number);
      const saisieDate = new Date(year, month - 1, day, hours || 0, minutes || 0);

      // Resolve agent name and section
      let agentName = currentAgentName;
      let agentSection = null;
      if (values.agentId && values.agentId !== 'none') {
        const found = agentList.find((a) => a.id === values.agentId);
        if (found) {
          agentName = `${found.rank ? found.rank + ' ' : ''}${found.fullName}`;
          agentSection = found.section || null;
        }
      }

      await addDoc(collection(firestore, 'saisies'), {
        designation: values.designation.trim(),
        quantity: Number(values.quantity),
        unit: values.unit,
        category: values.category,
        dateSaisie: Timestamp.fromDate(saisieDate),
        location: values.location?.trim() || 'Non spécifié',
        agentId: values.agentId === 'none' ? null : values.agentId,
        agentName: agentName || 'Agent Non Spécifié',
        section: agentSection,
        detaineeName: values.detaineeName?.trim() || null,
        pvNumber: values.pvNumber?.trim() || null,
        status: values.status as SaisieStatus,
        notes: values.notes?.trim() || null,
        createdAt: serverTimestamp(),
      });

      // Log activity
      await addDoc(collection(firestore, 'activity_logs'), {
        description: `Saisie enregistrée: "${values.designation}" (Qté: ${values.quantity} ${values.unit}) par ${agentName || 'l\'agent'}`,
        timestamp: serverTimestamp(),
        type: 'Général',
      });

      toast({
        title: 'Saisie enregistrée',
        description: `L'objet "${values.designation}" a été enregistré dans le registre des saisies.`,
      });

      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur lors de la création de la saisie:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible d\'enregistrer la saisie. Veuillez réessayer.',
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
            <PackageCheck className="h-5 w-5 text-emerald-400" />
            Enregistrer une Saisie / Scellé
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Renseignez les détails de la marchandise, matériel ou objet saisi lors d'une opération ou fouille.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Designation */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300">
              Désignation de la Saisie <span className="text-rose-400">*</span>
            </Label>
            <Input
              placeholder="Ex: Sacs de cannabis, Arme blanche, Billets de banque d'origine suspecte..."
              className="bg-zinc-950 border-zinc-800 text-white placeholder-zinc-500 focus:border-emerald-500"
              {...form.register('designation')}
            />
            {form.formState.errors.designation && (
              <p className="text-[11px] text-rose-400 font-medium">
                {form.formState.errors.designation.message}
              </p>
            )}
          </div>

          {/* Quantité & Unité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                Nombre / Quantité Saisie <span className="text-rose-400">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                className="bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                {...form.register('quantity')}
              />
              {form.formState.errors.quantity && (
                <p className="text-[11px] text-rose-400 font-medium">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Unité de mesure</Label>
              <Select
                value={form.watch('unit')}
                onValueChange={(val) => form.setValue('unit', val)}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue placeholder="Sélectionner l'unité" />
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
              <Label className="text-xs font-semibold text-zinc-300">
                Catégorie <span className="text-rose-400">*</span>
              </Label>
              <Select
                value={form.watch('category')}
                onValueChange={(val) => form.setValue('category', val)}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue placeholder="Sélectionner la catégorie" />
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
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectValue placeholder="Statut actuel" />
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

          {/* Date & Heure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">
                Date de Saisie <span className="text-rose-400">*</span>
              </Label>
              <Input
                type="date"
                className="bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                {...form.register('dateSaisie')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-300">Heure de Saisie</Label>
              <Input
                type="time"
                className="bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500"
                {...form.register('timeSaisie')}
              />
            </div>
          </div>

          {/* Remarques */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-300">Remarques / Observations</Label>
            <Textarea
              placeholder="Spécifications, état du matériel, numéro de conteneur, coffre de stockage..."
              rows={2}
              className="bg-zinc-950 border-zinc-800 text-white placeholder-zinc-500 focus:border-emerald-500 text-xs"
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
              className="bg-emerald-600 text-white hover:bg-emerald-500 font-semibold text-xs gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer la Saisie'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
