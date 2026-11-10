// GET /api/ops/support/:id — one platform request in full: the thread with
// internal notes, the asker's roles when they asked, and a link to the
// community. The requester's name and email are shown because they opened it
// (plan §3). App Admin and Platform Support (`support`).
import { readItems } from "@directus/sdk";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { describeSupportRoles, readSupportMessages, readSupportRequest } from "#core/server/utils/support";

const readAny = readItems as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "support");
  const id = getRouterParam(event, "id") ?? "";
  const req = id ? await readSupportRequest(id) : null;
  if (!req) throw createError({ statusCode: 404, message: "Request not found" });

  const orgId = idOf(req.organization);
  const org = orgId
    ? (((await (getTypedDirectus() as any).request(readAny("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["id", "name", "slug"], limit: 1 }))) as any[])?.[0] ?? null)
    : null;
  const messages = await readSupportMessages(req.id, { internal: true });

  return {
    request: {
      id: req.id,
      category: req.category,
      status: req.status,
      priority: req.priority,
      subject: req.subject,
      source: req.source,
      page: req.page ?? null,
      appVersion: req.app_version ?? null,
      dateCreated: req.date_created ?? null,
      closedAt: req.closed_at ?? null,
      requester: req.requester ? { name: req.requester_name ?? null, email: req.requester_email ?? null } : null,
      roles: req.requester_roles ?? null,
      rolesLine: describeSupportRoles(req.requester_roles),
      community: org ? { id: org.id, name: org.name || org.slug, slug: org.slug ?? null } : null,
      billingAccount: idOf(req.billing_account),
    },
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author_name ?? (m.author_kind === "system" ? "HOA Connect (automatic)" : null),
      kind: m.author_kind,
      internal: !!m.internal,
      body: m.body,
      at: m.date_created ?? null,
    })),
  };
});
