
'use client';

import {
  LayoutDashboard,
  LucideIcon,
  Rocket,
  Users,
  CalendarClock,
  Loader2,
  BookUser,
  Lock,
  Sword,
  Truck,
  Map,
  PackageCheck,
  Radar,
  ScanSearch,
  FileSignature,
  Gavel,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { useLogo } from '@/context/logo-context';
import Image from 'next/image';
import { useRole, canAccessRoute } from '@/hooks/use-role';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useUser } from '@/firebase';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/demandes', label: 'Mon Espace Agent', icon: CalendarClock },
  { href: '/cartographie', label: 'Cartographie', icon: Map },
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/missions', label: 'Missions', icon: Rocket },
  { href: '/ordres-signes', label: 'Ordres signés', icon: FileSignature },
  { href: '/gatherings', label: 'Rassemblements', icon: CalendarClock },
  { href: '/armurerie', label: 'Armurerie', icon: Sword },
  { href: '/logistique', label: 'Logistique', icon: Truck },
  { href: '/gav', label: 'GAV', icon: Lock },
  { href: '/saisies', label: 'Saisies', icon: PackageCheck },
  { href: '/ventes', label: 'Ventes', icon: Gavel },
  { href: '/informations', label: 'Informations', icon: Radar },
  { href: '/renseignements', label: 'Renseignements', icon: ScanSearch },
  { href: '/secretariat', label: 'Secrétariat', icon: BookUser },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { logo, isLogoLoading } = useLogo();
  const { role, isRoleLoading, restricted } = useRole();
  const { user } = useUser();
  const isMounted = useIsMounted();

  const filteredNavItems = useMemo(() => {
    if (isRoleLoading) return [];
    return navItems.filter((item) => canAccessRoute(role, restricted, item.href));
  }, [role, restricted, isRoleLoading]);

  if (!isMounted) {
    return null; 
  }

  return (
    <div className="relative h-full w-full bg-gradient-to-b from-card/95 via-background to-card/90 dark:from-slate-950 dark:via-background dark:to-slate-900/90 backdrop-blur-xl border-r border-border/50 flex flex-col justify-between shadow-sm">
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="flex flex-col flex-1 min-h-0">
          <SidebarHeader className="border-b border-border/40 pb-4 bg-muted/20 dark:bg-slate-900/40 backdrop-blur-md">
            <div className="flex flex-col items-center w-full pt-6 pb-2 px-4">
                <div className="flex items-center justify-center gap-3 w-full">
                     {isLogoLoading ? (
                          <div className="h-14 w-14 flex items-center justify-center rounded-full bg-primary/5 border border-primary/20">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                      ) : logo ? (
                          <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-transparent border-2 border-primary/30 p-0.5 shadow-lg shadow-primary/10 hover:scale-105 transition-transform duration-300"
                               ><Image
  src="https://i.ibb.co/v4p7NtMh/dd.png"
  alt="Logo"
  fill
  className="object-cover rounded-full"
/>
                           </div>
                      ) : null}
                     <div className="flex flex-col items-start justify-center">
                       <p className="text-3xl font-extrabold tracking-tight">
                          <span className="text-primary">s</span>
                          <span className="text-foreground">BSSI</span>
                       </p>
                     </div>
                </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-4 overflow-y-auto scrollbar-hover">
                <SidebarMenu className="space-y-1.5">
                {filteredNavItems.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <SidebarMenuItem key={item.href}>
                        <Link href={item.href} className="w-full block">
                            <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.label}
                            className={cn(
                              "relative inline-flex items-center w-full h-11 text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer rounded-xl px-4 py-2.5 gap-3",
                              isActive 
                                ? "bg-primary/10 text-primary border-l-4 border-l-primary shadow-sm shadow-primary/5 font-bold pl-3" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:translate-x-1.5"
                            )}
                            >
                            <item.icon className={cn(
                              "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                              isActive ? "text-primary scale-105" : "text-muted-foreground"
                            )} />
                            <span>{item.label}</span>
                            {isActive && (
                              <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                            )}
                            </SidebarMenuButton>
                        </Link>
                        </SidebarMenuItem>
                    );
                })}
                </SidebarMenu>
          </SidebarContent>
        </div>
        
        <SidebarFooter className="border-t border-border/40 p-4 bg-background/20 backdrop-blur-sm mt-auto">
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-muted/40 border border-border/30">
            <div className="relative w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0 shadow-inner">
              {role ? role.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-foreground truncate">
                {role === 'admin' ? 'Administrateur' : role === 'secretariat' ? 'Secrétariat' : role === 'observer' ? 'Observateur' : 'Agent sBSSI'}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium truncate">
                {user?.email || 'Service connecté'}
              </span>
            </div>
          </div>
        </SidebarFooter>
      </div>
    </div>
  );
}
