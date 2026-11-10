// GET /api/support/requests — the platform requests this person may see.
//
// ?view=mine (default): the ones they opened. ?view=community: every platform
// request from the communities where they are an HOA Admin, and about the
// billing accounts they own or administer (§9.6). Newest activity first.
import { readItems } from "@directus/sdk";
import { supportViewerFor } from "#core/server/utils/support";

const readAny = readItems as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  const viewer = await supportViewerFor(event);
  const view = getQuery(event).view === "community" ? "community" : "mine";
  const scopes: Record<string, unknown>[] = [];
  if (view === "mine") scopes.push({ requester: { _eq: viewer.userId } });
  else {
    if (viewer.adminOf.size) scopes.push({ organization: { _in: [...viewer.adminOf] } });
    if (viewer.accountAdminOf.size) scopes.push({ billing_account: { _in: [...viewer.accountAdminOf] } });
  }
  if (!scopes.length) return { view, requests: [] };

  const directus = getTypedDirectus() as any;
  const rows = (await directus.request(
    readAny("support_requests", {
      filter: scopes.length === 1 ? scopes[0] : { _or: scopes },
      fields: ["id", "organization", "billing_account", "requester", "requester_name", "category", "status", "subject", "last_message_at", "last_message_by", "date_created"],
      sort: ["-last_message_at"],
      limit: 200,
    })
  )) as any[];
  const orgIds = [...new Set(rows.map((r) => idOf(r.organization)).filter((x): x is string => !!x))];
  const orgs = orgIds.length
    ? ((await directus.request(readAny("hoa_organizations", { filter: { id: { _in: orgIds } }, fields: ["id", "name", "slug"], limit: -1 }))) as any[])
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name || o.slug]));
  return {
    view,
    requests: rows
      .sort((a, b) => String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")))
      .map((r) => ({
        id: r.id,
        community: orgName.get(idOf(r.organization) ?? "") ?? null,
        category: r.category,
        status: r.status,
        subject: r.subject,
        lastMessageAt: r.last_message_at ?? r.date_created ?? null,
        repliedByHoaConnect: r.last_message_by === "staff",
        // HOA Admins see who in their community asked; your own list doesn't need it.
        requester: view === "community" ? (idOf(r.requester) === viewer.userId ? "You" : r.requester_name ?? null) : null,
      })),
  };
});
