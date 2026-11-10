// POST /api/ops/communities/:id/resend-welcome — send a community's HOA Admin
// the signup welcome email again (plan §5, Phase 2). App Admin (`billing.write`).
// Body: reason, requestId, confirmed, memberId (one of its HOA Admins).
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { beginOpsAction, loadOpsCommunityBilling, runOpsAction } from "#core/server/utils/ops-actions";
import { sendWelcomeEmail } from "#core/server/utils/sendgrid";

const readAny = readItems as any;
const schema = z.object({ memberId: z.string().min(1, "Choose who gets it.") });

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: "resend_welcome",
    targetId: `${id}:${body.memberId}`,
    body,
    perform: async () => {
      const c = await loadOpsCommunityBilling(id);
      const config = useRuntimeConfig();
      const rows = (await (getTypedDirectus() as any).request(
        readAny("hoa_members", {
          filter: { id: { _eq: body.memberId }, organization: { _eq: c.org.id }, status: { _in: ["active", "pending"] } },
          fields: ["id", "role", "first_name", "last_name", "email", "user.email", "user.first_name", "user.last_name"],
          limit: 1,
        })
      )) as any[];
      const m = rows?.[0];
      const role = m?.role && typeof m.role === "object" ? m.role.id : m?.role;
      if (!m || role !== config.public.directusRoleHoaAdmin) {
        throw createError({ statusCode: 404, message: "That isn't one of this community's HOA Admins." });
      }
      const to = m.email || m.user?.email;
      if (!to) throw createError({ statusCode: 409, message: "That HOA Admin has no email address." });
      const firstName = m.first_name || m.user?.first_name || "";
      const lastName = m.last_name || m.user?.last_name || "";
      await sendWelcomeEmail({
        to,
        firstName,
        lastName,
        organizationName: c.org.name,
        loginUrl: `${String(config.public.appUrl || "").replace(/\/$/, "")}/dashboard`,
      });
      return {
        result: { sentTo: to },
        audit: {
          summary: `Re-sent the welcome email to ${[firstName, lastName].filter(Boolean).join(" ") || to} (${c.org.name}).`,
          organization: c.org.id,
          organizationName: c.org.name,
          after: { member: m.id, email: to },
        },
      };
    },
  });
});
