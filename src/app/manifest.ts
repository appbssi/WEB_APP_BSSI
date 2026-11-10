import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'sBSSI - Brigade Spéciale',
    short_name: 'sBSSI',
    description: "Système de Brigade Spéciale de Surveillance et d'Intervention - Mode Hors-Ligne",
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0f1d',
    theme_color: '#1a2b4c',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
