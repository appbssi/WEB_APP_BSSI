'use client';

import { useState } from 'react';
import { Eye, FileSignature, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ViewScanDialog } from '@/components/ordres-signes/view-scan-dialog';
import type { SignedOrder } from '@/lib/signed-orders';

interface AgentSignedOrdersProps {
  orders: SignedOrder[];
  isLoading: boolean;
}

const fmt = (ts?: { toDate?: () => Date } | null) => ts?.toDate?.().toLocaleDateString('fr-FR') ?? '—';

/**
 * Espace Agent : ordres de mission SIGNÉS reçus par l'agent.
 * Seuls les ordres signés et archivés lui sont transmis (règles Firestore), pour les missions où il est désigné.
 */
export function AgentSignedOrders({ orders, isLoading }: AgentSignedOrdersProps) {
  const [viewing, setViewing] = useState<SignedOrder | null>(null);
  const sorted = [...orders].sort((a, b) => (b.archivedAt?.toMillis?.() ?? 0) - (a.archivedAt?.toMillis?.() ?? 0));

  return (
    <Card className="border border-border rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-primary" />
          Mes ordres de mission signés ({orders.length})
        </CardTitle>
        <CardDescription>
          Un ordre de mission vous est transmis uniquement après sa signature par le commandement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun ordre de mission signé pour le moment.</p>
        ) : (
          sorted.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{o.missionName}</p>
                <p className="text-xs text-muted-foreground">
                  Signé le {fmt(o.signedOn)}
                  {o.signatory ? ` par ${o.signatory}` : ''} · {o.fileCount ?? 0} page(s)
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setViewing(o)}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Voir / télécharger
              </Button>
            </div>
          ))
        )}
      </CardContent>
      <ViewScanDialog order={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </Card>
  );
}
