// GET /api/governing/audit — the audit trail of the organization's governing
// documents, newest first. Managers only. Query: `document`, `action`,
// `before` (the `next_before` of the page already shown). Read-only.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { listGoverningAudit } from "#core/server/utils/governing-audit";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const query = getQuery(event);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
  return listGoverningAudit(orgId, { document: text(query.document), action: text(query.action), before: text(query.before) });
});
