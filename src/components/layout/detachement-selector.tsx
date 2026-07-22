'use client';

import { useDetachement } from '@/context/detachement-context';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection } from 'firebase/firestore';
import type { Agent } from '@/lib/types';
import { useMemo } from 'react';
import { Shield } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function DetachementSelector() {
  const { selectedDetachement, setSelectedDetachement } = useDetachement();
  const firestore = useFirestore();

  const agentsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'agents') : null), [firestore]);
  const { data: agents } = useCollection<Agent>(agentsQuery);

  const options = useMemo(() => {
    const defaultList = [
      'ALL',
      'DETACHEMENT NOE',
      'DETACHEMENT TINGRELA',
      'DETACHEMENT MORONDO',
    ];

    if (agents) {
      agents.forEach(a => {
        if (a.section && !defaultList.includes(a.section) && a.section.toUpperCase().includes('DETACHEMENT')) {
          defaultList.push(a.section);
        }
      });
    }

    return Array.from(new Set(defaultList));
  }, [agents]);

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 relative rounded-lg bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary transition-all cursor-pointer"
                aria-label="Sélectionner le détachement"
              >
                <Shield className="h-4 w-4" />
                {selectedDetachement !== 'ALL' && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs font-semibold">
            Détachement : {selectedDetachement === 'ALL' ? 'Tous les détachements' : selectedDetachement}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
          Sélectionner le détachement
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setSelectedDetachement('ALL')}
          className={`text-xs font-semibold flex items-center justify-between cursor-pointer ${
            selectedDetachement === 'ALL' ? 'bg-primary/10 text-primary font-bold' : ''
          }`}
        >
          <span>Tous les détachements</span>
          {selectedDetachement === 'ALL' && <Shield className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.filter(o => o !== 'ALL').map(opt => (
          <DropdownMenuItem
            key={opt}
            onClick={() => setSelectedDetachement(opt)}
            className={`text-xs font-medium flex items-center justify-between cursor-pointer ${
              selectedDetachement === opt ? 'bg-primary/10 text-primary font-bold' : ''
            }`}
          >
            <span>{opt}</span>
            {selectedDetachement === opt && <Shield className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
