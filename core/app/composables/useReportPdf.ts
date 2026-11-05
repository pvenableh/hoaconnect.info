// Draw a `ReportDoc` (core/shared/reporting/report-pdf.ts) to a PDF and save it.
//
// jsPDF + jspdf-autotable are imported lazily inside `downloadReportPdf`, so
// neither reaches SSR or the initial bundle — the ~350 KB only loads when a
// board actually clicks "PDF". Vector text and tables (no html2canvas
// screenshot): the file is small, selectable, and prints crisply.

import type { ReportDoc } from "#core/shared/reporting/report-pdf";

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];

export function useReportPdf() {
  const busy = ref(false);

  async function downloadReportPdf(doc: ReportDoc): Promise<void> {
    if (!import.meta.client || busy.value) return;
    busy.value = true;
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 48;
      let y = margin;

      pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
      pdf.text(doc.title, margin, y);
      y += 18;
      pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
      pdf.text(doc.subtitle, margin, y);
      y += 24;

      // KPI row — evenly spaced label / value pairs.
      const colW = (pageW - margin * 2) / Math.max(doc.kpis.length, 1);
      doc.kpis.forEach((k, idx) => {
        const x = margin + idx * colW;
        pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
        pdf.text(k.label.toUpperCase(), x, y);
        pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
        pdf.text(k.value, x, y + 16);
      });
      y += 34;
      pdf.setDrawColor(...RULE).line(margin, y, pageW - margin, y);
      y += 20;

      for (const t of doc.tables) {
        if (y > pdf.internal.pageSize.getHeight() - 120) {
          pdf.addPage();
          y = margin;
        }
        pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
        pdf.text(t.title, margin, y);
        y += 8;

        if (!t.body.length) {
          pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
          pdf.text(t.emptyText, margin, y + 14);
          y += 36;
          continue;
        }

        const columnStyles: Record<number, { halign: "right" }> = {};
        for (const c of t.numeric) columnStyles[c] = { halign: "right" };
        autoTable(pdf, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [t.head],
          body: t.body,
          foot: t.foot ? [t.foot] : undefined,
          theme: "plain",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK },
          headStyles: { fontStyle: "bold", textColor: MUTED, lineWidth: { bottom: 0.5 }, lineColor: RULE },
          footStyles: { fontStyle: "bold", lineWidth: { top: 0.5 }, lineColor: RULE },
          columnStyles,
          showFoot: "lastPage",
        });
        y = ((pdf as any).lastAutoTable?.finalY ?? y) + 28;
      }

      const pages = pdf.getNumberOfPages();
      for (let p = 1; p <= pages; p += 1) {
        pdf.setPage(p);
        const h = pdf.internal.pageSize.getHeight();
        pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
        pdf.text(doc.footer, margin, h - 24);
        pdf.text(`Page ${p} of ${pages}`, pageW - margin, h - 24, { align: "right" });
      }

      pdf.save(doc.filename);
    } finally {
      busy.value = false;
    }
  }

  return { busy, downloadReportPdf };
}
