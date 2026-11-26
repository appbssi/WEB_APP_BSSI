'use client';

import { useEffect, useState } from 'react';
import { collection, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { addDoc, updateDoc } from '@/lib/firestore-fast';
import { useFirestore } from '@/firebase';
import { logActivity } from '@/lib/activity-logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Gavel, Loader2, Store } from 'lucide-react';
import type { Saisie, Vente, VenteType } from '@/lib/types';

export const VENTE_TYPE_LABELS: Record<VenteType, string> = {
  locale: 'Vente en local',
  encheres: 'Vente aux enchères',
};

type FormState = {
  type: VenteType;
  saisieId: string;
  designation: string;
  quantity: string;
  unit: string;
  dateVente: string;
  lieu: string;
  acheteur: string;
  prixDepart: string;
  montant: string;
  reference: string;
  organisateur: string;
  notes: string;
  markSold: boolean;
};

const toDateInput = (ts?: Timestamp) => {
  const d = ts && (ts as any).toDate ? (ts as any).toDate() : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyForm = (type: VenteType): FormState => ({
  type,
  saisieId: 'none',
  designation: '',
  quantity: '1',
  unit: 'Unité(s)',
  dateVente: toDateInput(),
  lieu: '',
  acheteur: '',
  prixDepart: '',
  montant: '',
  reference: '',
  organisateur: '',
  notes: '',
  markSold: true,
});

/** Montant saisi (« 150 000 », « 150000,50 ») → nombre, ou null s'il est vide ou invalide. */
const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

interface VenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vente à modifier ; absente pour une nouvelle vente */
  vente?: Vente | null;
  /** Type proposé pour une nouvelle vente (onglet ouvert) */
  defaultType?: VenteType;
  saisies: Saisie[];
}

export function VenteDialog({ open, onOpenChange, vente, defaultType = 'locale', saisies }: VenteDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm(defaultType));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!vente;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (vente) {
      setForm({
        type: vente.type,
        saisieId: vente.saisieId || 'none',
        designation: vente.designation || '',
        quantity: String(vente.quantity ?? 1),
        unit: vente.unit || 'Unité(s)',
        dateVente: toDateInput(vente.dateVente),
        lieu: vente.lieu || '',
        acheteur: vente.acheteur || '',
        prixDepart: vente.prixDepart != null ? String(vente.prixDepart) : '',
        montant: String(vente.montant ?? ''),
        reference: vente.reference || '',
        organisateur: vente.organisateur || '',
        notes: vente.notes || '',
        markSold: false,
      });
    } else {
      setForm(emptyForm(defaultType));
    }
  }, [open, vente, defaultType]);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Choisir une saisie du registre pré-remplit l'objet, la quantité et l'unité
  const pickSaisie = (id: string) => {
    if (id === 'none') {
      set('saisieId', 'none');
      return;
    }
    const s = saisies.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      saisieId: id,
      designation: s?.designation || f.designation,
      quantity: s ? String(s.quantity ?? 1) : f.quantity,
      unit: s?.unit || f.unit,
    }));
  };

  const isEncheres = form.type === 'encheres';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    const nextErrors: typeof errors = {};
    if (form.designation.trim().length < 2) nextErrors.designation = "Indiquez l'objet vendu.";
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) nextErrors.quantity = 'Quantité invalide.';
    const montant = parseAmount(form.montant);
    if (montant === null) nextErrors.montant = 'Montant obligatoire (en FCFA).';
    if (!form.dateVente) nextErrors.dateVente = 'Date obligatoire.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const [y, m, d] = form.dateVente.split('-').map(Number);
    const data = {
      type: form.type,
      saisieId: form.saisieId === 'none' ? null : form.saisieId,
      designation: form.designation.trim(),
      quantity,
      unit: form.unit.trim() || 'Unité(s)',
      dateVente: Timestamp.fromDate(new Date(y, m - 1, d, 12, 0)),
      lieu: form.lieu.trim() || null,
      acheteur: form.acheteur.trim() || null,
      prixDepart: isEncheres ? parseAmount(form.prixDepart) : null,
      montant: montant as number,
      reference: form.reference.trim() || null,
      organisateur: isEncheres ? form.organisateur.trim() || null : null,
      notes: form.notes.trim() || null,
    };

    setIsSubmitting(true);
    try {
      if (vente) {
        await updateDoc(doc(firestore, 'ventes', vente.id), data);
      } else {
        await addDoc(collection(firestore, 'ventes'), { ...data, createdAt: serverTimestamp() });
      }
      if (form.markSold && data.saisieId) {
        await updateDoc(doc(firestore, 'saisies', data.saisieId), { status: 'Vendu' });
      }
      logActivity(
        firestore,
        `${VENTE_TYPE_LABELS[data.type]} ${isEdit ? 'modifiée' : 'enregistrée'} : « ${data.designation} » pour ${data.montant.toLocaleString('fr-FR')} FCFA`,
        'Général',
        '/ventes'
      );
      toast({
        title: isEdit ? 'Vente mise à jour' : 'Vente enregistrée',
        description: `${VENTE_TYPE_LABELS[data.type]} de « ${data.designation} ».`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la vente:", error);
      toast({ variant: 'destructive', title: 'Erreur', description: "Impossible d'enregistrer la vente." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorText = (field: keyof FormState) =>
    errors[field] ? <p className="text-[11px] font-medium text-rose-500">{errors[field]}</p> : null;

  // Saisies proposées : celles qui ne sont pas détruites ni restituées (et la saisie déjà liée)
  const saisieOptions = saisies.filter(
    (s) => (s.status !== 'Détruit' && s.status !== 'Restitué') || s.id === form.saisieId
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {isEncheres ? <Gavel className="h-5 w-5 text-primary" /> : <Store className="h-5 w-5 text-primary" />}
            {isEdit ? 'Modifier la vente' : 'Enregistrer une vente'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Vente d&apos;un objet saisi, en local ou aux enchères publiques.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Type de vente */}
          <div className="grid grid-cols-2 gap-2">
            {(['locale', 'encheres'] as VenteType[]).map((t) => {
              const Icon = t === 'encheres' ? Gavel : Store;
              const active = form.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('type', t)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {VENTE_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>

          {/* Saisie vendue */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Saisie du registre</Label>
            <Select value={form.saisieId} onValueChange={pickSaisie}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une saisie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune (objet hors registre)</SelectItem>
                {saisieOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.designation} — {s.quantity} {s.unit || 'unité(s)'}
                    {s.missionOrderNumber ? ` · OM ${s.missionOrderNumber}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.saisieId !== 'none' && (
              <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Checkbox checked={form.markSold} onCheckedChange={(v) => set('markSold', v === true)} />
                Passer cette saisie au statut « Vendu »
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem_8rem]">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Objet vendu <span className="text-rose-500">*</span>
              </Label>
              <Input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Ex : Motopompe" />
              {errorText('designation')}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Quantité <span className="text-rose-500">*</span>
              </Label>
              <Input type="number" min={0} step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              {errorText('quantity')}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unité</Label>
              <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Date de la vente <span className="text-rose-500">*</span>
              </Label>
              <Input type="date" value={form.dateVente} onChange={(e) => set('dateVente', e.target.value)} />
              {errorText('dateVente')}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Lieu de la vente</Label>
              <Input value={form.lieu} onChange={(e) => set('lieu', e.target.value)} placeholder="Ex : Magasin BSSI, Abidjan" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isEncheres ? 'Adjudicataire' : 'Acheteur'}</Label>
              <Input
                value={form.acheteur}
                onChange={(e) => set('acheteur', e.target.value)}
                placeholder={isEncheres ? "Nom de l'adjudicataire" : "Nom de l'acheteur"}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{isEncheres ? "N° du PV d'adjudication" : 'N° du PV de vente / quittance'}</Label>
              <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} />
            </div>

            {isEncheres && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mise à prix (FCFA)</Label>
                  <Input inputMode="decimal" value={form.prixDepart} onChange={(e) => set('prixDepart', e.target.value)} placeholder="Ex : 100 000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Commissaire-priseur / organisateur</Label>
                  <Input value={form.organisateur} onChange={(e) => set('organisateur', e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">
                {isEncheres ? "Prix d'adjudication (FCFA)" : 'Prix de vente (FCFA)'} <span className="text-rose-500">*</span>
              </Label>
              <Input inputMode="decimal" value={form.montant} onChange={(e) => set('montant', e.target.value)} placeholder="Ex : 250 000" />
              {errorText('montant')}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observations</Label>
            <Textarea rows={2} className="text-xs" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <DialogFooter className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-xs">
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2 text-xs font-semibold">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement…
                </>
              ) : isEdit ? (
                'Enregistrer les modifications'
              ) : (
                'Enregistrer la vente'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
