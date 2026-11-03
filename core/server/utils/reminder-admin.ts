/**
 * The gate for Settings → Reminders' routes (Earnest parity round 3, Phase 5b):
 * `/api/org/reminders/*`. Reminders reach residents in the board's name, so the
 * people who may change them or preview them are the people who can send in its
 * name — an admin of the org, or a property manager with the `communications`
 * grant (the gate `GET /api/email/preview-mjml` uses).
 */
import type { H3Event } from "h3";

export async function requireReminderAdmin(
  event: H3Event,
  body: { orgId?: unknown; slug?: unknown } | null | undefined
): Promise<{ orgId: string; userId: string; email: string | null }> {
  const session = await requireUserSession(event);
  const orgId = await resolveOrgId({ orgId: body?.orgId, slug: body?.slug });
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  await requireAdminOrManagerGrant(event, orgId, "communications");
  const user: any = session.user ?? {};
  if (!user.id) throw createError({ statusCode: 401, statusMessage: "Sign in again." });
  return { orgId, userId: String(user.id), email: user.email ?? null };
}
