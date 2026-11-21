/**
 * The signed copy of one signature, drawn on the server in the look of the
 * register PDF (register-pdf.ts): vector text, the form, the signer and the
 * audit trail. jsPDF is imported lazily so only this route pays for it.
 */
export interface SignedCopy {
  formTitle: string;
  description: string | null;
  memberName: string;
  signedName: string;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
}

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [229, 231, 235];

export async function renderSignedCopyPdf(c: SignedCopy): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const margin = 56;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  let y = margin + 4;

  pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
  for (const line of pdf.splitTextToSize(c.formTitle, width) as string[]) {
    pdf.text(line, margin, y);
    y += 22;
  }
  pdf.setFont("helvetica", "normal").setFontSize(11).setTextColor(...MUTED);
  pdf.text("Signed copy", margin, y);
  y += 14;
  pdf.setDrawColor(...RULE).line(margin, y, margin + width, y);
  y += 24;

  if (c.description) {
    pdf.setFontSize(11).setTextColor(...INK);
    const lines = pdf.splitTextToSize(c.description, width) as string[];
    pdf.text(lines, margin, y);
    y += lines.length * 14 + 18;
  }

  const row = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...MUTED);
    pdf.text(label.toUpperCase(), margin, y);
    y += 14;
    pdf.setFont("helvetica", "normal").setFontSize(12).setTextColor(...INK);
    const lines = pdf.splitTextToSize(value || "-", width) as string[];
    pdf.text(lines, margin, y);
    y += lines.length * 15 + 12;
  };
  row("Signed by (typed name)", c.signedName);
  if (c.memberName && c.memberName !== c.signedName) row("Member record", c.memberName);
  row("Signed at (UTC)", new Date(c.signedAt).toISOString().replace("T", " ").slice(0, 19));
  row("IP address", c.ip ?? "");
  row("Browser", c.userAgent ?? "");

  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  pdf.text("The typed name, time, IP address and browser were recorded by the server when the form was signed.", margin, y + 8, { maxWidth: width });
  return Buffer.from(pdf.output("arraybuffer"));
}
