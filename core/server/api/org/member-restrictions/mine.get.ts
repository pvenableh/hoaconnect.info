/**
 * GET /api/org/member-restrictions/mine?orgId= — the caller's own pause in
 * this community, if any: `{ restricted, endsAt, memberNote }` and nothing
 * else (never who imposed it or the board's internal note).
 * docs/spec-member-restrictions.md.
 *
 * Any active member. The banner asks on every page of the community, so this
 * is also where posts_in heals after a pause's end date passes: when the
 * stored mirror disagrees with the derived answer, the membership is synced.
 */
import { readItems } from "@directus/sdk";
import { openRestriction } from "#core/shared/members/restrictions";
import { orgIdFromQuery } from "#core/server/utils/delegation";
import { syncAdminScope } from "#core/server/utils/admin-scope";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  const orgId = orgIdFromQuery(event);
  const directus = getTypedDirectus();

  // `*` so a posts_in not yet created is absent rather than a failed read.
  const memberships = ((await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: ["*"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  if (!memberships.length) throw createError({ statusCode: 403, message: "You're not an active member of this community." });

  const ids = memberships.map((m) => String(m.id));
  const rows = ((await directus.request(
    readItems("hoa_member_restrictions" as any, {
      filter: { organization: { _eq: orgId }, member: { _in: ids }, lifted_at: { _null: true } } as any,
      fields: ["id", "member", "starts_at", "ends_at", "lifted_at", "member_note"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  const now = new Date();
  const pausedNow = (memberId: string) => !!openRestriction(rows.filter((r) => String(r.member) === memberId), now);
  // Posting is open if any of the caller's memberships here is free (as the Directus rule reads it).
  const free = ids.some((id) => !pausedNow(id));
  const open = free ? null : openRestriction(rows, now);

  // The mirror says "posts" exactly when the membership is not paused now.
  const stale = memberships.filter((m) => "posts_in" in m && !!m.posts_in === pausedNow(String(m.id)));
  if (stale.length) {
    await syncAdminScope(stale.map((m) => String(m.id))).catch((e) => console.warn("[member-restrictions] heal sync failed:", e?.message ?? e));
  }

  return { restricted: !!open, endsAt: open?.ends_at ?? null, memberNote: open?.member_note ?? null };
});
