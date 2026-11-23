'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);

    const msg = error?.message || '';
    const isChunkError =
      msg.includes('Loading chunk') ||
      msg.includes('ChunkLoadError') ||
      error?.name === 'ChunkLoadError' ||
      msg.includes('missing') ||
      msg.includes('Failed to fetch') ||
      msg.includes('unexpected token') ||
      msg.includes('Unexpected token');

    if (isChunkError && typeof window !== 'undefined') {
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('last_chunk_reload', now.toString());
        console.warn('Chunk loading error detected, clearing caches and reloading page...');
        const purgeAndReload = async () => {
          try {
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            }
          } catch {
            // ignore cache clear failures
          }
          window.location.reload();
        };
        purgeAndReload();
      } else {
        console.error('Chunk loading error persists after recent reload. Aborting auto-reload.');
      }
    }
  }, [error]);

  const handleHardReload = async () => {
    if (typeof window !== 'undefined') {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        sessionStorage.removeItem('last_chunk_reload');
      } catch {
        // ignore
      }
      window.location.reload();
    }
  };

  return (
    <div id="error-container" className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center text-foreground">
      <div id="error-card" className="max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <h1 id="error-heading" className="text-2xl font-bold tracking-tight text-destructive">
          Une erreur est survenue
        </h1>
        <p id="error-text" className="text-sm text-muted-foreground">
          Le chargement d&apos;un module a été interrompu. Rechargez l&apos;application pour actualiser les ressources.
        </p>
        <div id="error-actions" className="flex flex-wrap justify-center gap-3">
          <button
            id="error-reset-button"
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-border bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={handleHardReload}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
          >
            Recharger la page
          </button>
        </div>
      </div>
    </div>
  );
}
