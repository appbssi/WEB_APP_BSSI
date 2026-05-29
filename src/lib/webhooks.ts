
'use server';

import type { Agent, Mission } from './types';

type MissionWebhookData = Omit<Mission, 'id' | 'status' | 'startDate' | 'endDate'> & {
    startDate: string;
    endDate: string;
    agents: string[]; // Noms des agents
};

/**
 * Envoie une notification webhook lors de la création d'une mission.
 * @param missionData - Les données de la mission qui vient d'être créée.
 */
export async function sendMissionCreationWebhook(missionData: MissionWebhookData) {
  const webhookUrl = 'https://eor81ahsfc5a6tl.m.pipedream.net';

  const description = `Mission prévue à ${missionData.location} du ${new Date(missionData.startDate).toLocaleDateString('fr-FR')} au ${new Date(missionData.endDate).toLocaleDateString('fr-FR')}.`;

  const payload = {
    title: missionData.name,
    description: description,
    agents: missionData.agents,
    created_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Webhook a échoué avec le statut: ${response.status}`, await response.text());
    }
  } catch (error) {
    console.error("Erreur lors de l'envoi du webhook:", error);
  }
}
