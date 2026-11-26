/**
 * POST /api/org/storage/meter
 *
 * Returns the org's storage usage + limit: { usedBytes, limitBytes,
 * remainingBytes, plan }. `limitBytes`/`remainingBytes` are null when the plan
 * is unlimited (contact-only / Enterprise).
 *
 * The quota's org fields ride in the storage context's one request
 * (resolveStorageContextWithOrg), so a plain read is one Directus request.
 *
 * Pass { recompute: true } to authoritatively re-sum the folder subtree first
 * (self-heals drift from out-of-band changes). That path is network-heavy —
 * use it sparingly, not on every load — and reads the quota after the re-sum.
 */

import {
  resolveStorageContext,
  resolveStorageContextWithOrg,
} from "#core/server/utils/org-storage";
import {
  getOrgStorage,
  orgStorageQuotaFrom,
  recomputeOrgStorage,
  ORG_STORAGE_QUOTA_FIELDS,
} from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({} as any));
  if (body?.recompute) {
    const ctx = await resolveStorageContext(event);
    await recomputeOrgStorage(ctx.orgId);
    return await getOrgStorage(ctx.orgId);
  }
  const { ctx, org } = await resolveStorageContextWithOrg(event, ORG_STORAGE_QUOTA_FIELDS);
  // No org row here is not a quota of zero: read it as before (and fail as before).
  return org ? orgStorageQuotaFrom(org) : await getOrgStorage(ctx.orgId);
});
