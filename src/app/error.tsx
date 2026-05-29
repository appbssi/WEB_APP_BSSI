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
