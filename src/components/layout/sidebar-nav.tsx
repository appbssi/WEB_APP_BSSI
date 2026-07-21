
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
    <div className="relative h-full w-full">
      {logo && (
          <Image
              src={logo}
              alt="Sidebar background"
              fill
              className="opacity-10 pointer-events-none object-cover"
          />
      )}
      <div className={cn("relative z-10 flex flex-col h-full", logo ? "" : "")}>
        <SidebarHeader>
          <div className="flex w-full justify-center p-2 bg-sidebar-accent/50 backdrop-blur-sm">
              <div className="flex w-full justify-center py-3 px-2 items-center gap-2">
                   {isLogoLoading ? (
                        <Loader2 className="h-12 w-12 animate-spin" />
                    ) : logo ? (
                        <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-transparent border border-emerald-500/20">
                             <Image src={logo} alt="Logo" fill className="object-cover scale-105" />
                         </div>
                    ) : null}
                   <p className="text-4xl font-semibold text-center">
                      <span className="text-primary">s</span>
                      <span className="text-sidebar-foreground">BSSI</span>
                  </p>
              </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
              <SidebarMenu className="mt-6 leading-10">
              {filteredNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                      <SidebarMenuButton
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.label}
                      className="inline-flex items-center w-full text-sm font-semibold text-sidebar-foreground transition-colors duration-150 cursor-pointer hover:text-primary"
                      >
                      <item.icon />
                      <span className="ml-4">{item.label}</span>
                      </SidebarMenuButton>
                  </Link>
                  </SidebarMenuItem>
              ))}
              </SidebarMenu>
        </SidebarContent>
      </div>
    </div>
  );
}
