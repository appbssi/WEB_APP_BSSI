
'use client';

import { isSameDay } from 'date-fns';
import type { Agent, Mission, Availability, Demande } from './types';
import { getDisplayStatus } from './missions';


/**
 * Determines the availability of an agent based on their missions and leave status.
 * An agent is "En congé" if the current date falls within their leave period.
 * An agent is "En permission" if they have an accepted permission request that is active.
 * An agent is "En mission" if they are assigned to any mission that is 'En cours'.
 * @param agent The agent to check.
 * @param missions A list of all missions.
 * @param now The current date to check against.
 * @param excludeMissionId An optional mission ID to exclude from the check (used when editing a mission).
 * @param demandes Optional list of all demandes (permissions) to check.
 * @returns The availability status of the agent.
 */
export function getAgentAvailability(
  agent: Agent,
  missions: Mission[],
  now: Date | null,
  excludeMissionId?: string,
  demandes?: Demande[]
): Availability | undefined {
  if (!now) {
    return undefined; // or a default/loading state
  }

  // 1. Check accepted permissions/demandes
  if (demandes) {
    const hasActivePermission = demandes.some(d => {
      if (d.status !== 'acceptee') return false;
      
      const isAgentMatch = 
        d.agentId.trim().toLowerCase() === agent.id.trim().toLowerCase() || 
        (agent.id.length >= 6 && d.agentId.trim().toLowerCase() === agent.id.trim().substring(0, 6).toLowerCase()) ||
        (agent.registrationNumber && d.agentId.trim().toLowerCase() === agent.registrationNumber.trim().toLowerCase());
        
      if (!isAgentMatch) return false;
      
      const start = d.startDate.toDate();
      const end = d.endDate.toDate();
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      return now >= start && now <= end;
    });
    
    if (hasActivePermission) {
      return 'En permission';
    }
  }

  // 2. Check manual leave (En congé)
  if (agent.leaveStartDate && agent.leaveEndDate) {
    const leaveStart = agent.leaveStartDate.toDate();
    const leaveEnd = agent.leaveEndDate.toDate();
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);
    if (now >= leaveStart && now <= leaveEnd) {
      return 'En congé';
    }
  }

  // 3. Check active missions
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
