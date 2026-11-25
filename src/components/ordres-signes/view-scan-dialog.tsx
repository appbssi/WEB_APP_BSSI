'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDocs, orderBy, query } from 'firebase/firestore';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFirestore } from '@/firebase';
import type { SignedOrder, SignedOrderFile } from '@/lib/signed-orders';

interface ViewScanDialogProps {
  order: SignedOrder | null;
  onOpenChange: (open: boolean) => void;
}

const fmt = (ts?: { toDate?: () => Date } | null, withTime = false) => {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return withTime
    ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : d.toLocaleDateString('fr-FR');
};

/** Aperçu PDF via une URL blob: (la CSP du site interdit <object>, et Chrome bloque les PDF en data:). */
export function PdfPreview({ dataUrl, title }: { dataUrl: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dataUrl]);
  return url ? (
    <iframe src={url} title={title} className="h-[70dvh] w-full rounded border" />
  ) : (
    <p className="rounded border p-4 text-sm text-muted-foreground">Aperçu PDF indisponible : utilisez « Télécharger ».</p>
  );
}

/** Consultation des pages scannées d'un ordre signé (chargées à l'ouverture seulement). */
export function ViewScanDialog({ order, onOpenChange }: ViewScanDialogProps) {
  const firestore = useFirestore();
  const [files, setFiles] = useState<SignedOrderFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore || !order) return;
    let cancelled = false;
    setFiles(null);
    setError(null);
    getDocs(query(collection(doc(firestore, 'signed_orders', order.id), 'files'), orderBy('index')))
      .then((snap) => {
        if (!cancelled) setFiles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SignedOrderFile, 'id'>) })));
      })
      .catch(() => !cancelled && setError('Impossible de charger le scan.'));
    return () => {
      cancelled = true;
    };
  }, [firestore, order]);

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Ordre signé — {order.missionName}</DialogTitle>
              <DialogDescription>
                Signé le {fmt(order.signedOn)}
                {order.signatory ? ` par ${order.signatory}` : ''} · archivé le {fmt(order.archivedAt, true)}
              </DialogDescription>
            </DialogHeader>
            {order.notes && <p className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{order.notes}</p>}

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : !files ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((f, i) => (
                  <figure key={f.id} className="space-y-1.5">
                    <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Page {i + 1} — {f.name}</span>
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <a href={f.dataUrl} download={`${order.missionName.replace(/\s+/g, '_')}_page${i + 1}${f.mimeType === 'application/pdf' ? '.pdf' : '.jpg'}`}>
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
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
