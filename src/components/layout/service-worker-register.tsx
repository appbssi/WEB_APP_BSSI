'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const cleanupLegacyCaches = async () => {
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((key) => key === 'sbssi-pwa-cache-v1')
              .map((key) => caches.delete(key))
          );
        } catch (err) {
          console.warn('[sBSSI PWA] Cache cleanup warning:', err);
        }
      }
    };

    const registerSw = () => {
      cleanupLegacyCaches();
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          registration.update().catch(() => {});
        })
        .catch((error) => {
          console.warn('[sBSSI PWA] Service Worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      registerSw();
    } else {
      window.addEventListener('load', registerSw, { once: true });
    }
  }, []);

  return null;
}
