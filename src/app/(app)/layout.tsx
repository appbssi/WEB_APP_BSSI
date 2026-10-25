
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
        <SidebarInset className="min-w-0 overflow-x-hidden w-full max-w-full">
          <Header />
          <main className="p-3 sm:p-5 lg:p-8 min-w-0 w-full overflow-x-hidden">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
