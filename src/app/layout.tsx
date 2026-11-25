import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { FirebaseClientProvider } from '@/firebase';
import { LogoProvider } from '@/context/logo-context';
import { DetachementProvider } from '@/context/detachement-context';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

export const metadata: Metadata = {
  title: 'BSSI Portal',
  description: "Système de Brigade Spéciale de Surveillance et d'Intervention",
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'BSSI Portal',
    description: "Système de Brigade Spéciale de Surveillance et d'Intervention",
  },
};

// Téléphones : occupe tout l'écran (encoches, barre de gestes Android) et colore la barre d'état
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#020817' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="h-full">
      <body className="font-body antialiased h-full" suppressHydrationWarning>
        <ThemeProvider>
          <FirebaseErrorListener />
          <FirebaseClientProvider>
            <LogoProvider>
              <DetachementProvider>
                {children}
              </DetachementProvider>
            </LogoProvider>
          </FirebaseClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
