// Where a file or folder may go, for the app's own routes that act with the
// caller's Directus token (`/api/directus/files`, `/api/directus/files/upload`,
// `/api/directus/files/import`, `/api/directus/folders`, `/api/directus/items`).
//
// Directus cannot say this itself: a create or a move is checked against the
// new values, and such a check cannot follow a relation (tested on production
// 2026-11-12: a create rule on folders was not enforced). So without these
// checks a member could put a file or folder into another community's library,
// or attach a file to another community's meeting. The storage library's own
// routes already check with `assertFolderInOrg`; this is the same rule for the
// rest. Reads use the app's token.
import { readItems } from "@directus/sdk";
import type { H3Event } from "h3";
import { isWithinOrgRoot } from "./org-storage";

const asId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));

/** The organizations the caller belongs to, with each one's library root. */
export async function callerCommunities(event: H3Event): Promise<{ organization: string; root: string | null }[]> {
  const session = await requireUserSession(event);
  const userId = (session.user as { id?: string } | undefined)?.id;
  if (!userId) return [];
  const rows = (await getTypedDirectus().request(
    readItems("hoa_members" as never, {
      filter: { user: { _eq: userId } },
      fields: ["organization.id", "organization.folder"],
      limit: -1,
    } as never)
  )) as Array<{ organization?: { id?: string; folder?: unknown } | string | null }>;
  const seen = new Map<string, string | null>();
  for (const row of rows ?? []) {
    const org = row.organization;
    const id = asId(org);
    if (id) seen.set(id, org && typeof org === "object" ? asId(org.folder) : null);
  }
  return [...seen].map(([organization, root]) => ({ organization, root }));
}

/**
 * Throw unless `folderId` is inside the library of a community the caller
 * belongs to. `allowNone` lets "no folder" through (a file outside every
 * library is in nobody's).
 */
export async function assertFolderInCallerLibrary(event: H3Event, folderId: unknown, options: { allowNone?: boolean } = {}) {
  if (folderId === null || folderId === undefined || folderId === "") {
    if (options.allowNone) return;
    throw createError({ statusCode: 403, message: "Choose a folder in your community's library" });
  }
  if (typeof folderId !== "string") throw createError({ statusCode: 400, message: "A folder is given by its id" });
  for (const { root } of await callerCommunities(event)) {
    if (root && (await isWithinOrgRoot(root, folderId))) return;
  }
  throw createError({ statusCode: 403, message: "That folder is not in your community's library" });
}

/** Throw unless every meeting named is one of the caller's communities'. */
export async function assertMeetingsInCallerCommunities(event: H3Event, meetingIds: unknown[]) {
  const ids = [...new Set(meetingIds.map(asId).filter((id): id is string => !!id))];
  if (!ids.length) return;
  const orgs = new Set((await callerCommunities(event)).map((c) => c.organization));
  const meetings = (await getTypedDirectus().request(
    readItems("hoa_meetings" as never, { filter: { id: { _in: ids } }, fields: ["id", "organization"], limit: -1 } as never)
  )) as Array<{ id: string; organization?: unknown }>;
  const ok = ids.every((id) => {
    const meeting = meetings.find((m) => m.id === id);
    const org = meeting ? asId(meeting.organization) : null;
    return !!org && orgs.has(org);
  });
  if (!ok) throw createError({ statusCode: 403, message: "That meeting is not one of your community's" });
}
