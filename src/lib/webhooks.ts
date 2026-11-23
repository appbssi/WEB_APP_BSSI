'use server';

export interface MissionWebhookData {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  agents: string[]; // Noms des agents
}

/**
 * Envoie une notification webhook lors de la création d'une mission.
 *
 * L'adresse de destination n'est plus écrite dans le code : elle est lue dans la
 * variable d'environnement serveur MISSION_WEBHOOK_URL. Si elle n'est pas définie,
 * aucune donnée de mission ne quitte l'application.
 */
export async function sendMissionCreationWebhook(missionData: MissionWebhookData) {
  const webhookUrl = process.env.MISSION_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  // Validation minimale des données reçues (une action serveur est appelable depuis le navigateur)
  if (
    !missionData ||
    typeof missionData.name !== 'string' ||
    typeof missionData.location !== 'string' ||
    !Array.isArray(missionData.agents)
  ) {
    return;
  }

  const description = `Mission prévue à ${missionData.location} du ${new Date(missionData.startDate).toLocaleDateString('fr-FR')} au ${new Date(missionData.endDate).toLocaleDateString('fr-FR')}.`;

  const payload = {
    title: missionData.name.slice(0, 200),
    description,
    agents: missionData.agents.slice(0, 200).map((a) => String(a).slice(0, 120)),
    created_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Webhook a échoué avec le statut: ${response.status}`);
    }
  } catch (error) {
    console.error("Erreur lors de l'envoi du webhook:", error);
  }
}
