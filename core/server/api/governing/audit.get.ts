// GET /api/governing/audit — the audit trail of the organization's governing
// documents, newest first. Managers only. Query: `document`, `action`,
// `before` (the `next_before` of the page already shown). Read-only.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { governingAuditFrom, governingAuditSpec, listGoverningAudit } from "#core/server/utils/governing-audit";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const query = getQuery(event);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
  const options = { document: text(query.document), action: text(query.action), before: text(query.before) };
  // The page and the caller's standing as ONE request (access-snapshot.ts),
  // only for a signed-in caller; the manage check then answers from that
  // standing and refuses before any row is used. Signed out, or when the
  // batch fails, the check and the read go one by one as before.
  const signedIn = !!(await getUserSession(event))?.user?.id;
  const batched = signedIn ? await batchWithAccessSnapshot(event, orgId, { audit: governingAuditSpec(orgId, options) }).catch(() => null) : null;
  await requireGoverningManage(event, orgId);
  return batched ? governingAuditFrom(batched.audit ?? [], options) : listGoverningAudit(orgId, options);
});
