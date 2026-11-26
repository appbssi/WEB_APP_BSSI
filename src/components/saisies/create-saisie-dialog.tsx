'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { addDoc } from '@/lib/firestore-fast';
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
import { SaisieProcedureFields, cleanNames, qualiteFromForm } from './saisie-procedure-fields';

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
  'Gardien de Saisie',
  'Vendu',
];

const saisieSchema = z.object({
  designation: z.string().min(2, 'La désignation est obligatoire (min 2 caractères)'),
  quantity: z.coerce.number().min(1, 'La quantité doit être supérieure à 0'),
  unit: z.string().default('Unité(s)'),
  category: z.string().default('Autre'),
  dateSaisie: z.string().min(1, 'La date de saisie est obligatoire'),
  timeSaisie: z.string().default('12:00'),
  location: z.string().optional(),
  agentId: z.string().optional(),
  agentQualite: z.string().optional(),
  missionOrderNumber: z.string().optional(),
  services: z.array(z.string()).default([]),
  contrevenants: z.array(z.string()).default([]),
  interpelles: z.array(z.string()).default([]),
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
      agentQualite: '',
      missionOrderNumber: '',
      services: [],
      contrevenants: [],
      interpelles: [],
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
        agentQualite: qualiteFromForm(values.agentQualite),
        missionOrderNumber: values.missionOrderNumber?.trim() || null,
        services: cleanNames(values.services),
        contrevenants: cleanNames(values.contrevenants),
        interpelles: cleanNames(values.interpelles),
        // Ancien champ, gardé lisible pour les écrans qui n'affichent qu'un nom
        detaineeName: cleanNames(values.contrevenants).join(', ') || null,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <PackageCheck className="h-5 w-5 text-emerald-400" />
            Enregistrer une Saisie / Scellé
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Renseignez les détails de la marchandise, matériel ou objet saisi lors d'une opération ou fouille.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Procédure : OPJ/APJ, ordre de mission, contrevenant, interpellation */}
          <SaisieProcedureFields
            agents={agentList}
            focusClass="focus:border-emerald-500"
            values={{
              agentId: form.watch('agentId') || 'none',
              agentQualite: (form.watch('agentQualite') || '') as '' | 'OPJ' | 'APJ',
              missionOrderNumber: form.watch('missionOrderNumber') || '',
              services: form.watch('services') || [],
              contrevenants: form.watch('contrevenants') || [],
              interpelles: form.watch('interpelles') || [],
            }}
            onChange={(field, value) => form.setValue(field, value)}
            onListChange={(field, list) => form.setValue(field, list)}
          />

          {/* Designation */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Saisies <span className="text-rose-400">*</span>
            </Label>
            <Input
              placeholder="Ex: Sacs de cannabis, Arme blanche, Billets de banque d'origine suspecte..."
              className="focus:border-emerald-500"
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
              <Label className="text-xs font-semibold">
                Nombre / Quantité Saisie <span className="text-rose-400">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                className="focus:border-emerald-500"
                {...form.register('quantity')}
              />
              {form.formState.errors.quantity && (
                <p className="text-[11px] text-rose-400 font-medium">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unité de mesure</Label>
              <Select
                value={form.watch('unit')}
                onValueChange={(val) => form.setValue('unit', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner l'unité" />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Statut du Scellé */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Statut du Scellé</Label>
            <Select
              value={form.watch('status')}
              onValueChange={(val) => form.setValue('status', val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Statut actuel" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Heure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Date de Saisie <span className="text-rose-400">*</span>
              </Label>
              <Input
                type="date"
                className="focus:border-emerald-500"
                {...form.register('dateSaisie')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Heure de Saisie</Label>
              <Input
                type="time"
                className="focus:border-emerald-500"
                {...form.register('timeSaisie')}
              />
            </div>
          </div>

          {/* Remarques */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Remarques / Observations</Label>
            <Textarea
              placeholder="Spécifications, état du matériel, numéro de conteneur, coffre de stockage..."
              rows={2}
              className="focus:border-emerald-500 text-xs"
              {...form.register('notes')}
            />
          </div>

          <DialogFooter className="pt-3 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover: text-xs"
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
