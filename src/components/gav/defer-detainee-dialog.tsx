'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { writeBatch } from '@/lib/firestore-fast';
import { useFirestore } from '@/firebase';
import { logActivity } from '@/lib/activity-logger';
import { useToast } from '@/hooks/use-toast';
import { MAX_SCAN_FILES, prepareScanFile, type SignedOrderFile } from '@/lib/signed-orders';
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
import { FileText, Loader2, Scale, Upload, X } from 'lucide-react';
import type { Detainee } from '@/lib/types';

type PreparedFile = Omit<SignedOrderFile, 'id' | 'index'>;

const pad = (n: number) => String(n).padStart(2, '0');
export const detaineeFullName = (d: Pick<Detainee, 'lastName' | 'firstName'>) =>
  `${d.lastName.toUpperCase()} ${d.firstName}`;

/** Pages écrites par lot : chaque page fait jusqu'à ~1 Mo, une requête Firestore est limitée à 10 Mo. */
const FILES_PER_BATCH = 5;

interface DeferDetaineeDialogProps {
  /** Personne(s) à déférer ; la fenêtre est ouverte quand la liste n'est pas vide */
  detainees: Detainee[];
  onOpenChange: (open: boolean) => void;
  /** Appelé après un enregistrement réussi (ex. vider la sélection) */
  onDone?: () => void;
}

/**
 * Déferrement d'une ou plusieurs personnes en GAV, avec le PV rédigé pour elles :
 * n° du PV, pages scannées, date et heure, parquet. Un seul PV couvre toutes les personnes choisies.
 */
export function DeferDetaineeDialog({ detainees, onOpenChange, onDone }: DeferDetaineeDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pvNumero, setPvNumero] = useState('');
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [parquet, setParquet] = useState('');
  const [observation, setObservation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const open = detainees.length > 0;
  const single = detainees.length === 1 ? detainees[0] : null;
  const openKey = detainees.map((d) => d.id).join(',');

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setPvNumero('');
    setFiles([]);
    setParquet('');
    setObservation('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const handlePick = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    if (files.length + list.length > MAX_SCAN_FILES) {
      setError(`${MAX_SCAN_FILES} pages maximum par PV.`);
      return;
    }
    setIsPreparing(true);
    try {
      const prepared: PreparedFile[] = [];
      for (const f of Array.from(list)) prepared.push(await prepareScanFile(f));
      setFiles((cur) => [...cur, ...prepared]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier refusé.');
    } finally {
      setIsPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!firestore || !open) return;
    if (pvNumero.trim().length < 1) {
      setError('Indiquez le numéro du PV.');
      return;
    }
    if (files.length === 0) {
      setError('Ajoutez le scan ou la photo du PV.');
      return;
    }
    if (!date || !time) {
      setError('Indiquez la date et l’heure du déferrement.');
      return;
    }
    if (parquet.trim().length < 2) {
      setError('Indiquez le parquet ou la juridiction.');
      return;
    }
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const defereAt = new Date(y, m - 1, d, h, min);
    const tooEarly = detainees.filter((p) => defereAt.getTime() < p.entryTime.toMillis());
    if (tooEarly.length > 0) {
      setError(`Le déferrement ne peut pas précéder l'entrée en GAV (${tooEarly.map(detaineeFullName).join(', ')}).`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const pvRef = doc(collection(firestore, 'gav_pvs'));
      const filesCol = collection(pvRef, 'files');
      const numero = pvNumero.trim();
      const defereTs = Timestamp.fromDate(defereAt);

      // 1. Pages du PV, par petits lots
      for (let i = 0; i < files.length; i += FILES_PER_BATCH) {
        const batch = writeBatch(firestore);
        files.slice(i, i + FILES_PER_BATCH).forEach((f, j) => {
          const index = i + j;
          batch.set(doc(filesCol, String(index + 1).padStart(2, '0')), { ...f, index });
        });
        await batch.commit();
      }

      // 2. Le PV et le statut de chaque personne, ensemble
      const batch = writeBatch(firestore);
      batch.set(pvRef, {
        numero,
        defereAt: defereTs,
        parquet: parquet.trim(),
        observation: observation.trim() || null,
        detaineeIds: detainees.map((p) => p.id),
        detaineeNames: detainees.map(detaineeFullName),
        fileCount: files.length,
        createdAt: serverTimestamp(),
      });
      detainees.forEach((p) =>
        batch.update(doc(firestore, 'detainees', p.id), {
          statut: 'defere',
          defereAt: defereTs,
          defereParquet: parquet.trim(),
          defereObservation: observation.trim() || null,
          pvId: pvRef.id,
          pvNumero: numero,
        })
      );
      await batch.commit();

      const names = detainees.map(detaineeFullName).join(', ');
      logActivity(firestore, `GAV : PV n° ${numero} — ${names} déféré(s) au ${parquet.trim()}`, 'GAV', '/gav');
      toast({
        title: detainees.length > 1 ? `${detainees.length} personnes déférées` : 'Personne déférée',
        description: `PV n° ${numero} enregistré (${files.length} page${files.length > 1 ? 's' : ''}).`,
      });
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      console.error('Erreur lors du déferrement:', e);
      const code = (e as { code?: string })?.code;
      setError(
        code === 'permission-denied'
          ? "Vous n'avez pas les droits pour enregistrer ce PV."
          : "L'enregistrement a échoué. Vérifiez la connexion et réessayez."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            {detainees.length > 1 ? `Déférer ${detainees.length} personnes` : 'Déférer au parquet'}
          </DialogTitle>
          <DialogDescription>
            {single
              ? `${detaineeFullName(single)} — interpellé(e) le ${single.entryTime
                  .toDate()
                  .toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
              : 'Un seul PV est enregistré pour toutes les personnes sélectionnées.'}
          </DialogDescription>
        </DialogHeader>

        {detainees.length > 1 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
            {detainees.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="font-medium">{detaineeFullName(p)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.entryTime.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-4 text-sm">
          {/* PV rédigé */}
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Procès-verbal</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">N° du PV *</Label>
              <Input placeholder="Ex : PV n° 112/BSSI/2026" value={pvNumero} onChange={(e) => setPvNumero(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Scan du PV *</Label>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handlePick(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isPreparing || isSaving}
                onClick={() => inputRef.current?.click()}
              >
                {isPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {isPreparing ? 'Préparation…' : 'Ajouter les pages (images ou PDF)'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Images compressées automatiquement. PDF : 700 Ko maximum par fichier. {MAX_SCAN_FILES} pages maximum.
              </p>
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border p-2">
                      {f.mimeType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.dataUrl} alt="" className="h-10 w-8 rounded border object-cover" />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">
                        Page {i + 1} — {f.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Retirer la page ${i + 1}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date du déferrement *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Heure *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Parquet / juridiction *</Label>
            <Input
              placeholder="Ex : Parquet du Tribunal de Première Instance d'Abidjan-Plateau"
              value={parquet}
              onChange={(e) => setParquet(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observation</Label>
            <Textarea
              rows={2}
              className="resize-none text-sm"
              placeholder="Escorte, suite donnée…"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isPreparing}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {detainees.length > 1 ? `Déférer les ${detainees.length}` : 'Déférer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
