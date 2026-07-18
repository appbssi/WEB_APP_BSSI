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
    
    // Automatically reload the page if it's a chunk load failure or dynamic import failure
    const isChunkError = 
      error?.message?.includes('Loading chunk') || 
      error?.message?.includes('ChunkLoadError') || 
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('missing') ||
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('unexpected token');

    if (isChunkError && typeof window !== 'undefined') {
      // Prevent infinite reloading loop
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('last_chunk_reload', now.toString());
        console.warn('Chunk loading error detected, reloading page...');
        window.location.reload();
      } else {
        console.error('Chunk loading error persists after recent reload. Aborting auto-reload.');
      }
    }
  }, [error]);

  return (
    <div id="error-container" className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 text-center text-white">
      <div id="error-card" className="max-w-md space-y-6 rounded-2xl border border-rose-500/20 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-md">
        <h1 id="error-heading" className="text-3xl font-bold tracking-wider text-rose-500">Une erreur est survenue</h1>
        <p id="error-text" className="text-zinc-400">Une erreur critique a perturbé l'application.</p>
        <div id="error-actions" className="flex justify-center gap-4">
          <button
            id="error-reset-button"
            onClick={() => reset()}
            className="rounded-lg bg-emerald-600 px-6 py-2 font-medium text-white transition-colors duration-200 hover:bg-emerald-500 active:scale-95"
          >
            Réessayer
          </button>
        </div>
      </div>
    </div>
  );
}
