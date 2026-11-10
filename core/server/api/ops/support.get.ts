// GET /api/ops/support — the platform support inbox. App Admin and Platform
// Support (`support`). Filters: status (default: everything not closed),
// category, community, q (subject). Newest activity first; counts by status.
import { readItems } from "@directus/sdk";
import { requireOpsPermission } from "#core/server/utils/admin-auth";

const readAny = readItems as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;
const STATUSES = ["new", "open", "waiting", "closed"];

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "support");
  const q = getQuery(event);
  const status = typeof q.status === "string" && (STATUSES.includes(q.status) || q.status === "all") ? q.status : "active";
  const category = typeof q.category === "string" && q.category ? q.category : null;
  const community = typeof q.community === "string" && q.community ? q.community : null;
  const search = typeof q.q === "string" ? q.q.trim().slice(0, 100) : "";

  const directus = getTypedDirectus() as any;
  const all = (await directus.request(
    readAny("support_requests", {
      fields: ["id", "organization", "billing_account", "requester_name", "category", "status", "priority", "subject", "source", "last_message_at", "last_message_by", "date_created"],
      sort: ["-last_message_at"],
      limit: 1000,
    })
  )) as any[];

  const counts: Record<string, number> = { new: 0, open: 0, waiting: 0, closed: 0 };
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const rows = all
    .filter((r) => (status === "all" ? true : status === "active" ? r.status !== "closed" : r.status === status))
    .filter((r) => !category || r.category === category)
    .filter((r) => !community || idOf(r.organization) === community)
    .filter((r) => !search || String(r.subject ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")));

  const orgIds = [...new Set(rows.map((r) => idOf(r.organization)).filter((x): x is string => !!x))];
  const orgs = orgIds.length
    ? ((await directus.request(readAny("hoa_organizations", { filter: { id: { _in: orgIds } }, fields: ["id", "name", "slug"], limit: -1 }))) as any[])
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name || o.slug]));

  return {
    status,
    counts,
    requests: rows.map((r) => ({
      id: r.id,
      community: idOf(r.organization) ? { id: idOf(r.organization), name: orgName.get(idOf(r.organization)!) ?? null } : null,
      billingAccount: idOf(r.billing_account),
      requester: r.requester_name ?? (r.source === "auto" ? "Automatic" : null),
      category: r.category,
      status: r.status,
      priority: r.priority,
      subject: r.subject,
      automatic: r.source === "auto",
      lastMessageAt: r.last_message_at ?? r.date_created ?? null,
      awaitingUs: r.status !== "closed" && r.last_message_by !== "staff",
    })),
  };
});
