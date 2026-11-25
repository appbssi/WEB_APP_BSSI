import type { Renseignement, RenseignementConclusion, RenseignementStatus } from '@/lib/types';

export const STATUS_LABELS: Record<RenseignementStatus, string> = {
  en_cours: 'En cours',
  termine: 'Compte rendu fait',
};

export const CONCLUSIONS: readonly RenseignementConclusion[] = ['confirmee', 'partielle', 'infirmee', 'indeterminee'];

export const CONCLUSION_LABELS: Record<RenseignementConclusion, string> = {
  confirmee: 'Information confirmée',
  partielle: 'Partiellement confirmée',
  infirmee: 'Information infirmée',
  indeterminee: 'Non concluant',
};

/**
 * État de renseignement de chaque information :
 * « en_cours » si au moins un renseignement est ouvert, sinon « termine » s'il y en a eu un.
 */
export function renseignementStateByInformation(
  renseignements: readonly Pick<Renseignement, 'informationId' | 'status'>[],
): Map<string, RenseignementStatus> {
  const state = new Map<string, RenseignementStatus>();
  for (const r of renseignements) {
    if (r.status === 'en_cours') state.set(r.informationId, 'en_cours');
    else if (!state.has(r.informationId)) state.set(r.informationId, 'termine');
  }
  return state;
}
