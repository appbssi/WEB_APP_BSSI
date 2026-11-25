'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Download, Loader2, Paperclip } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdfPreview } from '@/components/ordres-signes/view-scan-dialog';
import { useFirestore } from '@/firebase';
import { cn } from '@/lib/utils';

/** Identifiant du document qui contient le fichier joint d'une demande */
export const DEMANDE_ATTACHMENT_DOC_ID = 'piece_jointe';

type AttachmentFile = { name: string; mimeType: string; dataUrl: string };

/**
 * Bouton « Pièce jointe » : le fichier n'est chargé qu'à l'ouverture,
 * pour ne pas alourdir les listes de demandes.
 */
export function DemandeAttachmentButton({
  demandeId,
  name,
  className,
}: {
  demandeId: string;
  name: string;
  className?: string;
}) {
  const firestore = useFirestore();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<AttachmentFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || file || !firestore) return;
    let cancelled = false;
    setError(null);
    getDoc(doc(firestore, 'demandes', demandeId, 'files', DEMANDE_ATTACHMENT_DOC_ID))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) setError('Pièce jointe introuvable.');
        else setFile(snap.data() as AttachmentFile);
      })
      .catch(() => !cancelled && setError("Impossible de charger la pièce jointe."));
    return () => {
      cancelled = true;
    };
  }, [open, file, firestore, demandeId]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn('h-7 gap-1 px-2 text-[11px] font-semibold', className)}
        title={`Voir la pièce jointe : ${name}`}
      >
        <Paperclip className="h-3 w-3" />
        Pièce jointe
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              Pièce jointe
            </DialogTitle>
            <DialogDescription className="truncate">{name}</DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="rounded-md border p-4 text-sm text-destructive">{error}</p>
          ) : !file ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <div className="space-y-3">
              {file.mimeType === 'application/pdf' ? (
                <PdfPreview dataUrl={file.dataUrl} title={file.name} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.dataUrl} alt={file.name} className="mx-auto max-h-[70dvh] rounded border object-contain" />
              )}
              <div className="flex justify-end">
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={file.dataUrl} download={file.name}>
                    <Download className="h-4 w-4" />
                    Télécharger
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
