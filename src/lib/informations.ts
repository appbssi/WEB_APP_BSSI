import type { Information, InformationPriority } from '@/lib/types';

/** Degrés de priorité, du plus urgent au moins urgent. */
export const INFORMATION_PRIORITIES: readonly InformationPriority[] = ['urgente', 'haute', 'moyenne', 'basse'];

export const PRIORITY_LABELS: Record<InformationPriority, string> = {
  urgente: 'Urgente',
  haute: 'Haute',
  moyenne: 'Moyenne',
  basse: 'Basse',
};

export function isInformationPriority(value: unknown): value is InformationPriority {
  return typeof value === 'string' && (INFORMATION_PRIORITIES as readonly string[]).includes(value);
}

/** Rang de priorité : 0 = urgente. Une valeur inconnue passe en dernier. */
export function priorityRank(priority: string): number {
  const i = (INFORMATION_PRIORITIES as readonly string[]).indexOf(priority);
  return i === -1 ? INFORMATION_PRIORITIES.length : i;
}

/** Tri : priorité la plus haute d'abord, puis la plus récente. */
export function sortInformations<T extends Pick<Information, 'priority'> & { createdAt?: { toMillis(): number } | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  );
}
