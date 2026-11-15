/**
 * Draw the register's PDF (`registerPdfDoc`, core/shared/responsibilities/views.ts)
 * on the server, in the look of the Finances report (core/app/composables/useReportPdf.ts):
 * vector text, one table per category, the as-of date under the title, and
 * the as-of date and page number on every page. jsPDF is imported lazily, so
 * only the export route pays for it.
 */
import type { RegisterPdfDoc } from "#core/shared/responsibilities/views";

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];

export async function renderRegisterPdf(doc: RegisterPdfDoc): Promise<Buffer> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin + 4;

  pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
  pdf.text(doc.title, margin, y);
  y += 18;
  pdf.setFont("helvetica", "normal").setFontSize(11).setTextColor(...MUTED);
  pdf.text(doc.subtitle, margin, y);
  y += 14;
  pdf.setDrawColor(...RULE).line(margin, y, pageW - margin, y);
  y += 22;

  for (const section of doc.sections) {
    if (y > pageH - 110) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK);
    pdf.text(section.title, margin, y);
    y += 8;
    if (!section.body.length) {
      pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
      pdf.text("No jobs listed.", margin, y + 14);
      y += 36;
      continue;
    }
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 48 },
      head: [doc.head],
      body: section.body,
      theme: "plain",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK, overflow: "linebreak", valign: "top" },
      headStyles: { fontStyle: "bold", textColor: MUTED, lineWidth: { bottom: 0.5 }, lineColor: RULE },
      bodyStyles: { lineWidth: { bottom: 0.25 }, lineColor: RULE },
      columnStyles: { 0: { cellWidth: 230 }, 1: { cellWidth: 220 }, 2: { cellWidth: 70 }, 3: { cellWidth: 110 } },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 26;
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    pdf.text(`${doc.subtitle} · ${doc.footer}`, margin, pageH - 22);
    pdf.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 22, { align: "right" });
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
