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
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg border-border hover:bg-accent transition-all text-foreground"
            title={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700 dark:text-slate-200 transition-transform hover:-rotate-12" />
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
