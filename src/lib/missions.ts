import { isSameDay } from 'date-fns';
import type { Agent, Mission, MissionStatus } from './types';

export type MissionWithDisplayStatus = Mission & { displayStatus: MissionStatus };

export interface AgentConflictInfo {
  hasConflict: boolean;
  type?: 'mission' | 'leave';
  conflictingMissionName?: string;
  reason?: string;
}

/**
 * Checks whether an agent is in conflict with another mission or leave during a specified period.
 * An agent cannot perform two missions in the same time period.
 */
export function checkAgentMissionConflict(
  agent: Agent,
  missions: Mission[],
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  startTime?: string | null,
  endTime?: string | null,
  excludeMissionId?: string
): AgentConflictInfo {
  if (!agent || !startDate || !endDate) {
    return { hasConflict: false };
  }

  const parseToDate = (d: any): Date | null => {
    if (!d) return null;
    if (typeof d.toDate === 'function') return d.toDate();
    if (d instanceof Date) return d;
    if (typeof d === 'string') {
      const parts = d.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof d === 'number') {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof d === 'object' && d.seconds !== undefined) {
      return new Date(d.seconds * 1000);
    }
    return null;
  };

  const selStart = parseToDate(startDate);
  const selEnd = parseToDate(endDate);
  if (!selStart || !selEnd) {
    return { hasConflict: false };
  }

  const sStartDay = new Date(selStart.getFullYear(), selStart.getMonth(), selStart.getDate(), 0, 0, 0, 0);
  const sEndDay = new Date(selEnd.getFullYear(), selEnd.getMonth(), selEnd.getDate(), 23, 59, 59, 999);

  // 1. Check Leave (Congé / Absences)
  if (agent.leaveStartDate && agent.leaveEndDate) {
    const lStart = parseToDate(agent.leaveStartDate);
    const lEnd = parseToDate(agent.leaveEndDate);
    if (lStart && lEnd) {
      const lStartDay = new Date(lStart.getFullYear(), lStart.getMonth(), lStart.getDate(), 0, 0, 0, 0);
      const lEndDay = new Date(lEnd.getFullYear(), lEnd.getMonth(), lEnd.getDate(), 23, 59, 59, 999);
      if (sStartDay.getTime() <= lEndDay.getTime() && sEndDay.getTime() >= lStartDay.getTime()) {
        const fmt = (dt: Date) => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        return {
          hasConflict: true,
          type: 'leave',
          reason: `En congé du ${fmt(lStart)} au ${fmt(lEnd)}`,
        };
      }
    }
  }

  // 2. Check existing Missions
  for (const mission of missions) {
    if (!mission || mission.id === excludeMissionId) continue;
    if (mission.status === 'Annulée') continue;
    if (!mission.assignedAgentIds || !mission.assignedAgentIds.includes(agent.id)) continue;

    const mStart = parseToDate(mission.startDate);
    const mEnd = parseToDate(mission.endDate);
    if (!mStart || !mEnd) continue;

    const mStartDay = new Date(mStart.getFullYear(), mStart.getMonth(), mStart.getDate(), 0, 0, 0, 0);
    const mEndDay = new Date(mEnd.getFullYear(), mEnd.getMonth(), mEnd.getDate(), 23, 59, 59, 999);

    const isDayOverlap = sStartDay.getTime() <= mEndDay.getTime() && sEndDay.getTime() >= mStartDay.getTime();
    if (!isDayOverlap) continue;

    // If both are single-day missions on the exact same calendar day and both have start/end times:
    const isSelSameDay = sStartDay.getTime() === sEndDay.getTime();
    const isMSameDay = mStartDay.getTime() === mEndDay.getTime();
    const isExactSameDay = isSelSameDay && isMSameDay && sStartDay.getTime() === mStartDay.getTime();

    if (isExactSameDay && startTime && endTime && mission.startTime && mission.endTime) {
      const timeOverlap = startTime < mission.endTime && endTime > mission.startTime;
      if (!timeOverlap) {
        // Non-overlapping time slots on the same day -> no conflict
        continue;
      }
    }

    const fmt = (dt: Date) => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const periodStr = isMSameDay ? `le ${fmt(mStart)}` : `du ${fmt(mStart)} au ${fmt(mEnd)}`;

    return {
      hasConflict: true,
      type: 'mission',
      conflictingMissionName: mission.name,
      reason: `Déjà affecté à la mission "${mission.name}" (${periodStr})`,
    };
  }

  return { hasConflict: false };
}

/**
 * Determines the real-time display status of a mission based on its dates and times.
 * @param mission The mission object.
 * @param now The current date to check against.
 * @returns The calculated display status.
 */
export const getDisplayStatus = (mission: Mission, now: Date | null): MissionStatus => {
    if (!mission) return 'Planification';
    
    if (mission.status === 'Annulée') {
        return 'Annulée';
    }

    if (mission.status === 'Terminée') {
        return 'Terminée';
    }

    if (!now) return mission.status || 'Planification';

    const parseDateSafe = (d: any): Date | null => {
        if (!d) return null;
        if (typeof d.toDate === 'function') return d.toDate();
        if (d instanceof Date) return d;
        if (typeof d === 'string' || typeof d === 'number') {
            const parsed = new Date(d);
            return isNaN(parsed.getTime()) ? null : parsed;
        }
        if (typeof d === 'object' && d.seconds !== undefined) {
            return new Date(d.seconds * 1000);
        }
        return null;
    };

    const startDate = parseDateSafe(mission.startDate);
    const endDate = parseDateSafe(mission.endDate);

    if (!startDate || !endDate) {
        return mission.status || 'Planification';
    }

    if (isSameDay(startDate, endDate) && mission.startTime && mission.endTime) {
        try {
            const [startHours, startMinutes] = mission.startTime.split(':').map(Number);
            const [endHours, endMinutes] = mission.endTime.split(':').map(Number);
            const fullStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHours, startMinutes);
            const fullEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endHours, endMinutes);

            if (now > fullEndDate) return 'Terminée';
            if (now < fullStartDate) return 'Planification';
            return 'En cours';
        } catch {
            // fallback if string parsing fails
        }
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const missionEndDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (today > missionEndDay) {
        return 'Terminée';
    }

    const missionStartDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (today < missionStartDay) {
        return 'Planification';
    }

    return 'En cours';
};
