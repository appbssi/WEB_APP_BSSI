'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a summary of a completed mission.
 *
 * It includes the flow definition, input and output schemas, and a wrapper function.
 * - generateMissionSummary - A function that handles the mission summary generation.
 * - GenerateMissionSummaryInput - The input type for the generateMissionSummary function.
 * - GenerateMissionSummaryOutput - The return type for the generateMissionSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMissionSummaryInputSchema = z.object({
  missionDetails: z
    .string()
    .describe('Detailed information about the mission, including objectives, timeline, and agents involved.'),
  agentPerformances: z
    .string()
    .describe('Information on the performance of each agent involved in the mission.'),
  keyEvents: z.string().describe('A description of the key events during the mission.'),
  outcomes: z.string().describe('A description of the outcomes of the mission.'),
});
export type GenerateMissionSummaryInput = z.infer<typeof GenerateMissionSummaryInputSchema>;

const GenerateMissionSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the mission, highlighting key events, outcomes, and agent performance.'),
});
export type GenerateMissionSummaryOutput = z.infer<typeof GenerateMissionSummaryOutputSchema>;

export async function generateMissionSummary(input: GenerateMissionSummaryInput): Promise<GenerateMissionSummaryOutput> {
  return generateMissionSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMissionSummaryPrompt',
  input: {schema: GenerateMissionSummaryInputSchema},
  output: {schema: GenerateMissionSummaryOutputSchema},
  prompt: `You are an expert mission summarizer. Based on the details provided, create a concise summary of the mission, highlighting key events, outcomes, and agent performance.

Mission Details: {{{missionDetails}}}
Agent Performances: {{{agentPerformances}}}
Key Events: {{{keyEvents}}}
Outcomes: {{{outcomes}}}`,
});

const generateMissionSummaryFlow = ai.defineFlow(
  {
    name: 'generateMissionSummaryFlow',
    inputSchema: GenerateMissionSummaryInputSchema,
    outputSchema: GenerateMissionSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
