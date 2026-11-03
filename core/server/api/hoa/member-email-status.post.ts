/**
 * POST /api/hoa/member-email-status — `{ organizationId, memberId, clear: "bounced" | "opt_out" }`.
 *
 * The Members page's Clear: an admin restores mail to a member whose address
 * bounced (it works again) or who opted out of community mail (they asked to
 * be back). Org admins only, and the member is read with the org in the filter,
 * so an admin of one community can't clear a member of another by id.
 *
 * Logged to the community ledger (`member_email_status_cleared`, board-only)
 * with what was cleared and why it had been set — once the flag is gone the
 * entry is the only copy. As with the grants route, a failed ledger write is
 * reported, not swallowed: the change has landed, and the admin is told the
 * record didn't.
 */

import { readItems } from "@directus/sdk";
import { buildEmailStatusClearedEntry } from "#core/shared/ledger/entries";
import {
  clearEmailBounce,
  emailComplianceSchema,
  MEMBER_EMAIL_STATE_FIELDS,
  resubscribeToCommunity,
} from "../../utils/email-compliance";
import { writeAuditEntry } from "../../utils/audit-log";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => null)) as {
    organizationId?: unknown;
    memberId?: unknown;
    clear?: unknown;
  } | null;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const clear = body?.clear === "bounced" || body?.clear === "opt_out" ? body.clear : null;
  if (!organizationId || !memberId || !clear) {
    throw createError({ statusCode: 400, statusMessage: "organizationId, memberId and clear (bounced | opt_out) are required" });
  }
  await requireAdminAccess(event, organizationId);

  const directus = getTypedDirectus();
  let ready = false;
  try {
    ready = (await emailComplianceSchema(directus)).members;
  } catch (e) {
    console.warn("[member-email-status] schema probe failed", (e as Error).message);
  }
  if (!ready) throw createError({ statusCode: 503, statusMessage: "Email status isn't available yet." });

  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { id: { _eq: memberId }, organization: { _eq: organizationId } },
      fields: ["id", "first_name", "last_name", "email", ...MEMBER_EMAIL_STATE_FIELDS],
      limit: 1,
    } as any)
  )) as any[];
  const member = rows?.[0];
  if (!member) throw createError({ statusCode: 404, statusMessage: "Member not found in this community." });

  const changed =
    clear === "bounced"
      ? await clearEmailBounce(directus, member)
      : await resubscribeToCommunity(directus, member);
  if (!changed) return { ok: true, changed: false, recorded: false, recordError: null };

  const session = await getUserSession(event);
  const user = (session?.user || {}) as { id?: string; email?: string; first_name?: string; last_name?: string };
  const entry = buildEmailStatusClearedEntry({
    organizationId,
    member: {
      memberId: String(member.id),
      name: [member.first_name, member.last_name].filter(Boolean).join(" ").trim(),
      email: member.email ?? null,
    },
    cleared: clear,
    previous:
      clear === "bounced"
        ? { reason: member.email_bounced_reason ?? null, at: member.email_bounced_at ?? null }
        : { source: member.email_community_opt_out_source ?? null, at: member.email_community_opt_out_at ?? null },
    actor: {
      userId: user.id ?? null,
      name: [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "An administrator",
      email: user.email ?? null,
    },
    occurredAt: new Date().toISOString(),
  });

  let recorded = false;
  let recordError: string | null = null;
  try {
    await writeAuditEntry(entry);
    recorded = true;
  } catch (e: any) {
    console.error("[member-email-status] audit write failed:", e);
    recordError = e?.message || "The change was saved but could not be recorded in the ledger.";
  }
  return { ok: true, changed: true, recorded, recordError };
});
