'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div id="not-found-container" className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 text-center text-white">
      <div id="not-found-card" className="max-w-md space-y-6 rounded-2xl border border-emerald-500/20 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-md">
        <h1 id="not-found-heading" className="text-6xl font-bold tracking-wider text-emerald-500">404</h1>
        <p id="not-found-text" className="text-zinc-400 text-lg">La page que vous recherchez n'existe pas ou vous n'avez pas les autorisations nécessaires.</p>
        <div id="not-found-actions">
          <Link
            id="not-found-home-link"
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors duration-200 hover:bg-emerald-500 active:scale-95"
          >
            Retourner à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
