import { jsPDF } from 'jspdf';
// jspdf-autotable v5 ne s'ajoute plus automatiquement à jsPDF : on l'appelle comme une fonction
import autoTable from 'jspdf-autotable';

// Direct link for the PDF header banner image (can be changed to any direct image URL)
export const PDF_HEADER_IMAGE_URL = 'https://i.ibb.co/FL7ZKgSp/ent-te.png';

// En-tête propre à l'ordre de mission
export const ORDRE_MISSION_HEADER_IMAGE_URL = 'https://i.ibb.co/239NPVqw/ent-te.png';

// Direct link for the signature stamp image
export const PDF_STAMP_IMAGE_URL = 'https://i.ibb.co/5X97N1HF/signature.jpg';

// Helper to preload multiple images safely with timeout fallback
function preloadImages(urls: string[], callback: (images: (HTMLImageElement | null)[]) => void) {
  let loadedCount = 0;
  let isDone = false;
  const results: (HTMLImageElement | null)[] = new Array(urls.length).fill(null);
  
  const finish = () => {
    if (!isDone) {
      isDone = true;
      callback(results);
    }
  };

  // Safety fallback timeout after 3 seconds in case network stalls
  const timeoutId = setTimeout(() => {
    finish();
  }, 3000);

  if (urls.length === 0) {
    clearTimeout(timeoutId);
    finish();
    return;
  }
  
  urls.forEach((url, index) => {
    if (!url) {
      loadedCount++;
      if (loadedCount === urls.length) {
        clearTimeout(timeoutId);
        finish();
      }
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      results[index] = img;
      loadedCount++;
      if (loadedCount === urls.length) {
        clearTimeout(timeoutId);
        finish();
      }
    };
    img.onerror = () => {
      console.warn(`Could not load PDF asset: ${url}`);
      loadedCount++;
      if (loadedCount === urls.length) {
        clearTimeout(timeoutId);
        finish();
      }
    };
    img.src = url;
  });
}

// Helper to draw Côte d'Ivoire emblem and sBSSI logo in PDF
function drawHeader(doc: jsPDF, headerImg?: HTMLImageElement | null) {
  if (headerImg) {
    const imgWidth = 180;
    const imgHeight = headerImg.naturalWidth ? (headerImg.naturalHeight / headerImg.naturalWidth) * imgWidth : 58.17;
    doc.addImage(headerImg, 'PNG', 15, 5, imgWidth, imgHeight);
    return;
  }

  // --- LEFT HEADER: sBSSI Logo ---
  // Dark navy shield body
  doc.setFillColor(26, 43, 76);
  doc.rect(15, 15, 14, 10, 'F');
  doc.triangle(15, 25, 29, 25, 22, 29, 'F');

  // National colors mini band in the shield
  doc.setFillColor(247, 127, 0); // Orange
  doc.rect(18, 18, 2.5, 5, 'F');
  doc.setFillColor(255, 255, 255); // White
  doc.rect(20.5, 18, 2.5, 5, 'F');
  doc.setFillColor(0, 158, 96); // Green
  doc.rect(23, 18, 2.5, 5, 'F');

  // Text sBSSI
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(26, 43, 76);
  doc.text('sBSSI', 34, 21);

  // Subtitle
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('SÉCURITÉ & INTERVENTION', 34, 25);
  doc.text('RÉPUBLIQUE DE CÔTE D\'IVOIRE', 34, 28);


  // --- RIGHT HEADER: Côte d'Ivoire Emblem ---
  const rightX = 150;
  
  // Côte d'Ivoire flag
  doc.setFillColor(247, 127, 0); // Orange
  doc.rect(rightX + 15, 14, 7, 11, 'F');
  doc.setFillColor(255, 255, 255); // White
  doc.rect(rightX + 22, 14, 7, 11, 'F');
  doc.setFillColor(0, 158, 96); // Green
  doc.rect(rightX + 29, 14, 7, 11, 'F');

  // Golden Shield with Elephant outline inside the flag
  doc.setFillColor(218, 165, 32); // Golden rod
  doc.ellipse(rightX + 25.5, 19.5, 4.5, 3.5, 'F');
  
  // Mini Elephant trunk drawing (vector lines)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.line(rightX + 24, 19.5, rightX + 25.5, 21.5);
  doc.line(rightX + 25.5, 21.5, rightX + 27, 19.5);

  // Republic texts
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('RÉPUBLIQUE DE CÔTE D\'IVOIRE', rightX - 10, 29);
  
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text('Union - Discipline - Travail', rightX + 4, 33);


  // --- HEADER SEPARATOR LINE ---
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(15, 37, 195, 37);

  // A tiny colored accent line under the separator
  doc.setFillColor(247, 127, 0); // Orange
  doc.rect(15, 37.5, 60, 0.5, 'F');
  doc.setFillColor(0, 158, 96); // Green
  doc.rect(135, 37.5, 60, 0.5, 'F');
}

// Function to draw signature and stamp
function drawSignatureBlock(doc: jsPDF, title: string, startY: number, stampImage?: HTMLImageElement) {
  const sigY = startY + 12;

  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Tengréla le ${new Date().toLocaleDateString('fr-FR')}`, 135, sigY);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 43, 76);
  doc.text(title, 135, sigY + 6);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Signature & Cachet autorisés', 135, sigY + 10);

  if (stampImage) {
    // Draw the actual image stamp, preserving the aspect ratio to avoid distortion
    const imgWidth = 60.5; // Increased by 10% (originally 55)
    const imgHeight = stampImage.naturalWidth ? (stampImage.naturalHeight / stampImage.naturalWidth) * imgWidth : 33;
    doc.addImage(stampImage, 'JPEG', 125, sigY + 12, imgWidth, imgHeight);
  } else {
    // Draw simulated stamp/seal (circle with text inside)
    const stampX = 155;
    const stampY = sigY + 25;
    doc.setDrawColor(26, 82, 118); // Blue/Navy stamp ink
    doc.setLineWidth(0.8);
    doc.circle(stampX, stampY, 12, 'D');
    doc.circle(stampX, stampY, 10, 'D');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(26, 82, 118);
    doc.text('ADMINISTRATION', stampX - 8, stampY - 3);
    doc.text('★ sBSSI ★', stampX - 5, stampY + 1.5);
    doc.text('DIRECTION GEN', stampX - 8, stampY + 5.5);

    // Draw handwritten signature-style line
    doc.setDrawColor(26, 43, 76);
    doc.setLineWidth(0.5);
    doc.line(135, sigY + 16, 150, sigY + 15);
    doc.line(150, sigY + 15, 142, sigY + 22);
    doc.line(142, sigY + 22, 168, sigY + 14);
  }
}

export function generateOrdreDeMissionPDF(mission: any, agents: any[], vehiclePlate?: string, leaderId?: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const generatePDF = (headerImg: HTMLImageElement | null) => {
    // Header
    drawHeader(doc, headerImg);

    // Apply yShift if header image was successfully loaded
    const yShift = headerImg ? 25 : 0;

    // Document Title Section
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 43 + yShift, 180, 14, 'F');
    doc.setDrawColor(26, 43, 76);
    doc.setLineWidth(0.6);
    doc.rect(15, 43 + yShift, 180, 14, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(26, 43, 76);
    doc.text('ORDRE DE MISSION', 105, 52 + yShift, { align: 'center' });

    // Document Ref Number
    const randomRef = Math.random().toString(36).substring(2, 6).toUpperCase();
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Réf : OM-2026-${randomRef}`, 15, 63 + yShift);

    const effectiveLeaderId = leaderId || mission.leaderId || mission.chefDeMissionId;
    const leaderAgent = agents.find(a => a.id === effectiveLeaderId);
    const boxHeight = leaderAgent ? 48 : 42;

    // Mission Information Box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 66 + yShift, 180, boxHeight, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 66 + yShift, 180, boxHeight, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    
    // Labels
    doc.text('Objet de la mission :', 18, 73 + yShift);
    doc.text('Lieu de destination :', 18, 80 + yShift);
    doc.text('Date de début :', 18, 87 + yShift);
    doc.text('Date de fin :', 18, 94 + yShift);
    doc.text('Moyen de transport :', 18, 101 + yShift);
    if (leaderAgent) {
      doc.text('Chef de mission :', 18, 108 + yShift);
    }

    // Values
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(mission.name || 'N/A', 58, 73 + yShift);
    doc.text(mission.location || 'N/A', 58, 80 + yShift);
    
    const formattedStartDate = mission.startDate?.toDate ? mission.startDate.toDate().toLocaleDateString('fr-FR') : new Date(mission.startDate).toLocaleDateString('fr-FR');
    const formattedEndDate = mission.endDate?.toDate ? mission.endDate.toDate().toLocaleDateString('fr-FR') : new Date(mission.endDate).toLocaleDateString('fr-FR');
    
    const startTimeStr = mission.startTime ? ` à ${mission.startTime}` : '';
    const endTimeStr = mission.endTime ? ` à ${mission.endTime}` : '';

    doc.text(`${formattedStartDate}${startTimeStr}`, 58, 87 + yShift);
    doc.text(`${formattedEndDate}${endTimeStr}`, 58, 94 + yShift);
    doc.text(vehiclePlate ? `Véhicule de service (Immatriculation: ${vehiclePlate})` : 'Aucun véhicule officiel assigné', 58, 101 + yShift);
    
    if (leaderAgent) {
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(26, 43, 76);
      doc.text(`${leaderAgent.fullName} (${leaderAgent.rank || 'Agent'})`, 58, 108 + yShift);
    }

    const tableStartY = 116 + (leaderAgent ? 6 : 0) + yShift;

    // Assigned Agents Section Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('LISTE DES AGENTS DÉSIGNÉS POUR LA MISSION', 15, tableStartY);

    // Assigned Agents Table
    const tableBody = agents.map((agent, index) => {
      const isLeader = agent.id === effectiveLeaderId;
      return [
        (index + 1).toString(),
        agent.registrationNumber || 'N/A',
        agent.rank || 'Agent',
        `${agent.fullName || 'N/A'}${isLeader ? ' (Chef de Mission)' : ''}`,
        agent.contact || 'N/A'
      ];
    });

    autoTable(doc, {
      startY: tableStartY + 4,
      head: [['N°', 'Matricule', 'Grade', 'Nom Complet', 'Contact']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [26, 43, 76],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center',
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 74 },
        4: { cellWidth: 40 },
      },
    });

    // Final text notice
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const noticeText = "Il est enjoint aux agents désignés de se conformer strictly aux instructions de la présente feuille d'ordre et de veiller au bon déroulement des opérations dans le respect des consignes de sécurité. Les autorités de police et de gendarmerie sont priées de prêter assistance et faciliter leur déplacement si nécessaire.";
    const lines = doc.splitTextToSize(noticeText, 180);
    doc.text(lines, 15, finalY);

    // Pas de signature ni de cachet sur l'ordre de mission : seulement le lieu et la date
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Tengréla le ${new Date().toLocaleDateString('fr-FR')}`, 135, finalY + lines.length * 3.5 + 12);

    // Save the PDF file
    doc.save(`Ordre_de_Mission_${mission.name.replace(/\s+/g, '_')}.pdf`);
  };

  preloadImages(
    [ORDRE_MISSION_HEADER_IMAGE_URL],
    ([headerImg]) => {
      generatePDF(headerImg);
    }
  );
}

export function generateAutorisationAbsencePDF(demande: any, agent: any) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const generatePDF = (headerImg: HTMLImageElement | null, stampImg: HTMLImageElement | null) => {
    // Header
    drawHeader(doc, headerImg);

    // Apply yShift if header image was successfully loaded
    const yShift = headerImg ? 25 : 0;

    // Document Title Section
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 43 + yShift, 180, 14, 'F');
    doc.setDrawColor(0, 158, 96); // Green highlight border
    doc.setLineWidth(0.6);
    doc.rect(15, 43 + yShift, 180, 14, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 158, 96);
    doc.text('DÉCISION D\'AUTORISATION D\'ABSENCE', 105, 52 + yShift, { align: 'center' });

    // Document Ref Number
    const randomRef = Math.random().toString(36).substring(2, 6).toUpperCase();
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Réf : AA-2026-${randomRef}`, 15, 63 + yShift);

    // Agent Information Section Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('I. IDENTIFICATION DE L\'AGENT', 15, 71 + yShift);

    // Agent Info Box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 74 + yShift, 180, 38, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 74 + yShift, 180, 38, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    doc.text('Nom & Prénoms :', 18, 81 + yShift);
    doc.text('Matricule :', 18, 88 + yShift);
    doc.text('Grade :', 18, 95 + yShift);
    doc.text('Section / Détachement :', 18, 102 + yShift);
    doc.text('Contact :', 18, 109 + yShift);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(agent?.fullName || demande.agentName || 'N/A', 62, 81 + yShift);
    doc.text(agent?.registrationNumber || 'N/A', 62, 88 + yShift);
    doc.text(agent?.rank || 'Agent', 62, 95 + yShift);
    doc.text(agent?.section || 'Non assigné', 62, 102 + yShift);
    doc.text(agent?.contact || 'N/A', 62, 109 + yShift);


    // Absence Information Section Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('II. MODALITÉS DE L\'ABSENCE', 15, 120 + yShift);

    // Absence Info Box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 123 + yShift, 180, 44, 'F');
    doc.rect(15, 123 + yShift, 180, 44, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    doc.text('Nature du congé :', 18, 130 + yShift);
    doc.text('Date de début :', 18, 137 + yShift);
    doc.text('Date de fin :', 18, 144 + yShift);
    doc.text('Motif :', 18, 151 + yShift);
    doc.text('Statut décisionnel :', 18, 158 + yShift);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(demande.type || 'Permission exceptionnelle', 62, 130 + yShift);

    const formattedStartDate = demande.startDate?.toDate ? demande.startDate.toDate().toLocaleDateString('fr-FR') : new Date(demande.startDate).toLocaleDateString('fr-FR');
    const formattedEndDate = demande.endDate?.toDate ? demande.endDate.toDate().toLocaleDateString('fr-FR') : new Date(demande.endDate).toLocaleDateString('fr-FR');

    doc.text(formattedStartDate, 62, 137 + yShift);
    doc.text(formattedEndDate, 62, 144 + yShift);
    doc.text(demande.reason || 'N/A', 62, 151 + yShift);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(0, 158, 96); // Green for Accepted
    doc.text('AUTORISÉ', 62, 158 + yShift);


    // Administrative note
    const finalY = 175 + yShift;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const noticeText = "En foi de quoi, la présente autorisation d'absence lui est délivrée pour valoir ce que de droit. L'intéressé est tenu de reprendre le service dès l'expiration de la période de congé ou de permission accordée. Tout dépassement non justifié fera l'objet de sanctions disciplinaires.";
    const lines = doc.splitTextToSize(noticeText, 180);
    doc.text(lines, 15, finalY);

    // Signatures
    drawSignatureBlock(doc, 'LE CHEF DE DETACHEMENT', finalY + lines.length * 3.5, stampImg || undefined);

    // Save the PDF
    doc.save(`Autorisation_Absence_${(agent?.fullName || demande.agentName || 'Agent').replace(/\s+/g, '_')}.pdf`);
  };

  preloadImages(
    [PDF_HEADER_IMAGE_URL, PDF_STAMP_IMAGE_URL],
    ([headerImg, stampImg]) => {
      generatePDF(headerImg, stampImg);
    }
  );
}

export async function generateFicheAgentPDF(agent: any, missions: any[], explications: any[] = []) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let qrDataUrl = '';
  try {
    const { generateAgentQRCodeDataURL } = await import('./agent-qrcode');
    qrDataUrl = await generateAgentQRCodeDataURL(agent, { size: 300 });
  } catch (err) {
    console.warn('Could not generate agent QR code for fiche PDF:', err);
  }

  const generatePDF = (headerImg: HTMLImageElement | null, photoImg: HTMLImageElement | null, stampImg: HTMLImageElement | null) => {
    // Header
    drawHeader(doc, headerImg);

    // Apply yShift if header image was successfully loaded
    const yShift = headerImg ? 25 : 0;

    // Document Title Section
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 43 + yShift, 180, 14, 'F');
    doc.setDrawColor(26, 43, 76);
    doc.setLineWidth(0.6);
    doc.rect(15, 43 + yShift, 180, 14, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(26, 43, 76);
    doc.text('FICHE TECHNIQUE DE L\'AGENT', 105, 52 + yShift, { align: 'center' });

    // Document Ref Number / Date
    const dateStr = new Date().toLocaleDateString('fr-FR');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`Éditée le : ${dateStr}`, 15, 63 + yShift);
    doc.text(`Matricule : ${agent.registrationNumber || 'N/A'}`, 195, 63 + yShift, { align: 'right' });

    // Section I: Identification de l'Agent
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('I. ÉTAT CIVIL ET SITUATION ADMINISTRATIVE', 15, 71 + yShift);

    // Agent info grid box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 74 + yShift, 180, 52, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 74 + yShift, 180, 52, 'D');

    if (photoImg) {
      try {
        doc.addImage(photoImg, 'JPEG', 156, 78 + yShift, 34, 42);
        doc.setDrawColor(200, 200, 200);
        doc.rect(156, 78 + yShift, 34, 42, 'D');
      } catch (err) {
        console.error("Error adding photo to agent PDF", err);
      }
      if (qrDataUrl) {
        try {
          doc.addImage(qrDataUrl, 'PNG', 124, 82 + yShift, 27, 27);
          doc.setDrawColor(220, 220, 220);
          doc.rect(124, 82 + yShift, 27, 27, 'D');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(26, 43, 76);
          doc.text('QR IDENTIFIANT', 137.5, 113 + yShift, { align: 'center' });
        } catch (err) {
          console.error("Error adding QR to agent PDF", err);
        }
      }
    } else if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', 154, 78 + yShift, 36, 36);
        doc.setDrawColor(220, 220, 220);
        doc.rect(154, 78 + yShift, 36, 36, 'D');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(26, 43, 76);
        doc.text('CODE QR OFFICIEL', 172, 118 + yShift, { align: 'center' });
      } catch (err) {
        console.error("Error adding QR to agent PDF", err);
      }
    }

    const textX = 18;
    const valueX = 58;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    doc.text('Nom & Prénoms :', textX, 81 + yShift);
    doc.text('Grade :', textX, 88 + yShift);
    doc.text('Section assignée :', textX, 95 + yShift);
    doc.text('Statut d\'activité :', textX, 102 + yShift);
    doc.text('Contact :', textX, 109 + yShift);
    doc.text('Adresse de résidence :', textX, 116 + yShift);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(agent.fullName || 'N/A', valueX, 81 + yShift);
    doc.text(agent.rank || 'N/A', valueX, 88 + yShift);
    doc.text((agent.section || 'Non assigné').toUpperCase(), valueX, 95 + yShift);
    doc.text(agent.availability || 'N/A', valueX, 102 + yShift);
    doc.text(agent.contact || 'N/A', valueX, 109 + yShift);
    doc.text(agent.address || 'N/A', valueX, 116 + yShift);

    // Section II: Registre d'Activité (Missions)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('II. HISTORIQUE, DOSSIER DISCIPLINAIRE ET STATISTIQUES', 15, 134 + yShift);

    // Quick Stats Box (increased height from 10 to 16 for additional stats lines)
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 137 + yShift, 180, 16, 'F');
    doc.rect(15, 137 + yShift, 180, 16, 'D');

    const totalExplications = explications.length;
    const totalSanctions = explications.filter((e: any) => e.status === 'sanctionne').length;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(26, 43, 76);
    doc.text(`Nombre total de missions accomplies ou planifiées : ${agent.missionCount || missions.length || 0}`, 18, 142.5 + yShift);
    doc.text(`Demandes d'explication envoyées : ${totalExplications}`, 18, 148.5 + yShift);
    doc.text(`Sanctions reçues : ${totalSanctions}`, 115, 148.5 + yShift);

    // Table of missions
    const tableData = missions.map((m, index) => {
      const startStr = m.startDate?.toDate ? m.startDate.toDate().toLocaleDateString('fr-FR') : new Date(m.startDate).toLocaleDateString('fr-FR');
      const endStr = m.endDate?.toDate ? m.endDate.toDate().toLocaleDateString('fr-FR') : new Date(m.endDate).toLocaleDateString('fr-FR');
      
      // Determine display status
      let status = m.displayStatus || 'N/A';
      if (m.startDate && m.endDate) {
        const start = m.startDate.toDate ? m.startDate.toDate() : new Date(m.startDate);
        const end = m.endDate.toDate ? m.endDate.toDate() : new Date(m.endDate);
        const now = new Date();
        if (now < start) {
          status = 'Planifiée';
        } else if (now > end) {
          status = 'Terminée';
        } else {
          status = 'En cours';
        }
      }

      return [
        (index + 1).toString(),
        m.name || 'N/A',
        m.location || 'N/A',
        `${startStr} au ${endStr}`,
        status
      ];
    });

    if (tableData.length > 0) {
      autoTable(doc, {
        startY: 157 + yShift,
        head: [['N°', 'Libellé de la Mission', 'Lieu', 'Période', 'Statut']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [26, 43, 76], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
        margin: { left: 15, right: 15 },
        styles: { cellPadding: 2 }
      });
    } else {
      doc.setFillColor(252, 252, 252);
      doc.rect(15, 157 + yShift, 180, 15, 'F');
      doc.rect(15, 157 + yShift, 180, 15, 'D');
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text('Aucun enregistrement de mission pour cet agent.', 20, 166 + yShift);
    }

    // Footer Administrative Note
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 12 : 180 + yShift;
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Document officiel généré par le système d\'administration sBSSI.', 15, finalY);

    // Signatures with Cachet and Stamp
    drawSignatureBlock(doc, 'LE CHEF DE DETACHEMENT', finalY, stampImg || undefined);

    // Save PDF
    doc.save(`Fiche_Technique_${agent.fullName ? agent.fullName.replace(/\s+/g, '_') : 'Agent'}.pdf`);
  };

  preloadImages(
    [PDF_HEADER_IMAGE_URL, agent.photo || '', PDF_STAMP_IMAGE_URL],
    ([headerImg, photoImg, stampImg]) => {
      generatePDF(headerImg, photoImg, stampImg);
    }
  );
}

/**
 * Generates an official printable identity badge for the agent (ISO/IEC 7810 ID-1 standard format: 85.6mm x 54mm)
 */
export async function generateAgentBadgeCardPDF(agent: any): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { generateAgentQRCodeDataURL } = await import('./agent-qrcode');

  const qrDataUrl = await generateAgentQRCodeDataURL(agent, { size: 360 });

  return new Promise<void>((resolve) => {
    preloadImages([agent.photo || '', PDF_STAMP_IMAGE_URL], ([photoImg]) => {
      // 85.6 x 53.98 mm (Standard ID Card format)
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [85.6, 54],
      });

      // Background Card styling
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 85.6, 54, 'F');

      // Top flag colors (CI: Orange, White, Green)
      doc.setFillColor(247, 127, 0); // Orange
      doc.rect(0, 0, 28.53, 2, 'F');
      doc.setFillColor(255, 255, 255); // White
      doc.rect(28.53, 0, 28.53, 2, 'F');
      doc.setFillColor(0, 158, 96); // Green
      doc.rect(57.06, 0, 28.54, 2, 'F');

      // Header Navy Banner
      doc.setFillColor(26, 43, 76);
      doc.rect(0, 2, 85.6, 9.5, 'F');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(255, 255, 255);
      doc.text("RÉPUBLIQUE DE CÔTE D'IVOIRE", 42.8, 5, { align: 'center' });
      doc.setFontSize(6.5);
      doc.text("BRIGADE SPÉCIALE DE SURVEILLANCE ET D'INTERVENTION", 42.8, 8, { align: 'center' });
      doc.setFontSize(4.5);
      doc.setTextColor(230, 230, 230);
      doc.text("CARTE D'IDENTIFICATION OFFICIELLE - sBSSI", 42.8, 10.5, { align: 'center' });

      // Left column: Agent Photo
      const photoX = 4;
      const photoY = 14;
      const photoW = 21;
      const photoH = 26;

      if (photoImg) {
        try {
          doc.addImage(photoImg, 'JPEG', photoX, photoY, photoW, photoH);
          doc.setDrawColor(26, 43, 76);
          doc.setLineWidth(0.3);
          doc.rect(photoX, photoY, photoW, photoH, 'D');
        } catch {
          doc.setFillColor(240, 240, 240);
          doc.rect(photoX, photoY, photoW, photoH, 'F');
        }
      } else {
        doc.setFillColor(245, 247, 250);
        doc.rect(photoX, photoY, photoW, photoH, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(photoX, photoY, photoW, photoH, 'D');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(150, 150, 150);
        doc.text('PHOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
      }

      // Middle column: Details
      const detailX = 27;
      let textY = 16.5;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text('NOM & PRÉNOMS :', detailX, textY);
      textY += 3.5;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(26, 43, 76);
      const displayName = doc.splitTextToSize((agent.fullName || 'AGENT').toUpperCase(), 35);
      doc.text(displayName, detailX, textY);
      textY += (displayName.length * 3.2) + 1;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text('GRADE :', detailX, textY);
      doc.setFontSize(6.5);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(agent.rank || 'N/A', detailX + 11, textY);
      textY += 3.5;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text('MATRICULE :', detailX, textY);
      doc.setFontSize(6.5);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(26, 43, 76);
      doc.text(agent.registrationNumber || 'N/A', detailX + 15, textY);
      textY += 3.5;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text('SECTION :', detailX, textY);
      doc.setFontSize(6);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text((agent.section || 'Non assigné').toUpperCase(), detailX + 12, textY);
      textY += 3.5;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(5);
      doc.setTextColor(120, 120, 120);
      doc.text('IDC UNIQUE :', detailX, textY);
      doc.setFontSize(6);
      doc.setFont('Courier', 'bold');
      doc.setTextColor(26, 43, 76);
      doc.text((agent.id || '').substring(0, 8).toUpperCase(), detailX + 14, textY);

      // Right column: QR Code
      const qrX = 63.5;
      const qrY = 14;
      const qrSize = 18;

      try {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.rect(qrX, qrY, qrSize, qrSize, 'D');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(4);
        doc.setTextColor(26, 43, 76);
        doc.text('SCAN IDENTIFICATION', qrX + qrSize / 2, qrY + qrSize + 2.5, { align: 'center' });
      } catch (err) {
        console.error('Error drawing QR on badge card:', err);
      }

      // Bottom Bar with Security & Emergency Contact
      doc.setFillColor(245, 247, 250);
      doc.rect(0, 45, 85.6, 9, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(0, 45, 85.6, 45);

      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(4.2);
      doc.setTextColor(100, 100, 100);
      doc.text('Carte strictement personnelle et réservée aux missions officielles.', 4, 48.5);
      doc.text(`Émise par le Commandement BSSI - Contact: ${agent.contact || '+225 00 00 00 00'}`, 4, 51.5);

      // Mini watermark badge
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(0, 158, 96);
      doc.text('● SÉCURISÉ BSSI', 82, 50, { align: 'right' });

      // Outer boundary cut mark
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.rect(0.2, 0.2, 85.2, 53.6, 'D');

      doc.save(`Badge_BSSI_${agent.registrationNumber || (agent.id || '').substring(0, 6)}_${(agent.fullName || 'Agent').replace(/\s+/g, '_')}.pdf`);
      resolve();
    });
  });
}

