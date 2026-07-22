
import { Header } from '@/components/layout/header';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { AuthGuard } from '@/components/layout/auth-guard';
import { DeviceTracker } from '@/components/layout/device-tracker';
import { NavigationWatcher } from '@/components/layout/navigation-watcher';


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DeviceTracker />
      <NavigationWatcher />
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
    </AuthGuard>
  );
}
