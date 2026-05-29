
'use client';

import { isSameDay } from 'date-fns';
import type { Agent, Mission, Availability } from './types';
import { getDisplayStatus } from './missions';


/**
 * Determines the availability of an agent based on their missions and leave status.
 * An agent is "En congé" if the current date falls within their leave period.
 * An agent is "En mission" if they are assigned to any mission that is 'En cours'.
 * @param agent The agent to check.
 * @param missions A list of all missions.
 * @param now The current date to check against.
 * @param excludeMissionId An optional mission ID to exclude from the check (used when editing a mission).
 * @returns The availability status of the agent.
 */
export function getAgentAvailability(agent: Agent, missions: Mission[], now: Date | null, excludeMissionId?: string): Availability | undefined {
  if (!now) {
    return undefined; // or a default/loading state
  }

  if (agent.leaveStartDate && agent.leaveEndDate) {
    const leaveStart = agent.leaveStartDate.toDate();
    const leaveEnd = agent.leaveEndDate.toDate();
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);
    if (now >= leaveStart && now <= leaveEnd) {
      return 'En congé';
    }
  }

  const isAssignedToActiveMission = missions.some(mission => {
    if (mission.id === excludeMissionId) {
      return false;
    }
    
    const isAgentAssigned = mission.assignedAgentIds.includes(agent.id);
    const missionStatus = getDisplayStatus(mission, now); 
    const isMissionInProgress = missionStatus === 'En cours';

    return isAgentAssigned && isMissionInProgress;
  });

  if (isAssignedToActiveMission) {
    return 'En mission';
  }

  return 'Disponible';
}
