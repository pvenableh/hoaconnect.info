/**
 * The memberships whose posting is paused now, read by the operator scripts
 * that compute posts_in (add-admin-scope.ts, setup-directus-permissions.ts'
 * readiness), so they agree with the sync (core/server/utils/admin-scope.ts).
 *
 * Before hoa_member_restrictions exists nobody is: Directus answers 403 for a
 * collection it does not have, even to the admin token. Any other failure is
 * thrown, so a script never computes posts_in as open because it could not
 * read.
 */
import { restrictedMemberIds, type RestrictionRow } from "../../core/shared/members/restrictions";

export async function readRestrictedNow(directusUrl: string, token: string, now = new Date()): Promise<Set<string>> {
  const iso = now.toISOString();
  const filter = {
    _and: [
      { _or: [{ lifted_at: { _null: true } }, { lifted_at: { _gt: iso } }] },
      { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: iso } }] },
    ],
  };
  const res = await fetch(
    `${directusUrl}/items/hoa_member_restrictions?fields=member,starts_at,ends_at,lifted_at&limit=-1&filter=${encodeURIComponent(JSON.stringify(filter))}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 403) return new Set();
  if (!res.ok) throw new Error(`reading hoa_member_restrictions: HTTP ${res.status} ${await res.text()}`);
  const rows = ((await res.json())?.data ?? []) as RestrictionRow[];
  return restrictedMemberIds(rows, now);
}
