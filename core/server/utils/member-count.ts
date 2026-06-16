// server/utils/member-count.ts
// Keep hoa_organizations.member_count in sync with the actual number of active
// members. The field is denormalized (read by the landing widget, org lists, and
// billing/seat displays) and has no DB trigger, so call this after any path that
// creates, removes, or changes the status of an hoa_members record.
import { aggregate, updateItem } from "@directus/sdk";

/**
 * Recompute and persist an org's member_count from its active members.
 * Best-effort: never throws (callers shouldn't fail their main action over a
 * count refresh). Returns the new count, or null on failure.
 */
export async function recomputeMemberCount(
  organizationId: string,
  directus = getTypedDirectus()
): Promise<number | null> {
  if (!organizationId) return null;
  try {
    const rows: any = await directus.request(
      aggregate("hoa_members", {
        aggregate: { count: "*" },
        query: {
          filter: {
            organization: { _eq: organizationId },
            status: { _eq: "active" },
          },
        },
      } as any)
    );
    const count = Number(rows?.[0]?.count ?? 0) || 0;
    await directus.request(
      updateItem("hoa_organizations", organizationId, { member_count: count } as any)
    );
    return count;
  } catch (e) {
    console.warn("[member-count] recompute failed for", organizationId, e);
    return null;
  }
}
