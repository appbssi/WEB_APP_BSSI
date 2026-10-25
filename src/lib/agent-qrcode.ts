import QRCode from 'qrcode';
import type { Agent } from './types';

export interface AgentQRPayload {
  app: 'sBSSI';
  type: 'AGENT_ID';
  id: string;
  matricule: string;
  nom: string;
  grade: string;
  section: string;
  idc: string;
  url?: string;
}

/**
 * Builds the canonical payload encoded into the agent QR code.
 * Includes both structured identification and a direct verification URL
 * so that standard smartphone cameras can open the profile directly.
 */
export function getAgentQRPayloadString(agent: Agent, origin?: string): string {
  const baseOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const verificationUrl = baseOrigin
    ? `${baseOrigin}/agents?agentId=${encodeURIComponent(agent.id)}`
    : '';

  const payload: AgentQRPayload = {
    app: 'sBSSI',
    type: 'AGENT_ID',
    id: agent.id,
    matricule: agent.registrationNumber || 'N/A',
    nom: agent.fullName || 'Agent',
    grade: agent.rank || 'N/A',
    section: agent.section || 'Non assigné',
    idc: (agent.id || '').substring(0, 6).toUpperCase(),
    url: verificationUrl,
  };

  return JSON.stringify(payload);
}

/**
 * Generates a Data URL (PNG) of the agent's QR Code.
 */
export async function generateAgentQRCodeDataURL(
  agent: Agent,
  options?: { size?: number; margin?: number; colorDark?: string; colorLight?: string }
): Promise<string> {
  const text = getAgentQRPayloadString(agent);
  return QRCode.toDataURL(text, {
    width: options?.size || 300,
    margin: options?.margin ?? 2,
    color: {
      dark: options?.colorDark || '#1a2b4c', // sBSSI dark navy
      light: options?.colorLight || '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Parses any QR Code content scanned via camera, image upload, or handheld scanner.
 * Supports:
 * - Structured sBSSI JSON
 * - URLs with ?agentId=... or ?id=...
 * - Plain agent ID or Matricule string
 */
export function parseScannedAgentData(raw: string): {
  agentId?: string;
  matricule?: string;
  fullName?: string;
  raw: string;
} {
  const trimmed = raw.trim();

  // 1. Try parsing JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      if (data.id || data.agentId || data.matricule) {
        return {
          agentId: data.id || data.agentId,
          matricule: data.matricule,
          fullName: data.nom || data.fullName,
          raw: trimmed,
        };
      }
    } catch {
      // not JSON
    }
  }

  // 2. Try parsing URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/agents')) {
    try {
      const url = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const agentId = url.searchParams.get('agentId') || url.searchParams.get('id');
      const matricule = url.searchParams.get('matricule');
      if (agentId || matricule) {
        return {
          agentId: agentId || undefined,
          matricule: matricule || undefined,
          raw: trimmed,
        };
      }
    } catch {
      // fallback regex for agentId in query string
      const match = trimmed.match(/[?&](?:agentId|id)=([^&]+)/);
      if (match && match[1]) {
        return {
          agentId: decodeURIComponent(match[1]),
          raw: trimmed,
        };
      }
    }
  }

  // 3. Plain ID or matricule string
  return {
    agentId: trimmed.length > 10 ? trimmed : undefined,
    matricule: trimmed.length <= 10 ? trimmed : undefined,
    raw: trimmed,
  };
}
