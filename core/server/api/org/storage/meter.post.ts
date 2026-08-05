/**
 * POST /api/org/storage/meter
 *
 * Returns the org's storage usage + limit: { usedBytes, limitBytes,
 * remainingBytes, plan }. `limitBytes`/`remainingBytes` are null when the plan
 * is unlimited (contact-only / Enterprise).
 *
 * Pass { recompute: true } to authoritatively re-sum the folder subtree first
 * (self-heals drift from out-of-band changes). That path is network-heavy —
 * use it sparingly, not on every load.
 */

import { resolveStorageContext } from "#core/server/utils/org-storage";
import {
  getOrgStorage,
  recomputeOrgStorage,
} from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event).catch(() => ({} as any));
  if (body?.recompute) await recomputeOrgStorage(ctx.orgId);
  return await getOrgStorage(ctx.orgId);
});
