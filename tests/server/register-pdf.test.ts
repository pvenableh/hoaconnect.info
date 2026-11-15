// @vitest-environment node
/**
 * The register's PDF renders on the server with jsPDF (core/server/utils/register-pdf.ts).
 * The document's contents are tested in responsibilities-routes.test.ts; this
 * proves the bytes are a PDF, with an empty category and an empty Who cell.
 */
import { describe, it, expect } from "vitest";
import { renderRegisterPdf } from "#core/server/utils/register-pdf";

describe("renderRegisterPdf", () => {
  it("draws a PDF", async () => {
    const buf = await renderRegisterPdf({
      title: "1033 Lenox — Who handles what",
      subtitle: "As of December 9, 2026",
      head: ["Job", "Who", "Cadence", "Basis", "Last verified"],
      sections: [
        { title: "Finance", body: [["Reconciles bank statements", "Treasurer (vacant)", "Monthly", "Unknown", "Never"], ["Pest control", "", "Monthly", "Unknown", "Never"]] },
        { title: "Building", body: [] },
      ],
      footer: "Generated 2026-11-15 · HOA Connect",
      filename: "responsibilities-1033-lenox-2026-12-09.pdf",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
