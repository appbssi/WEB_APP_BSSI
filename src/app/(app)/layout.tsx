
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
import { OfflineBanner } from '@/components/layout/offline-banner';
import { ServiceWorkerRegister } from '@/components/layout/service-worker-register';
import { MissionAutoCloser } from '@/components/layout/mission-auto-closer';
import { UnsignedOrdersGuard } from '@/components/layout/unsigned-orders-guard';
import { AgentWelcome } from '@/components/layout/agent-welcome';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ServiceWorkerRegister />
      <DeviceTracker />
      <NavigationWatcher />
      <MissionAutoCloser />
      <UnsignedOrdersGuard />
      <AgentWelcome />
      <SidebarProvider>
        <Sidebar>
          <SidebarNav />
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-x-hidden w-full max-w-full">
          <OfflineBanner />
          <Header />
          <main className="p-3 sm:p-5 lg:p-8 min-w-0 w-full overflow-x-hidden">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
