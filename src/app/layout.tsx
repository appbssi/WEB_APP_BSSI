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
