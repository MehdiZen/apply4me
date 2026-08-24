import { jsPDF } from 'jspdf';

// Génère un PDF textuel (texte sélectionnable, pas une image) de la lettre,
// et déclenche le téléchargement. Appelé depuis le popup.
export function downloadCoverLetterPDF(text: string, filename = 'lettre-de-motivation.pdf'): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const lineH = 18;

  doc.setFont('times', 'normal');
  doc.setFontSize(12);

  let y = margin;
  for (const para of text.split(/\n/)) {
    if (para.trim() === '') { y += lineH; continue; }
    const lines = doc.splitTextToSize(para, maxW) as string[];
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineH;
    }
  }

  doc.save(filename);
}
