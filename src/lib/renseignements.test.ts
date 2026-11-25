import { describe, expect, it } from 'vitest';
import { renseignementStateByInformation } from './renseignements';

describe('renseignementStateByInformation', () => {
  it('donne « en cours » dès qu’un renseignement est ouvert sur l’information', () => {
    const state = renseignementStateByInformation([
      { informationId: 'a', status: 'termine' },
      { informationId: 'a', status: 'en_cours' },
      { informationId: 'b', status: 'termine' },
    ]);
    expect(state.get('a')).toBe('en_cours');
    expect(state.get('b')).toBe('termine');
    expect(state.has('c')).toBe(false);
  });
});
