import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABELS, isInformationPriority } from '@/lib/informations';
import type { InformationPriority } from '@/lib/types';
import { cn } from '@/lib/utils';

const PRIORITY_STYLES: Record<InformationPriority, string> = {
  urgente: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
  haute: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30',
  moyenne: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
  basse: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30',
};

export function PriorityBadge({ priority }: { priority: string }) {
  if (!isInformationPriority(priority)) return <Badge variant="outline">{priority || '—'}</Badge>;
  return <Badge className={cn('hover:bg-transparent', PRIORITY_STYLES[priority])}>{PRIORITY_LABELS[priority]}</Badge>;
}
