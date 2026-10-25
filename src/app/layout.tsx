import type {Metadata} from 'next';
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
  openGraph: {
    title: 'BSSI Portal',
    description: "Système de Brigade Spéciale de Surveillance et d'Intervention",
  },
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
