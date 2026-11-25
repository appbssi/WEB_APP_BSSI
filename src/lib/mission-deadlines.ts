import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns';
import type { Mission } from './types';

/** Missions échues ou expirant dans ce délai : affichées dans l'alerte d'échéance. */
export const DEADLINE_WINDOW_HOURS = 48;

/** Une mission échue est clôturée automatiquement ce délai après sa fin prévue. */
export const AUTO_CLOSE_DELAY_MINUTES = 60;

export type DeadlineUrgency = 'overdue' | 'critical' | 'warning' | 'notice';

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const v = value as { toDate?: () => Date; seconds?: number };
  let d: Date | null = null;
  if (typeof v.toDate === 'function') d = v.toDate();
  else if (value instanceof Date) d = new Date(value.getTime());
  else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  else if (typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
  return d && !isNaN(d.getTime()) ? d : null;
}

function parseTime(value?: string): [number, number] | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? [h, m] : null;
}

/**
 * Fin réelle d'une mission, calculée comme `getDisplayStatus` :
 * l'heure de fin ne compte que pour une mission d'une seule journée avec heures de début et de fin ;
 * sinon la mission se termine à 23:59:59 du jour de fin.
 */
export function getMissionEndDateTime(mission: Pick<Mission, 'startDate' | 'endDate' | 'startTime' | 'endTime'>): Date | null {
  const end = toDate(mission.endDate);
  if (!end) return null;
  const start = toDate(mission.startDate);
  const endTime = parseTime(mission.endTime);

  if (start && isSameDay(start, end) && parseTime(mission.startTime) && endTime) {
    return new Date(end.getFullYear(), end.getMonth(), end.getDate(), endTime[0], endTime[1], 0, 0);
  }
  return new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
}

/** Mission qui attend encore la validation d'un administrateur. */
export function isAwaitingValidation(mission: Pick<Mission, 'status' | 'validationStatus'>): boolean {
  return mission.status === 'En attente' || mission.validationStatus === 'En attente';
}

/** Mission dont l'échéance doit être suivie (ni close, ni annulée, ni rejetée, ni en attente de validation). */
export function isDeadlineTracked(mission: Pick<Mission, 'status' | 'validationStatus'>): boolean {
  if (mission.status === 'Terminée' || mission.status === 'Annulée' || mission.status === 'Rejetée') return false;
  if (mission.validationStatus === 'Rejetée') return false;
  return !isAwaitingValidation(mission);
}

/** Moment de la clôture automatique (fin prévue + 1 h), ou null si la mission n'est pas concernée. */
export function getAutoCloseTime(
  mission: Pick<Mission, 'status' | 'validationStatus' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
): Date | null {
  if (!isDeadlineTracked(mission)) return null;
  const end = getMissionEndDateTime(mission);
  return end ? new Date(end.getTime() + AUTO_CLOSE_DELAY_MINUTES * 60_000) : null;
}

/** La mission doit-elle être clôturée automatiquement maintenant ? */
export function shouldAutoClose(
  mission: Pick<Mission, 'status' | 'validationStatus' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  now: Date,
): boolean {
  const at = getAutoCloseTime(mission);
  return !!at && at.getTime() <= now.getTime();
}

function formatDuration(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}j ${hours}h` : `${days}j`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${Math.max(1, minutes)} min`;
}

function dayLabel(end: Date, now: Date): string {
  const days = differenceInCalendarDays(end, now);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === 2) return 'après-demain';
  return `le ${end.toLocaleDateString('fr-FR')}`;
}

/**
 * Urgence et libellé d'une échéance, ou null si elle est trop lointaine pour l'alerte.
 * Une mission échue reste dans l'alerte tant qu'elle n'est pas clôturée (aucune limite dans le passé).
 */
export function classifyDeadline(end: Date, now: Date): { urgency: DeadlineUrgency; label: string } | null {
  const diffMs = end.getTime() - now.getTime();
  const diffHours = diffMs / 3_600_000;
  if (diffHours > DEADLINE_WINDOW_HOURS) return null;

  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (diffMs < 0) {
    const left = AUTO_CLOSE_DELAY_MINUTES - minutes;
    return {
      urgency: 'overdue',
      label:
        left > 0
          ? `Échue depuis ${formatDuration(minutes)} — clôture auto dans ${formatDuration(left)}`
          : `Échue depuis ${formatDuration(minutes)} — clôture auto en cours`,
    };
  }
  if (diffHours < 12) return { urgency: 'critical', label: `Expire dans ${formatDuration(minutes)} !` };
  return {
    urgency: diffHours < 24 ? 'warning' : 'notice',
    label: `Expire dans ${formatDuration(minutes)} (${dayLabel(end, now)})`,
  };
}

/**
 * Nouvelle date de fin (minuit du jour, comme à la création) après une prolongation de `days` jours.
 * Le point de départ est la fin prévue, ou aujourd'hui si la mission est déjà échue.
 */
export function computeExtendedEndDate(
  mission: Pick<Mission, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  days: number,
  now: Date,
): Date {
  const currentEnd = getMissionEndDateTime(mission) ?? now;
  const base = currentEnd.getTime() < now.getTime() ? now : currentEnd;
  return startOfDay(addDays(base, days));
}
