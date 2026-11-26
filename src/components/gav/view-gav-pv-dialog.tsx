'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import { PdfPreview } from '@/components/ordres-signes/view-scan-dialog';
import type { SignedOrderFile } from '@/lib/signed-orders';
import type { GavPv } from '@/lib/types';

interface ViewGavPvDialogProps {
  /** Identifiant du PV à afficher (collection gav_pvs) */
  pvId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Consultation d'un PV de déferrement : informations, personnes concernées et pages scannées. */
export function ViewGavPvDialog({ pvId, onOpenChange }: ViewGavPvDialogProps) {
  const firestore = useFirestore();
  const [pv, setPv] = useState<GavPv | null>(null);
  const [files, setFiles] = useState<SignedOrderFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !pvId) return;
    let cancelled = false;
    setPv(null);
    setFiles(null);
    setError(null);
    const pvRef = doc(firestore, 'gav_pvs', pvId);
    Promise.all([getDoc(pvRef), getDocs(query(collection(pvRef, 'files'), orderBy('index')))])
      .then(([pvSnap, filesSnap]) => {
        if (cancelled) return;
        if (!pvSnap.exists()) {
          setError('Ce PV est introuvable.');
          return;
        }
        setPv({ id: pvSnap.id, ...(pvSnap.data() as Omit<GavPv, 'id'>) });
        setFiles(filesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SignedOrderFile, 'id'>) })));
      })
      .catch(() => !cancelled && setError('Impossible de charger le PV.'));
    return () => {
      cancelled = true;
    };
  }, [firestore, pvId]);

  const safeName = (pv?.numero || 'PV').replace(/[^\w-]+/g, '_');

  return (
    <Dialog open={!!pvId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{pv ? `PV n° ${pv.numero}` : 'Procès-verbal'}</DialogTitle>
          {pv && (
            <DialogDescription>
              Déferrement du {pv.defereAt.toDate().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} —{' '}
              {pv.parquet}
            </DialogDescription>
          )}
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !pv || !files ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                Personne{pv.detaineeNames.length > 1 ? 's' : ''} déférée{pv.detaineeNames.length > 1 ? 's' : ''} (
                {pv.detaineeNames.length})
              </p>
              <ul className="list-inside list-disc">
                {pv.detaineeNames.map((n, i) => (
                  <li key={i} className="font-medium">
                    {n}
                  </li>
                ))}
              </ul>
              {pv.observation && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{pv.observation}</p>}
            </div>

            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune page enregistrée pour ce PV.</p>
            ) : (
              files.map((f, i) => (
                <figure key={f.id} className="space-y-1.5">
                  <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {i + 1} — {f.name}
                    </span>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <a href={f.dataUrl} download={`${safeName}_page${i + 1}${f.mimeType === 'application/pdf' ? '.pdf' : '.jpg'}`}>
                        <Download className="mr-1 h-3.5 w-3.5" /> Télécharger
                      </a>
                    </Button>
                  </figcaption>
                  {f.mimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.dataUrl} alt={`Page ${i + 1}`} className="w-full rounded border bg-white" />
                  ) : (
                    <PdfPreview dataUrl={f.dataUrl} title={`Page ${i + 1}`} />
                  )}
                </figure>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
