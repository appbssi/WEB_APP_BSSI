
import { Header } from '@/components/layout/header';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { FirebaseClientProvider } from '@/firebase';
import { AuthGuard } from '@/components/layout/auth-guard';
import { LogoProvider } from '@/context/logo-context';
import Loading from './loading';


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <AuthGuard>
        <LogoProvider>
          <SidebarProvider>
            <Sidebar>
              <SidebarNav />
            </Sidebar>
            <SidebarInset>
              <Header />
              <main className="p-4 sm:p-6 lg:p-8">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </LogoProvider>
      </AuthGuard>
    </FirebaseClientProvider>
  );
}
