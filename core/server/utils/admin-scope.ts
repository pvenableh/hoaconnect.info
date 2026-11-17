/**
 * Keep the scope fields true (core/shared/roles/admin-scope.ts): on hoa_members
 * `admin_of`, `manager_of`, `communications_of`, `inquiries_of`, `active_in`,
 * `posts_in`; on hoa_channel_members `posts_to`. Called by the Directus Flow on
 * every hoa_members create and update, and nightly with no keys to reconcile
 * everyone. Idempotent: a row already right is not written, so the Flow's own
 * echo of this write ends here.
 *
 * Reads `*` rather than naming the fields, so a field not yet created is
 * skipped instead of failing the whole read (naming a missing field does).
 */
import { readItems, updateItem } from "@directus/sdk";
import {
  channelScopeChanges,
  postingOrgsByUser,
  scopeChanges,
  type ScopeField,
  type ScopeRoles,
  type ScopedChannelRow,
  type ScopedMembershipWithGrants,
} from "#core/shared/roles/admin-scope";

export interface AdminScopeSyncResult {
  checked: number;
  updated: number;
  changes: { id: string; patch: Partial<Record<ScopeField, string | null>> }[];
  /** Channel rows whose posts_to was rewritten. */
  channels?: { checked: number; updated: number };
}

type Directus = ReturnType<typeof getTypedDirectus>;

function scopeRoles(): ScopeRoles {
  const config = useRuntimeConfig();
  return {
    hoaAdmin: String(config.public.directusRoleHoaAdmin || ""),
    propertyManager: String(config.public.directusRolePropertyManager || ""),
  };
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

/**
 * Rewrite `posts_to` on the channel rows of `users` (every row when null),
 * from those users' memberships as they should be. Memberships are read
 * whole for each user named, because a person's channels can sit in any of
 * their communities.
 */
async function syncChannelRows(directus: Directus, roles: ScopeRoles, users: string[] | null, known?: readonly ScopedMembershipWithGrants[]) {
  if (users && !users.length) return { checked: 0, updated: 0 };
  const memberships =
    known ??
    ((await directus.request(
      readItems("hoa_members", {
        ...(users ? { filter: { user: { _in: users } } } : {}),
        fields: ["*"] as any,
        limit: -1,
      })
    )) as unknown as ScopedMembershipWithGrants[]);
  const posting = postingOrgsByUser(memberships ?? [], roles);
  const rows = (await directus.request(
    readItems("hoa_channel_members", {
      ...(users ? { filter: { user: { _in: users } } } : {}),
      fields: ["*", "channel.id", "channel.organization"] as any,
      limit: -1,
    })
  )) as unknown as ScopedChannelRow[];
  const changes = channelScopeChanges(rows ?? [], posting);
  for (const c of changes) {
    await directus.request(updateItem("hoa_channel_members", c.id, { posts_to: c.posts_to } as any));
  }
  return { checked: rows?.length ?? 0, updated: changes.length };
}

/** Recompute the scope fields for the given memberships, or for every membership when `keys` is null. */
export async function syncAdminScope(keys: string[] | null): Promise<AdminScopeSyncResult> {
  const roles = scopeRoles();
  if (!roles.hoaAdmin) throw createError({ statusCode: 500, message: "HOA Admin role is not configured" });

  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_members", {
      ...(keys ? { filter: { id: { _in: keys } } } : {}),
      fields: ["*"] as any,
      limit: -1,
    })
  )) as unknown as ScopedMembershipWithGrants[];

  const changes = scopeChanges(rows ?? [], roles);
  for (const c of changes) {
    await directus.request(updateItem("hoa_members", c.id, c.patch as any));
  }

  // The channel rows of the people whose memberships were named: everyone's
  // on a full reconcile, from the rows already read.
  const users = keys ? [...new Set((rows ?? []).map((r) => idOf(r.user)).filter((u): u is string => !!u))] : null;
  const channels = await syncChannelRows(directus, roles, users, keys ? undefined : (rows ?? []));
  return { checked: rows?.length ?? 0, updated: changes.length, changes, channels };
}

/**
 * Set `posts_to` on a user's channel rows right after a route creates one, so
 * a new member can post at once rather than after the nightly reconcile. A
 * failure is logged, not thrown: the row exists and the reconcile fixes it;
 * until then the person cannot post in that channel (closed, not open).
 */
export async function syncChannelPostScope(users: readonly (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(users.filter((u): u is string => typeof u === "string" && !!u))];
  if (!ids.length) return;
  try {
    const roles = scopeRoles();
    await syncChannelRows(getTypedDirectus(), roles, ids);
  } catch (e: any) {
    console.warn("[admin-scope] posts_to not set for new channel rows; the nightly reconcile will", e?.message ?? e);
  }
}
