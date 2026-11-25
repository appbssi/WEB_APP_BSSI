import { describe, expect, it } from 'vitest';
import {
  classifyDeadline,
  computeExtendedEndDate,
  getMissionEndDateTime,
  isDeadlineTracked,
  shouldAutoClose,
} from './mission-deadlines';
import { getDisplayStatus } from './missions';
import type { Mission } from './types';

function mission(partial: Partial<Mission>): Mission {
  return {
    id: 'm1',
    name: 'Patrouille',
    location: 'Zone A',
    status: 'Planification',
    assignedAgentIds: [],
    startDate: new Date(2026, 10, 10) as any,
    endDate: new Date(2026, 10, 12) as any,
    ...partial,
  } as Mission;
}

describe('getMissionEndDateTime', () => {
  it("ignore l'heure de fin d'une mission sur plusieurs jours (comme getDisplayStatus)", () => {
    const m = mission({ startTime: '08:00', endTime: '08:00' });
    expect(getMissionEndDateTime(m)).toEqual(new Date(2026, 10, 12, 23, 59, 59, 999));
    // À 10h le dernier jour, la mission est encore « En cours » partout
    expect(getDisplayStatus(m, new Date(2026, 10, 12, 10, 0))).toBe('En cours');
  });

  it("applique l'heure de fin d'une mission d'une journée", () => {
    const m = mission({ endDate: new Date(2026, 10, 10) as any, startTime: '08:00', endTime: '17:30' });
    expect(getMissionEndDateTime(m)).toEqual(new Date(2026, 10, 10, 17, 30, 0, 0));
  });
});

describe('isDeadlineTracked', () => {
  it('exclut les missions en attente de validation, closes, annulées ou rejetées', () => {
    expect(isDeadlineTracked(mission({ status: 'En cours' }))).toBe(true);
    expect(isDeadlineTracked(mission({ status: 'Planification', validationStatus: 'En attente' }))).toBe(false);
    expect(isDeadlineTracked(mission({ status: 'En attente' }))).toBe(false);
    expect(isDeadlineTracked(mission({ status: 'Terminée' }))).toBe(false);
    expect(isDeadlineTracked(mission({ status: 'Annulée' }))).toBe(false);
    expect(isDeadlineTracked(mission({ validationStatus: 'Rejetée' }))).toBe(false);
  });
});

describe('classifyDeadline', () => {
  const end = new Date(2026, 10, 12, 23, 59, 59, 999);

  it('annonce la clôture automatique d’une mission échue', () => {
    const r = classifyDeadline(new Date(2026, 10, 12, 10, 0), new Date(2026, 10, 12, 10, 20));
    expect(r?.urgency).toBe('overdue');
    expect(r?.label).toBe('Échue depuis 20 min — clôture auto dans 40 min');
  });

  it("n'affiche jamais « 60m »", () => {
    const r = classifyDeadline(new Date(2026, 10, 12, 15, 0), new Date(2026, 10, 12, 11, 0, 20));
    expect(r?.urgency).toBe('critical');
    expect(r?.label).toBe('Expire dans 4h !');
  });

  it('nomme le jour réel de l’échéance', () => {
    // 20h la veille, échéance le lendemain 11h : 15 h restantes → « demain », pas « aujourd'hui »
    const r = classifyDeadline(new Date(2026, 10, 13, 11, 0), new Date(2026, 10, 12, 20, 0));
    expect(r?.urgency).toBe('warning');
    expect(r?.label).toContain('(demain)');
  });

  it('ignore les échéances à plus de 48 h', () => {
    expect(classifyDeadline(end, new Date(2026, 10, 9, 12, 0))).toBeNull();
  });
});

describe('shouldAutoClose', () => {
  const m = mission({ status: 'En cours' }); // fin prévue le 12/11 à 23:59:59

  it('clôture 1 h après la fin prévue, pas avant', () => {
    expect(shouldAutoClose(m, new Date(2026, 10, 13, 0, 30))).toBe(false);
    expect(shouldAutoClose(m, new Date(2026, 10, 13, 1, 0))).toBe(true);
  });

  it('ne touche ni aux missions en attente de validation ni aux missions déjà closes', () => {
    const later = new Date(2026, 10, 20);
    expect(shouldAutoClose({ ...m, validationStatus: 'En attente' }, later)).toBe(false);
    expect(shouldAutoClose({ ...m, status: 'Terminée' }, later)).toBe(false);
    expect(shouldAutoClose({ ...m, status: 'Annulée' }, later)).toBe(false);
  });
});

describe('computeExtendedEndDate', () => {
  it('prolonge à partir de la fin prévue', () => {
    const r = computeExtendedEndDate(mission({}), 2, new Date(2026, 10, 11, 9, 0));
    expect(r).toEqual(new Date(2026, 10, 14));
  });

  it("prolonge à partir d'aujourd'hui si la mission est déjà échue", () => {
    const r = computeExtendedEndDate(mission({}), 1, new Date(2026, 10, 15, 9, 0));
    expect(r).toEqual(new Date(2026, 10, 16));
    expect(getMissionEndDateTime(mission({ endDate: r as any }))!.getTime()).toBeGreaterThan(new Date(2026, 10, 15, 9, 0).getTime());
  });
});
