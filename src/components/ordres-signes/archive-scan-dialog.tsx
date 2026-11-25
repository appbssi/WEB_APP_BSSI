'use client';

import { useRef, useState } from 'react';
import { collection, deleteField, doc, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import { FileText, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-logger';
import { MAX_SCAN_FILES, prepareScanFile, type SignedOrder, type SignedOrderFile } from '@/lib/signed-orders';

type PreparedFile = Omit<SignedOrderFile, 'id' | 'index'>;

interface ArchiveScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfDocId: string;
  missionId: string | null;
  missionName: string;
  /** Agents désignés par la mission : eux seuls recevront l'ordre signé */
  agentIds: string[];
  /** Archive existante : le dépôt remplace ses fichiers */
  existing?: SignedOrder | null;
}

const todayInput = () => new Date().toISOString().slice(0, 10);

export function ArchiveScanDialog({ open, onOpenChange, pdfDocId, missionId, missionName, agentIds, existing }: ArchiveScanDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [signedOn, setSignedOn] = useState(todayInput());
  const [signatory, setSignatory] = useState(existing?.signatory ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    if (files.length + list.length > MAX_SCAN_FILES) {
      setError(`${MAX_SCAN_FILES} pages maximum par ordre de mission.`);
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
    if (!firestore || files.length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      const orderRef = doc(firestore, 'signed_orders', pdfDocId);
      const filesCol = collection(orderRef, 'files');

      // Remplacement : on retire d'abord les anciennes pages
      if (existing) {
        const old = await getDocs(filesCol);
        if (!old.empty) {
          const del = writeBatch(firestore);
          old.forEach((d) => del.delete(d.ref));
          await del.commit();
        }
      }

      const batch = writeBatch(firestore);
      files.forEach((f, index) => batch.set(doc(filesCol, String(index + 1).padStart(2, '0')), { ...f, index }));
      batch.set(
        orderRef,
        {
          pdfDocId,
          missionId,
          missionName,
          status: 'archive',
          signedOn: signedOn ? Timestamp.fromDate(new Date(`${signedOn}T12:00:00`)) : null,
          signatory: signatory.trim(),
          notes: notes.trim(),
          archivedAt: Timestamp.now(),
          // Aucun IDC enregistré ici : ce document est lisible par les agents
          archivedBy: deleteField(),
          printedBy: deleteField(),
          fileCount: files.length,
          // Envoi de l'ordre signé : visible dans l'Espace Agent des seuls agents de la mission
          agentIds,
        },
        { merge: true },
      );
      await batch.commit();

      toast({
        title: 'Ordre signé archivé et envoyé',
        description: `${missionName} — ${files.length} page(s), transmis aux agents de la mission.`,
      });
      logActivity(firestore, `Ordre de mission signé archivé : ${missionName} (${files.length} page(s))`, 'Mission', '/ordres-signes');
      setFiles([]);
      onOpenChange(false);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === 'permission-denied'
          ? "Vous n'avez pas les droits pour archiver cet ordre."
          : "L'archivage a échoué. Vérifiez la connexion et réessayez.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFiles([]);
        onOpenChange(o);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{existing ? 'Remplacer le scan signé' : 'Archiver l’ordre signé'}</DialogTitle>
          <DialogDescription>
            {missionName} — déposez le scan ou la photo de chaque page de l’ordre signé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label>Pages scannées <span className="text-destructive">*</span></Label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handlePick(e.target.files)}
            />
            <Button type="button" variant="outline" className="w-full" disabled={isPreparing || isSaving} onClick={() => inputRef.current?.click()}>
              {isPreparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isPreparing ? 'Préparation…' : 'Choisir les fichiers (images ou PDF)'}
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
                      <img src={f.dataUrl} alt="" className="h-10 w-8 rounded object-cover border" />
                    ) : (
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">Page {i + 1} — {f.name}</span>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="signed-on">Date de signature</Label>
              <Input id="signed-on" type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signatory">Signataire</Label>
              <Input id="signatory" placeholder="Ex : Chef de détachement" value={signatory} onChange={(e) => setSignatory(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observations</Label>
            <Textarea id="notes" className="min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">{error}</p>}
          {existing && <p className="text-xs text-muted-foreground">Les pages déjà archivées seront remplacées par celles-ci.</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={isSaving} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={isSaving || isPreparing || files.length === 0} onClick={handleSave}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archiver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
