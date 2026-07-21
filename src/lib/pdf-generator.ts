import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Helper to preload multiple images safely
function preloadImages(urls: string[], callback: (images: (HTMLImageElement | null)[]) => void) {
  let loadedCount = 0;
  const results: (HTMLImageElement | null)[] = new Array(urls.length).fill(null);
  
  if (urls.length === 0) {
    callback([]);
    return;
  }
  
  urls.forEach((url, index) => {
    if (!url) {
      loadedCount++;
      if (loadedCount === urls.length) {
        callback(results);
      }
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      results[index] = img;
      loadedCount++;
      if (loadedCount === urls.length) {
        callback(results);
      }
    };
    img.onerror = () => {
      console.error(`Error loading image: ${url}`);
      loadedCount++;
      if (loadedCount === urls.length) {
        callback(results);
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
  doc.text(`Abidjan, le ${new Date().toLocaleDateString('fr-FR')}`, 135, sigY);

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

export function generateOrdreDeMissionPDF(mission: any, agents: any[], vehiclePlate?: string) {
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

    // Mission Information Box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 66 + yShift, 180, 42, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 66 + yShift, 180, 42, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    
    // Labels
    doc.text('Objet de la mission :', 18, 73 + yShift);
    doc.text('Lieu de destination :', 18, 80 + yShift);
    doc.text('Date de début :', 18, 87 + yShift);
    doc.text('Date de fin :', 18, 94 + yShift);
    doc.text('Moyen de transport :', 18, 101 + yShift);

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

    // Assigned Agents Section Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('LISTE DES AGENTS DÉSIGNÉS POUR LA MISSION', 15, 116 + yShift);

    // Assigned Agents Table
    const tableBody = agents.map((agent, index) => [
      (index + 1).toString(),
      agent.registrationNumber || 'N/A',
      agent.rank || 'Agent',
      agent.fullName || 'N/A',
      agent.contact || 'N/A'
    ]);

    (doc as any).autoTable({
      startY: 120 + yShift,
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
    const noticeText = "Il est enjoint aux agents désignés de se conformer strictement aux instructions de la présente feuille d'ordre et de veiller au bon déroulement des opérations dans le respect des consignes de sécurité. Les autorités de police et de gendarmerie sont priées de prêter assistance et faciliter leur déplacement si nécessaire.";
    const lines = doc.splitTextToSize(noticeText, 180);
    doc.text(lines, 15, finalY);

    // Signatures
    drawSignatureBlock(doc, 'LE CHEF DE DETACHEMENT', finalY + lines.length * 3.5, stampImg || undefined);

    // Save the PDF file
    doc.save(`Ordre_de_Mission_${mission.name.replace(/\s+/g, '_')}.pdf`);
  };

  preloadImages(
    ['https://i.ibb.co/FL7ZKgSp/ent-te.png', 'https://i.ibb.co/5X97N1HF/signature.jpg'],
    ([headerImg, stampImg]) => {
      generatePDF(headerImg, stampImg);
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
    doc.rect(15, 74 + yShift, 180, 32, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 74 + yShift, 180, 32, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    doc.text('Nom & Prénoms :', 18, 81 + yShift);
    doc.text('Matricule :', 18, 88 + yShift);
    doc.text('Grade / Section :', 18, 95 + yShift);
    doc.text('Contact :', 18, 102 + yShift);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(agent?.fullName || demande.agentName || 'N/A', 52, 81 + yShift);
    doc.text(agent?.registrationNumber || 'N/A', 52, 88 + yShift);
    doc.text(`${agent?.rank || 'Agent'} / ${agent?.section || 'Non assigné'}`, 52, 95 + yShift);
    doc.text(agent?.contact || 'N/A', 52, 102 + yShift);


    // Absence Information Section Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 43, 76);
    doc.text('II. MODALITÉS DE L\'ABSENCE', 15, 114 + yShift);

    // Absence Info Box
    doc.setFillColor(250, 250, 250);
    doc.rect(15, 117 + yShift, 180, 44, 'F');
    doc.rect(15, 117 + yShift, 180, 44, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(26, 43, 76);
    doc.text('Nature du congé :', 18, 124 + yShift);
    doc.text('Date de début :', 18, 131 + yShift);
    doc.text('Date de fin :', 18, 138 + yShift);
    doc.text('Motif :', 18, 145 + yShift);
    doc.text('Statut décisionnel :', 18, 152 + yShift);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    doc.text(demande.type || 'Permission exceptionnelle', 52, 124 + yShift);

    const formattedStartDate = demande.startDate?.toDate ? demande.startDate.toDate().toLocaleDateString('fr-FR') : new Date(demande.startDate).toLocaleDateString('fr-FR');
    const formattedEndDate = demande.endDate?.toDate ? demande.endDate.toDate().toLocaleDateString('fr-FR') : new Date(demande.endDate).toLocaleDateString('fr-FR');

    doc.text(formattedStartDate, 52, 131 + yShift);
    doc.text(formattedEndDate, 52, 138 + yShift);
    doc.text(demande.reason || 'N/A', 52, 145 + yShift);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(0, 158, 96); // Green for Accepted
    doc.text('AUTORISÉ', 52, 152 + yShift);


    // Administrative note
    const finalY = 171 + yShift;
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
    ['https://i.ibb.co/FL7ZKgSp/ent-te.png', 'https://i.ibb.co/5X97N1HF/signature.jpg'],
    ([headerImg, stampImg]) => {
      generatePDF(headerImg, stampImg);
    }
  );
}

export function generateFicheAgentPDF(agent: any, missions: any[], explications: any[] = []) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const generatePDF = (headerImg: HTMLImageElement | null, photoImg: HTMLImageElement | null) => {
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
    doc.rect(15, 74 + yShift, 180, 50, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.rect(15, 74 + yShift, 180, 50, 'D');

    if (photoImg) {
      try {
        doc.addImage(photoImg, 'JPEG', 152, 79 + yShift, 36, 40);
        // Draw border around photo
        doc.setDrawColor(200, 200, 200);
        doc.rect(152, 79 + yShift, 36, 40, 'D');
      } catch (err) {
        console.error("Error adding photo to agent PDF", err);
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
      (doc as any).autoTable({
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
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 15 : 180 + yShift;
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Document officiel généré par le système d\'administration sBSSI.', 15, finalY);

    // Save PDF
    doc.save(`Fiche_Technique_${agent.fullName.replace(/\s+/g, '_')}.pdf`);
  };

  preloadImages(
    ['https://i.ibb.co/FL7ZKgSp/ent-te.png', agent.photo || ''],
    ([headerImg, photoImg]) => {
      generatePDF(headerImg, photoImg);
    }
  );
}
