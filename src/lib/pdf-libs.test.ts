import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Vérifie le contrat utilisé partout dans l'application avec jsPDF 4 / jspdf-autotable 5 :
// autoTable(doc, …) dessine le tableau et renseigne doc.lastAutoTable.finalY.
describe('génération de tableaux PDF', () => {
  it('autoTable fonctionne en appel de fonction et chaîne deux tableaux', () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    autoTable(doc, { startY: 25, head: [['Désignation', 'Quantité']], body: [['Arme', '2'], ['Munitions', '120']] });
    const firstY = (doc as any).lastAutoTable.finalY;
    expect(firstY).toBeGreaterThan(25);

    autoTable(doc, { startY: firstY + 10, head: [['Agent']], body: [['Agent Test']] });
    expect((doc as any).lastAutoTable.finalY).toBeGreaterThan(firstY);

    const pdf = doc.output('arraybuffer');
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
