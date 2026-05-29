// src/ai/flows/suggest-agents-for-mission.ts
'use server';
/**
 * @fileOverview This file defines a Genkit flow to suggest the most suitable agents for a given mission
 *
 * - suggestAgentsForMission - An async function that takes mission details as input and returns a list of suggested agents.
 * - SuggestAgentsForMissionInput - The input type for the suggestAgentsForMission function.
 * - SuggestAgentsForMissionOutput - The output type for the suggestAgentsForMission function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAgentsForMissionInputSchema = z.object({
  missionDetails: z.string().describe('Details of the mission, including location, time, and required skills.'),
  availableAgents: z.array(z.object({
    name: z.string(),
    skills: z.array(z.string()),
    availability: z.string(),
    completedMissions: z.number().describe('The number of missions this agent has completed.'),
  })).describe('A list of available agents with their skills, availability, and past performance.'),
});
export type SuggestAgentsForMissionInput = z.infer<typeof SuggestAgentsForMissionInputSchema>;

const SuggestAgentsForMissionOutputSchema = z.array(z.object({
  name: z.string(),
  reason: z.string().describe("Raison pour laquelle cet agent est suggéré pour la mission."),
})).describe("Une liste d'agents suggérés avec les raisons de leur adéquation.");
export type SuggestAgentsForMissionOutput = z.infer<typeof SuggestAgentsForMissionOutputSchema>;

export async function suggestAgentsForMission(input: SuggestAgentsForMissionInput): Promise<SuggestAgentsForMissionOutput> {
  return suggestAgentsForMissionFlow(input);
}

const suggestAgentsPrompt = ai.definePrompt({
  name: 'suggestAgentsPrompt',
  input: {schema: SuggestAgentsForMissionInputSchema},
  output: {schema: SuggestAgentsForMissionOutputSchema},
  prompt: `Vous êtes un assistant IA spécialisé dans la suggestion des meilleurs agents pour une mission. Votre objectif est d'assurer une rotation équitable des agents.

Compte tenu des détails de la mission suivants:
{{{missionDetails}}}

Et des agents disponibles suivants:
{{#each availableAgents}}
- Nom: {{this.name}}, Disponibilité: {{this.availability}}, Missions terminées: {{this.completedMissions}}
{{/each}}

Suggérez les agents les plus appropriés pour la mission. Donnez la priorité aux agents qui ont accompli le moins de missions pour assurer une bonne répartition du travail. Fournissez une brève justification pour chaque suggestion en français.

Formatez votre réponse sous la forme d'un tableau JSON d'objets, où chaque objet contient le nom de l'agent et la raison de sa suggestion.`,
});

const suggestAgentsForMissionFlow = ai.defineFlow(
  {
    name: 'suggestAgentsForMissionFlow',
    inputSchema: SuggestAgentsForMissionInputSchema,
    outputSchema: SuggestAgentsForMissionOutputSchema,
  },
  async input => {
    const {output} = await suggestAgentsPrompt(input);
    return output!;
  }
);
