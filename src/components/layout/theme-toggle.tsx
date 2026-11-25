'use client';

import { useTheme } from '@/components/layout/theme-provider';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            title={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
          >
            {isDark ? (
              <Sun className="h-[18px] w-[18px] text-amber-400 transition-transform hover:rotate-45" />
            ) : (
              <Moon className="h-[18px] w-[18px] transition-transform hover:-rotate-12" />
            )}
            <span className="sr-only">Changer le thème</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-semibold">
          {isDark ? 'Mode clair' : 'Mode sombre'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
