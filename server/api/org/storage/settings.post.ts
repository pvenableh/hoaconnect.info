/**
 * POST /api/org/storage/settings
 *
 * Read or update the org's storage browse-access tier. The setting lives in the
 * org `modules` JSON (`storage_browse_access`) — no schema migration needed.
 *   - no `browseAccess` in body → returns the current value
 *   - `browseAccess` present     → admin-only update
 */

import { readItems, updateItem } from "@directus/sdk";
import {
  resolveStorageContext,
  assertAdmin,
  invalidateOrgStorage,
  type BrowseAccess,
} from "~~/server/utils/org-storage";

const VALID: BrowseAccess[] = ["admins_board", "all_members", "admins_only"];

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event);
  const admin = getTypedDirectus();

  if (body?.browseAccess === undefined) {
    return { browseAccess: ctx.browseAccess };
  }

  assertAdmin(ctx);
  const next = body.browseAccess as BrowseAccess;
  if (!VALID.includes(next)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid browseAccess value" });
  }

  const rows = (await admin.request(
    readItems("hoa_organizations", {
      filter: { id: { _eq: ctx.orgId } },
      fields: ["modules"],
      limit: 1,
    })
  )) as any[];
  const modules = { ...(rows?.[0]?.modules ?? {}) } as Record<string, any>;
  modules.storage_browse_access = next;

  await admin.request(
    updateItem("hoa_organizations", ctx.orgId, { modules } as any)
  );
  invalidateOrgStorage(ctx.orgId);

  return { browseAccess: next };
});
