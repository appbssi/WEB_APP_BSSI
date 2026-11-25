import { describe, expect, it } from 'vitest';
import { isInformationPriority, priorityRank, sortInformations } from './informations';

const at = (ms: number) => ({ toMillis: () => ms });

describe('informations', () => {
  it('reconnaît les degrés de priorité valides', () => {
    expect(isInformationPriority('urgente')).toBe(true);
    expect(isInformationPriority('basse')).toBe(true);
    expect(isInformationPriority('critique')).toBe(false);
    expect(isInformationPriority(undefined)).toBe(false);
  });

  it('classe une priorité inconnue en dernier', () => {
    expect(priorityRank('urgente')).toBe(0);
    expect(priorityRank('xyz')).toBeGreaterThan(priorityRank('basse'));
  });

  it('trie par priorité puis par date la plus récente', () => {
    const sorted = sortInformations([
      { id: 'a', priority: 'basse' as const, createdAt: at(300) },
      { id: 'b', priority: 'urgente' as const, createdAt: at(100) },
      { id: 'c', priority: 'urgente' as const, createdAt: at(200) },
      { id: 'd', priority: 'haute' as const, createdAt: null },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});
