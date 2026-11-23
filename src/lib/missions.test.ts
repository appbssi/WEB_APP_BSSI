import { describe, expect, it } from 'vitest';
import { checkAgentMissionConflict, getDisplayStatus } from './missions';
import type { Agent, Mission } from './types';

const agent = { id: 'agent1', fullName: 'Agent Test' } as Agent;

function mission(partial: Partial<Mission>): Mission {
  return {
    id: 'm1',
    name: 'Patrouille',
    location: 'Zone A',
    status: 'Planification',
    assignedAgentIds: ['agent1'],
    startDate: new Date(2026, 10, 10) as any,
    endDate: new Date(2026, 10, 12) as any,
    ...partial,
  } as Mission;
}

describe('checkAgentMissionConflict', () => {
  it("détecte un chevauchement avec une mission de l'agent", () => {
    const res = checkAgentMissionConflict(agent, [mission({})], '2026-11-11', '2026-11-13');
    expect(res.hasConflict).toBe(true);
    expect(res.type).toBe('mission');
  });

  it("pas de conflit si les périodes ne se touchent pas", () => {
    const res = checkAgentMissionConflict(agent, [mission({})], '2026-11-13', '2026-11-14');
    expect(res.hasConflict).toBe(false);
  });

  it("ignore les missions annulées ou rejetées", () => {
    const missions = [mission({ status: 'Annulée' }), mission({ id: 'm2', validationStatus: 'Rejetée' })];
    expect(checkAgentMissionConflict(agent, missions, '2026-11-11', '2026-11-11').hasConflict).toBe(false);
  });

  it("ignore la mission en cours de modification", () => {
    expect(checkAgentMissionConflict(agent, [mission({})], '2026-11-11', '2026-11-11', null, null, 'm1').hasConflict).toBe(false);
  });

  it("ignore les missions où l'agent n'est pas affecté", () => {
    expect(checkAgentMissionConflict(agent, [mission({ assignedAgentIds: ['autre'] })], '2026-11-11', '2026-11-11').hasConflict).toBe(false);
  });

  it("même jour : pas de conflit si les créneaux horaires ne se chevauchent pas", () => {
    const m = mission({ startDate: new Date(2026, 10, 10) as any, endDate: new Date(2026, 10, 10) as any, startTime: '08:00', endTime: '12:00' });
    expect(checkAgentMissionConflict(agent, [m], '2026-11-10', '2026-11-10', '13:00', '17:00').hasConflict).toBe(false);
    expect(checkAgentMissionConflict(agent, [m], '2026-11-10', '2026-11-10', '11:00', '14:00').hasConflict).toBe(true);
  });

  it("détecte un conflit avec un congé", () => {
    const enConge = { ...agent, leaveStartDate: new Date(2026, 10, 20), leaveEndDate: new Date(2026, 10, 25) } as any;
    const res = checkAgentMissionConflict(enConge, [], '2026-11-24', '2026-11-26');
    expect(res.hasConflict).toBe(true);
    expect(res.type).toBe('leave');
  });
});

describe('getDisplayStatus', () => {
  const m = mission({});

  it('respecte les statuts terminaux', () => {
    expect(getDisplayStatus(mission({ status: 'Annulée' }), new Date())).toBe('Annulée');
    expect(getDisplayStatus(mission({ validationStatus: 'Rejetée' }), new Date())).toBe('Rejetée');
    expect(getDisplayStatus(mission({ status: 'En attente' }), new Date())).toBe('En attente');
  });

  it('calcule planification / en cours / terminée selon la date', () => {
    expect(getDisplayStatus(m, new Date(2026, 10, 9))).toBe('Planification');
    expect(getDisplayStatus(m, new Date(2026, 10, 11))).toBe('En cours');
    expect(getDisplayStatus(m, new Date(2026, 10, 13))).toBe('Terminée');
  });

  it("tient compte des heures pour une mission d'une journée", () => {
    const jour = mission({ startDate: new Date(2026, 10, 10) as any, endDate: new Date(2026, 10, 10) as any, startTime: '08:00', endTime: '12:00' });
    expect(getDisplayStatus(jour, new Date(2026, 10, 10, 7, 0))).toBe('Planification');
    expect(getDisplayStatus(jour, new Date(2026, 10, 10, 10, 0))).toBe('En cours');
    expect(getDisplayStatus(jour, new Date(2026, 10, 10, 13, 0))).toBe('Terminée');
  });
});
