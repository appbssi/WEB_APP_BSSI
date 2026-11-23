/**
 * Version « chargée à la demande » de pdf-generator.
 *
 * jsPDF et jspdf-autotable pèsent plusieurs centaines de kB. En passant par ces
 * fonctions, ils ne sont téléchargés qu'au moment où l'utilisateur génère un PDF,
 * et non plus au premier chargement de chaque page qui propose un export.
 */
type PdfModule = typeof import('./pdf-generator');

const loadPdf = (): Promise<PdfModule> => import('./pdf-generator');

export async function generateOrdreDeMissionPDF(
  ...args: Parameters<PdfModule['generateOrdreDeMissionPDF']>
): Promise<void> {
  const m = await loadPdf();
  m.generateOrdreDeMissionPDF(...args);
}

export async function generateAutorisationAbsencePDF(
  ...args: Parameters<PdfModule['generateAutorisationAbsencePDF']>
): Promise<void> {
  const m = await loadPdf();
  m.generateAutorisationAbsencePDF(...args);
}

export async function generateFicheAgentPDF(
  ...args: Parameters<PdfModule['generateFicheAgentPDF']>
): Promise<void> {
  const m = await loadPdf();
  await m.generateFicheAgentPDF(...args);
}

export async function generateAgentBadgeCardPDF(
  ...args: Parameters<PdfModule['generateAgentBadgeCardPDF']>
): Promise<void> {
  const m = await loadPdf();
  await m.generateAgentBadgeCardPDF(...args);
}
