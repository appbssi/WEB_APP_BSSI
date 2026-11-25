'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Agent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AgentMultiSelectProps {
  agents: Agent[];
  isLoading?: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
}

/** Liste déroulante des agents, avec recherche et sélection multiple. */
export function AgentMultiSelect({ agents, isLoading, value, onChange, invalid }: AgentMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sorted = useMemo(
    () => [...agents].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '', 'fr')),
    [agents],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((a) =>
      [a.fullName, a.rank, a.registrationNumber, a.section].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [sorted, search]);

  const selected = useMemo(() => value.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as Agent[], [value, agents]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className={cn('w-full justify-between font-normal', invalid && 'border-destructive')}
          >
            <span className={cn('truncate', !selected.length && 'text-muted-foreground')}>
              {selected.length === 0
                ? 'Choisir un ou plusieurs agents…'
                : selected.length === 1
                  ? selected[0].fullName
                  : `${selected.length} agents sélectionnés`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-9 pl-8"
              placeholder="Rechercher par nom, grade, matricule…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Défilement natif : fonctionne dans un Popover placé dans une boîte de dialogue */}
          <div className="max-h-64 overflow-y-auto overscroll-contain p-1" onWheel={(e) => e.stopPropagation()}>
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Aucun agent trouvé.</p>
            ) : (
              filtered.map((agent) => {
                const checked = value.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggle(agent.id)}
                    className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{agent.fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[agent.rank, agent.registrationNumber, agent.section].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
              {a.rank ? `${a.rank} ` : ''}
              {a.fullName}
              <button type="button" aria-label={`Retirer ${a.fullName}`} onClick={() => toggle(a.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
