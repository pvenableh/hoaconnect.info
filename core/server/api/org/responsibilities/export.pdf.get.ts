/**
 * GET /api/org/responsibilities/export.pdf?orgId=&asOf= — the register as the
 * document handed to the board: grouped by category, Job · Who · Cadence ·
 * Basis · Last verified, an empty Who as an empty cell, the as-of date in the
 * header. Editors and the board.
 */
import { requireOrgParam, requireResponsibilitiesRead } from "#core/server/utils/responsibility-access";
import { asOfParam, loadOrgSwitches, loadRegister } from "#core/server/utils/responsibilities";
import { renderRegisterPdf } from "#core/server/utils/register-pdf";
import { registerPdfDoc } from "#core/shared/responsibilities/views";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgParam(getQuery(event).orgId);
  await requireResponsibilitiesRead(event, orgId);
  const asOf = asOfParam(event);
  const [rows, org] = await Promise.all([loadRegister(orgId, asOf), loadOrgSwitches(orgId)]);
  const doc = registerPdfDoc(rows, asOf, org.name, new Date().toISOString());
  const pdf = await renderRegisterPdf(doc);
  setHeader(event, "Content-Type", "application/pdf");
  setHeader(event, "Content-Disposition", `attachment; filename="${doc.filename}"`);
  setHeader(event, "Cache-Control", "private, no-store");
  return pdf;
});
