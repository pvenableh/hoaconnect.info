/**
 * Org file-storage quota enforcement.
 *
 * Mirrors the AI-credit metering model: a cached counter
 * (`hoa_organizations.storage_used_bytes`) on the hot path, incremented on
 * upload and decremented on delete, periodically corrected by an authoritative
 * recompute that sums the org's folder subtree (`recomputeOrgStorage`).
 *
 * Effective limit = plan bytes + `storage_extra_bytes` + active storage add-ons
 *   - a contact-only tier (Enterprise) → UNLIMITED (null)
 *   - no plan / free account          → FREE_STORAGE_GB floor
 * Per-plan bytes come from `subscription_plans.max_storage_gb`, falling back to a
 * per-band default (BAND_STORAGE_GB) when a plan row leaves it unset.
 *
 * Tenant containment (which folders belong to the org) lives in
 * `org-storage.ts`; this module only does byte accounting + limits, and reuses
 * `getDescendantFolderIds` from there to walk the subtree.
 */

import { readItem, updateItem } from "@directus/sdk";
import { GB, addonStorageBytes } from "#core/shared/billing/addons";
import { getDescendantFolderIds } from "#core/server/utils/org-storage";

/** Largest single file we accept, pre-quota. Tunable via env (MB). */
export const PER_FILE_CAP_BYTES =
  (Number(process.env.STORAGE_MAX_FILE_MB) || 250) * 1024 * 1024;

/** Storage floor for an org with no paid plan (free / null). */
const FREE_STORAGE_GB = Number(process.env.STORAGE_FREE_GB) || 5;

/**
 * Fallback per-band storage (GB), used only when a `subscription_plans` row has
 * no explicit `max_storage_gb`. Keyed by band slug (see billing/bands.ts).
 */
const BAND_STORAGE_GB: Record<string, number> = {
  boutique: 25,
  mid: 50,
  larger: 100,
  grand: 250,
};

export interface OrgStorageQuota {
  usedBytes: number;
  /** null = unlimited (contact-only / Enterprise) */
  limitBytes: number | null;
  remainingBytes: number | null;
  /** Band slug of the org's plan, or null. */
  plan: string | null;
}

interface OrgStorageRow {
  storage_used_bytes?: number | null;
  storage_extra_bytes?: number | null;
  active_addons?: Record<string, unknown> | null;
  is_free_account?: boolean | null;
  subscription_plan?: {
    slug?: string | null;
    max_storage_gb?: number | null;
    is_contact_only?: boolean | null;
  } | string | null;
}

/** Read an org's current usage + effective limit (uses the cached counter). */
export async function getOrgStorage(orgId: string): Promise<OrgStorageQuota> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", orgId, {
      fields: [
        "storage_used_bytes",
        "storage_extra_bytes",
        "active_addons",
        "is_free_account",
        {
          subscription_plan: ["slug", "max_storage_gb", "is_contact_only"],
        },
      ],
    })
  )) as OrgStorageRow;

  const plan =
    org?.subscription_plan && typeof org.subscription_plan === "object"
      ? org.subscription_plan
      : null;
  const planSlug = plan?.slug ?? null;

  const usedBytes = Math.max(0, Number(org?.storage_used_bytes) || 0);

  // Contact-only tiers (Enterprise) are never capped.
  if (plan?.is_contact_only) {
    return { usedBytes, limitBytes: null, remainingBytes: null, plan: planSlug };
  }

  const extraBytes =
    Math.max(0, Number(org?.storage_extra_bytes) || 0) +
    addonStorageBytes(org?.active_addons ?? null);

  const gb =
    Number(plan?.max_storage_gb) ||
    (planSlug ? BAND_STORAGE_GB[planSlug] : 0) ||
    FREE_STORAGE_GB;

  const limitBytes = gb * GB + extraBytes;
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  return { usedBytes, limitBytes, remainingBytes, plan: planSlug };
}

/**
 * Throw BEFORE accepting an upload of `incomingBytes` if it would breach the
 * per-file cap (413) or the org's remaining quota (413 + `code: 'storage_full'`).
 * No-op when the plan is unlimited.
 */
export async function enforceStorageLimit(
  orgId: string,
  incomingBytes: number
): Promise<void> {
  if (incomingBytes > PER_FILE_CAP_BYTES) {
    throw createError({
      statusCode: 413,
      message: `That file is too large. The per-file limit is ${Math.round(
        PER_FILE_CAP_BYTES / (1024 * 1024)
      )} MB.`,
    });
  }
  const { limitBytes, usedBytes } = await getOrgStorage(orgId);
  if (limitBytes == null) return; // unlimited
  if (usedBytes + incomingBytes > limitBytes) {
    throw createError({
      statusCode: 413,
      data: { code: "storage_full" },
      message:
        "Your association has run out of file storage. Free up space or add more storage.",
    });
  }
}

/** Adjust the cached counter after an upload (+) or delete (−). Never negative. */
export async function addOrgStorageUsage(
  orgId: string,
  deltaBytes: number
): Promise<void> {
  if (!deltaBytes) return;
  try {
    const directus = getTypedDirectus();
    const org = (await directus.request(
      readItem("hoa_organizations", orgId, { fields: ["storage_used_bytes"] })
    )) as OrgStorageRow;
    const next = Math.max(0, (Number(org?.storage_used_bytes) || 0) + deltaBytes);
    await directus.request(
      updateItem("hoa_organizations", orgId, {
        storage_used_bytes: next,
      } as Record<string, unknown>)
    );
  } catch (err) {
    console.error("[storage] failed to adjust usage:", (err as Error).message);
  }
}

/**
 * Sum the total bytes of every file under `rootFolder` (inclusive of all
 * descendants). Reuses the org-storage BFS for the folder-id list, then sums
 * `filesize` via the Directus REST aggregate endpoint — item commands on core
 * `directus_files` are unreliable through the SDK. Network-heavy: call on demand,
 * not eagerly for every folder.
 */
export async function sumFolderSubtree(rootFolder: string): Promise<number> {
  const subtree = await getDescendantFolderIds(rootFolder);

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;
  let total = 0;
  // Chunk the folder id list to keep the querystring bounded.
  for (let i = 0; i < subtree.length; i += 50) {
    const chunk = subtree.slice(i, i + 50);
    const params = new URLSearchParams({ "aggregate[sum]": "filesize" });
    chunk.forEach((id, idx) => params.set(`filter[folder][_in][${idx}]`, id));
    const res = await fetch(`${url}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const j = (await res.json()) as any;
    total += Number(j?.data?.[0]?.sum?.filesize) || 0;
  }
  return total;
}

/**
 * Authoritative recompute: sum filesize across the org's whole folder subtree,
 * write it to the cached counter, and return the total. Self-heals any drift
 * from out-of-band uploads/deletes. Returns 0 (and zeroes the counter) if the
 * org has no root folder.
 */
export async function recomputeOrgStorage(orgId: string): Promise<number> {
  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", orgId, { fields: ["folder"] })
  )) as { folder?: string | { id: string } | null };
  const rootFolder =
    org?.folder == null
      ? null
      : typeof org.folder === "string"
        ? org.folder
        : org.folder.id;

  if (!rootFolder) {
    await directus.request(
      updateItem("hoa_organizations", orgId, {
        storage_used_bytes: 0,
      } as Record<string, unknown>)
    );
    return 0;
  }

  const total = await sumFolderSubtree(rootFolder);
  await directus.request(
    updateItem("hoa_organizations", orgId, {
      storage_used_bytes: total,
    } as Record<string, unknown>)
  );
  return total;
}
