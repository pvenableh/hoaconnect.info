/**
 * POST /api/org/export/:id/ready-email — the "your export is ready" email.
 *
 * Called by the data-export worker (GitHub Actions) right after it writes the
 * bell row, with the cron secret. The worker is a tsx script and can't load the
 * email templates (they import `.mjml` files and Nuxt aliases), so the app sends
 * it. Directus used to email the bell row instead; Session H turned that off.
 *
 * Only a READY export's requester is emailed, and only as a member of that
 * community (the transactional sender's tenancy gate). No category: it is the
 * receipt for something they asked for by hand, so a category opt-out doesn't
 * stop it; the app's master switch (`_email`), the mute, and a bounced address do.
 * Not idempotent: the worker calls it once per finished export.
 */
import { readItem } from "@directus/sdk";
import { cronSecretMatches } from "#core/server/utils/cron-auth";
import { sendBrandedTransactionalEmail } from "#core/server/utils/transactional-email";
import { EXPORT_TTL_DAYS } from "#core/shared/export/manifest";
import { EXPORT_READY_CTA, exportReadyNotice } from "#core/shared/export/ready-notice";

export default defineEventHandler(async (event) => {
  if (!cronSecretMatches(event)) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Export id required" });

  let row: any = null;
  try {
    row = await getTypedDirectus().request(
      readItem("hoa_data_exports", id, {
        fields: ["id", "status", "tier", "requested_by", "expires_at", { organization: ["id", "name", "slug"] }],
      } as any)
    );
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Export not found" });
  }
  const org = row?.organization && typeof row.organization === "object" ? row.organization : null;
  const requester = typeof row?.requested_by === "string" ? row.requested_by : row?.requested_by?.id;
  if (row?.status !== "ready" || !requester || !org?.id || !row.expires_at) {
    return { sent: 0, reason: "not-ready" };
  }

  const notice = exportReadyNotice({
    orgName: org.name || org.slug,
    slug: org.slug ?? null,
    tier: row.tier,
    days: EXPORT_TTL_DAYS,
    expiresAt: row.expires_at,
    appUrl: "",
  });
  const sent = await sendBrandedTransactionalEmail({
    organizationId: org.id,
    recipientUserIds: [requester],
    subject: notice.subject,
    heading: notice.subject,
    bodyHtml: notice.bodyHtml,
    cta: { ...EXPORT_READY_CTA },
    emailType: "notice",
  });
  return { sent };
});
