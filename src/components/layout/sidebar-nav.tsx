
'use client';

import {
  LayoutDashboard,
  LucideIcon,
  Rocket,
  Users,
  CalendarClock,
  Loader2,
  BookUser,
  Banknote,
  Lock,
  Sword,
  Truck,
  Map,
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
import { useRole } from '@/hooks/use-role';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { useUser } from '@/firebase';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Array<'admin' | 'observer' | 'secretariat'>;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/demandes', label: 'Mes Demandes', icon: CalendarClock },
  { href: '/cartographie', label: 'Cartographie', icon: Map },
  { href: '/agents', label: 'Agents', icon: Users, roles: ['admin', 'observer'] },
  { href: '/missions', label: 'Missions', icon: Rocket, roles: ['admin', 'observer'] },
  { href: '/gatherings', label: 'Rassemblements', icon: CalendarClock, roles: ['admin', 'observer', 'secretariat'] },
  { href: '/armurerie', label: 'Armurerie', icon: Sword, roles: ['admin'] },
  { href: '/logistique', label: 'Logistique', icon: Truck, roles: ['admin'] },
  { href: '/gav', label: 'GAV', icon: Lock, roles: ['admin', 'secretariat'] },
  { href: '/finance', label: 'Finances', icon: Banknote, roles: ['admin'] },
  { href: '/secretariat', label: 'Secrétariat', icon: BookUser, roles: ['admin', 'secretariat'] },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { logo, isLogoLoading } = useLogo();
  const { role } = useRole();
  const { user } = useUser();
  const isMounted = useIsMounted();
  const [userIdc, setUserIdc] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserIdc((localStorage.getItem('app-user-idc') || '').toUpperCase().trim());
    }
  }, []);
  
  const userName = useMemo(() => {
    if (!role) return 'Utilisateur';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, [role]);


  const filteredNavItems = useMemo(() => {
    const isSpecialIdc = userIdc === 'VUCE1Z' || userIdc === 'CQZSBH';
    if (isSpecialIdc) {
      return navItems.filter(item =>
        ['/dashboard', '/cartographie', '/agents', '/missions', '/logistique', '/gav'].includes(item.href)
      );
    }

    return navItems.filter(item => {
      if (role !== 'admin') {
        return item.href === '/demandes';
      }
      if (!item.roles) return true;
      return role ? item.roles.includes(role) : false;
    });
  }, [role, userIdc]);

  if (!isMounted) {
    return null; 
  }

  return (
    <div className="relative h-full w-full bg-gradient-to-b from-background/95 via-background/90 to-background/95 backdrop-blur-md border-r border-border/40 flex flex-col justify-between">
      {logo && (
          <Image
              src={logo}
              alt="Sidebar background"
              fill
              className="opacity-10 pointer-events-none object-cover"
          />
      )}
      <div className={cn("relative z-10 flex flex-col h-full justify-between", logo ? "" : "")}>
        <div className="flex flex-col flex-1 min-h-0">
          <SidebarHeader className="border-b border-border/40 pb-4 bg-background/40 backdrop-blur-md">
            <div className="flex flex-col items-center w-full pt-6 pb-2 px-4">
                <div className="flex items-center justify-center gap-3 w-full">
                     {isLogoLoading ? (
                          <div className="h-14 w-14 flex items-center justify-center rounded-full bg-primary/5 border border-primary/20">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                      ) : logo ? (
                          <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-transparent border-2 border-primary/30 p-0.5 shadow-lg shadow-primary/10 hover:scale-105 transition-transform duration-300">
                               <Image src={logo} alt="Logo" fill className="object-cover rounded-full" />
                           </div>
                      ) : null}
                     <div className="flex flex-col items-start justify-center">
                       <p className="text-3xl font-extrabold tracking-tight">
                          <span className="text-primary">s</span>
                          <span className="text-foreground">BSSI</span>
                       </p>
                       <span className="text-[9px] font-extrabold tracking-[0.15em] text-muted-foreground uppercase">
                         Forces de Sécurité
                       </span>
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
