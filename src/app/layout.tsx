import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthGuard } from '@/components/layout/auth-guard';
import { FirebaseClientProvider } from '@/firebase';
import { LogoProvider } from '@/context/logo-context';
import { ThemeProvider } from '@/components/layout/theme-provider';

export const metadata: Metadata = {
  title: 'sBSSI',
  description: 'Système de gestion des agents et des missions.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="h-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var rawFetch = window.fetch;
                  var _fetch = rawFetch;
                  try {
                    delete window.fetch;
                  } catch(e) {}
                  try {
                    Object.defineProperty(window, "fetch", {
                      configurable: true,
                      enumerable: true,
                      get: function() { return _fetch; },
                      set: function(v) { _fetch = v; }
                    });
                  } catch (e1) {
                    try {
                      var proto = Object.getPrototypeOf(window);
                      if (proto) {
                        Object.defineProperty(proto, "fetch", {
                          configurable: true,
                          enumerable: true,
                          get: function() { return _fetch; },
                          set: function(v) { _fetch = v; }
                        });
                      }
                    } catch (e2) {
                      try {
                        globalThis.fetch = _fetch;
                      } catch (e3) {}
                    }
                  }
                } catch (e) {
                  console.warn("Fetch fallback patch skipped:", e);
                }
              })();
            `
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased h-full" suppressHydrationWarning>
        <ThemeProvider>
          <FirebaseClientProvider>
            <AuthGuard>
              <LogoProvider>
                {children}
              </LogoProvider>
            </AuthGuard>
          </FirebaseClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
