import { describe, expect, it } from 'vitest';
import { getOrderStage, missionAgentKeys } from './signed-orders';

describe('missionAgentKeys', () => {
  it('réunit fiches et matricules des agents de la mission, sans doublon', () => {
    expect(
      missionAgentKeys({
        assignedAgentIds: ['a1', 'a2'],
        agentIds: ['a1'],
        missionData: { agents: [{ id: 'a1', registrationNumber: '291 415-N' }, { id: 'a2' }] },
      }),
    ).toEqual(['a1', 'a2', '291 415-N']);
    expect(missionAgentKeys({})).toEqual([]);
  });
});

describe('getOrderStage', () => {
  it('suit le cycle : à imprimer → à signer → archivé', () => {
    expect(getOrderStage(undefined)).toBe('a_imprimer');
    expect(getOrderStage({ status: 'a_signer', printedAt: null })).toBe('a_imprimer');
    expect(getOrderStage({ status: 'a_signer', printedAt: { seconds: 1 } as any })).toBe('a_signer');
    expect(getOrderStage({ status: 'archive', printedAt: null })).toBe('archive');
  });
});
