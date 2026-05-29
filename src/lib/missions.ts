import { isSameDay } from 'date-fns';
import type { Mission, MissionStatus } from './types';

export type MissionWithDisplayStatus = Mission & { displayStatus: MissionStatus };

/**
 * Determines the real-time display status of a mission based on its dates and times.
 * @param mission The mission object.
 * @param now The current date to check against.
 * @returns The calculated display status.
 */
export const getDisplayStatus = (mission: Mission, now: Date | null): MissionStatus | undefined => {
    if (!now) return undefined;
    const startDate = mission.startDate.toDate();
    const endDate = mission.endDate.toDate();
    
    if (mission.status === 'Annulée') {
        return 'Annulée';
    }

    if (isSameDay(startDate, endDate) && mission.startTime && mission.endTime) {
        const [startHours, startMinutes] = mission.startTime.split(':').map(Number);
        const [endHours, endMinutes] = mission.endTime.split(':').map(Number);
        const fullStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHours, startMinutes);
        const fullEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endHours, endMinutes);

        if (now > fullEndDate) return 'Terminée';
        if (now < fullStartDate) return 'Planification';
        return 'En cours';
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
