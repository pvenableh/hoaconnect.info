// GET /api/support/requests — the platform requests this person may see.
//
// ?view=mine (default): the ones they opened. ?view=community: every platform
// request from the communities where they are an HOA Admin, and about the
// billing accounts they own or administer (§9.6). Newest activity first.
import { readItems } from "@directus/sdk";
import { opsCan } from "#core/shared/ops/permissions";
import type { SupportViewer } from "#core/shared/support/access";
import { getPlatformActor } from "#core/server/utils/admin-auth";
import {
  supportListFrom,
  supportListScopes,
  supportListSpec,
  supportViewerForUser,
  supportViewerFrom,
  supportViewerSpecs,
} from "#core/server/utils/support";

const readAny = readItems as any;

/** The list's read as REST: the fallback when a batch fails. */
async function readList(filter: Record<string, unknown>): Promise<any[]> {
  const { collection, ...query } = supportListSpec(filter);
  return ((await getTypedDirectus().request(readAny(collection, query))) ?? []) as any[];
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  const staff = opsCan((await getPlatformActor(event))?.role, "support");
  const view = getQuery(event).view === "community" ? "community" : "mine";

  // Their own list needs only who they are: one read, each community's name
  // through the relation. The community view reads the viewer's seats (one
  // batch), then the rows. A failed batch reads the seats one by one as before.
  if (view === "mine") {
    const viewer: SupportViewer = { userId, staff, adminOf: new Set(), accountAdminOf: new Set() };
    return supportListFrom(view, viewer, await readList({ requester: { _eq: userId } }));
  }
  const batched = await readItemsBatch(supportViewerSpecs(userId)).catch(() => null);
  const viewer: SupportViewer = batched
    ? supportViewerFrom(userId, staff, batched.sv_admins ?? [], batched.sv_accounts ?? [])
    : await supportViewerForUser(userId, staff);
  const filter = supportListScopes(view, viewer);
  if (!filter) return { view, requests: [] };
  return supportListFrom(view, viewer, await readList(filter));
});
