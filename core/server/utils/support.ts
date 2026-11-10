// Platform support requests: "Contact HOA Connect" (docs/plan-operator-console.md
// §5, Phase 3). The rules live in core/shared/support/access.ts; this is the
// Directus side: the asker's roles, the viewer's reach, writing a request or a
// message, and telling the right people.
//
// `support_requests` and `support_messages` grant no Directus role any access
// (scripts/create-support-schema.ts): every read and write comes through these
// helpers with the admin token, after the route has checked who is asking.
import { createItem, readItems, updateItem } from "@directus/sdk";
import type { H3Event } from "h3";
import { residencyFor, RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";
import { opsCan } from "#core/shared/ops/permissions";
import {
  NO_ROLES,
  SUPPORT_CATEGORIES,
  type SupportCategory,
  type SupportRoles,
  type SupportViewer,
} from "#core/shared/support/access";
import { normalizeGrants, MANAGER_GRANT_KEYS } from "#core/shared/transition/grants";
import { getPlatformActor } from "./admin-auth";
import { notifyUsers } from "./notify";
import { opsUsers } from "./ops-data";
import { notifyPlatform } from "./platform-notify";

// For collections whose nested-field reads the SDK types too narrowly. The
// support_* collections themselves go through the typed client.
const readAny = readItems as any;
const directus = () => getTypedDirectus() as any;

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

const categoryLabel = (c: string) => SUPPORT_CATEGORIES.find((x) => x.value === c)?.label ?? c;

function appUrl(): string {
  return String(useRuntimeConfig().public.appUrl || "").replace(/\/$/, "");
}

// ── Who is asking, and in what hats ─────────────────────────────────────────

/** This person's roles in one community, or on one billing account. Read fresh: it's stored on the request. */
export async function supportRolesFor(
  userId: string,
  ctx: { organizationId?: string | null; billingAccountId?: string | null }
): Promise<SupportRoles> {
  const config = useRuntimeConfig();
  const roles: SupportRoles = { ...NO_ROLES, boardTitles: [], managerGrants: [] };
  if (ctx.organizationId) {
    const members = (await directus().request(
      readAny("hoa_members", {
        filter: { user: { _eq: userId }, organization: { _eq: ctx.organizationId }, status: { _eq: "active" } },
        fields: ["id", "role", "member_type", "manager_permissions", ...RESIDENCY_UNIT_FIELDS],
        limit: 1,
      })
    )) as any[];
    const m = members?.[0];
    if (m) {
      const role = idOf(m.role);
      roles.membership =
        role === config.public.directusRoleHoaAdmin
          ? "hoa_admin"
          : role === config.public.directusRolePropertyManager
            ? "property_manager"
            : "member";
      roles.residency = residencyFor(m) ?? null;
      if (roles.membership === "property_manager") {
        const g = normalizeGrants(m.manager_permissions);
        roles.managerGrants = MANAGER_GRANT_KEYS.filter((k) => g[k]);
      }
      const today = new Date().toISOString().slice(0, 10);
      const board = (await directus().request(
        readAny("hoa_board_members", {
          filter: {
            _and: [
              { hoa_member: { _eq: m.id } },
              { status: { _eq: "published" } },
              { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
              { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
            ],
          },
          fields: ["title"],
          limit: -1,
        })
      ).catch(() => [])) as any[];
      roles.boardTitles = [...new Set((board ?? []).map((b) => String(b.title)).filter(Boolean))];
    }
  }
  if (ctx.billingAccountId) {
    const rows = (await directus().request(
      readAny("billing_account_members", {
        filter: { billing_account: { _eq: ctx.billingAccountId }, user: { _eq: userId } },
        fields: ["role"],
        limit: 1,
      })
    ).catch(() => [])) as any[];
    roles.billingAccountRole = rows?.[0]?.role ?? null;
  }
  return roles;
}

/** What this person can see of the platform inbox. */
export async function supportViewerFor(event: H3Event): Promise<SupportViewer> {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  const actor = await getPlatformActor(event);
  const config = useRuntimeConfig();
  const [admins, accounts] = await Promise.all([
    directus().request(
      readAny("hoa_members", {
        filter: { user: { _eq: userId }, role: { _eq: config.public.directusRoleHoaAdmin }, status: { _eq: "active" } },
        fields: ["organization"],
        limit: -1,
      })
    ) as Promise<any[]>,
    directus()
      .request(
        readAny("billing_account_members", {
          filter: { user: { _eq: userId }, role: { _in: ["owner", "billing_admin"] } },
          fields: ["billing_account"],
          limit: -1,
        })
      )
      .catch(() => []) as Promise<any[]>,
  ]);
  return {
    userId,
    staff: opsCan(actor?.role, "support"),
    adminOf: new Set((admins ?? []).map((a) => idOf(a.organization)).filter((x): x is string => !!x)),
    accountAdminOf: new Set((accounts ?? []).map((a) => idOf(a.billing_account)).filter((x): x is string => !!x)),
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export const SUPPORT_REQUEST_FIELDS = [
  "id",
  "organization",
  "billing_account",
  "requester",
  "requester_name",
  "requester_email",
  "requester_roles",
  "category",
  "status",
  "priority",
  "subject",
  "page",
  "app_version",
  "source",
  "last_message_at",
  "last_message_by",
  "closed_at",
  "date_created",
] as const;

export async function readSupportRequest(id: string): Promise<any | null> {
  const rows = (await getTypedDirectus().request(
    readItems("support_requests", { filter: { id: { _eq: id } }, fields: SUPPORT_REQUEST_FIELDS, limit: 1 })
  )) as any[];
  return rows?.[0] ?? null;
}

export async function readSupportMessages(requestId: string, opts: { internal: boolean }): Promise<any[]> {
  const rows = (await getTypedDirectus().request(
    readItems("support_messages", {
      filter: { request: { _eq: requestId }, ...(opts.internal ? {} : { internal: { _neq: true } }) },
      fields: ["id", "author", "author_name", "author_kind", "body", "internal", "date_created"],
      sort: ["date_created"],
      limit: -1,
    })
  )) as any[];
  return (rows ?? []).sort((a, b) => String(a.date_created ?? "").localeCompare(String(b.date_created ?? "")));
}

async function orgRef(orgId: string | null): Promise<{ id: string; name: string; slug: string | null } | null> {
  if (!orgId) return null;
  const rows = (await directus()
    .request(readAny("hoa_organizations", { filter: { id: { _eq: orgId } }, fields: ["id", "name", "slug"], limit: 1 }))
    .catch(() => [])) as any[];
  const o = rows?.[0];
  return o ? { id: o.id, name: o.name || o.slug || o.id, slug: o.slug ?? null } : null;
}

/** The roles in a line, for the email to HOA Connect: "HOA Admin · president · owner". */
export function describeSupportRoles(r: SupportRoles | null | undefined): string {
  if (!r) return "";
  const parts = [
    r.membership === "hoa_admin" ? "HOA Admin" : r.membership === "property_manager" ? "Property Manager" : r.membership === "member" ? "Member" : null,
    ...r.boardTitles,
    r.residency,
    r.billingAccountRole ? `billing account ${r.billingAccountRole}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export async function createSupportRequest(input: {
  requester: { id: string } | null;
  organizationId: string | null;
  billingAccountId: string | null;
  roles: SupportRoles | null;
  category: SupportCategory;
  subject: string;
  body: string;
  page?: string | null;
  appVersion?: string | null;
  source?: "app" | "auto";
  autoKey?: string | null;
}): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const who = input.requester ? (await opsUsers([input.requester.id]).catch(() => null))?.get(input.requester.id) : null;
  const row = (await getTypedDirectus().request(
    createItem("support_requests", {
      organization: input.organizationId,
      billing_account: input.billingAccountId,
      requester: input.requester?.id ?? null,
      requester_name: who?.name ?? null,
      requester_email: who?.email ?? null,
      requester_roles: input.roles,
      category: input.category,
      status: "new",
      priority: input.category === "billing" && input.source === "auto" ? "high" : "normal",
      subject: input.subject,
      page: input.page ?? null,
      app_version: input.appVersion ?? null,
      source: input.source ?? "app",
      auto_key: input.autoKey ?? null,
      last_message_at: now,
      last_message_by: input.requester ? "requester" : "system",
    })
  )) as { id: string };
  await getTypedDirectus().request(
    createItem("support_messages", {
      request: row.id,
      author: input.requester?.id ?? null,
      author_name: who?.name ?? (input.requester ? null : "HOA Connect"),
      author_kind: input.requester ? "requester" : "system",
      body: input.body,
      internal: false,
    })
  );

  // Tell HOA Connect. And when a resident reports an app problem, their HOA
  // Admins are copied (§9.5): it's their community's app.
  const org = await orgRef(input.organizationId);
  await notifyPlatform({
    subject: `[${categoryLabel(input.category)}] ${input.subject}`,
    rows: [
      ["Community", org?.name],
      ["From", input.requester ? `${who?.name ?? "Someone"}${who?.email ? ` <${who.email}>` : ""}` : "HOA Connect (automatic)"],
      ["Their roles", describeSupportRoles(input.roles)],
      ["Page", input.page],
    ],
    body: input.body,
    link: { label: "Open in the support inbox", url: `${appUrl()}/ops/support/${row.id}` },
  });
  if (org && input.roles?.membership === "member" && !input.roles.boardTitles.length && input.requester) {
    await notifyCommunityAdmins(org, row.id, {
      subject: "A resident reported a problem with the app",
      message: input.subject,
      excludeUserId: input.requester.id,
    });
  }
  return { id: row.id };
}

async function notifyCommunityAdmins(
  org: { id: string },
  requestId: string,
  msg: { subject: string; message: string; excludeUserId?: string | null }
): Promise<void> {
  const config = useRuntimeConfig();
  const admins = (await directus()
    .request(
      readAny("hoa_members", {
        filter: { organization: { _eq: org.id }, role: { _eq: config.public.directusRoleHoaAdmin }, status: { _eq: "active" } },
        fields: ["user"],
        limit: -1,
      })
    )
    .catch(() => [])) as any[];
  const ids = [...new Set((admins ?? []).map((a) => idOf(a.user)).filter((x): x is string => !!x))];
  if (!ids.length) return;
  await notifyUsers({
    organizationId: org.id,
    recipientUserIds: ids,
    category: "request",
    subject: msg.subject,
    message: msg.message,
    collection: "support_requests",
    item: requestId,
    path: `/support/${requestId}`,
    excludeUserId: msg.excludeUserId ?? null,
    email: { bodyHtml: `<p>${escapeHtml(msg.message)}</p>`, cta: { label: "View the request", path: `/support/${requestId}` } },
  }).catch((e: any) => console.error("[support] admins not notified:", e?.message ?? e));
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Add a message. Staff replies that aren't internal notes go to the requester
 * (bell and email, or email alone when the request has no community), and set
 * the request to "waiting on you". A requester's (or their HOA Admin's) reply
 * goes to HOA Connect and reopens it.
 */
export async function addSupportMessage(input: {
  request: any;
  author: { id: string } | null;
  kind: "requester" | "community_admin" | "account_admin" | "staff";
  body: string;
  internal?: boolean;
}): Promise<{ id: string }> {
  const req = input.request;
  const who = input.author ? (await opsUsers([input.author.id]).catch(() => null))?.get(input.author.id) : null;
  const staff = input.kind === "staff";
  const internal = staff && input.internal === true;
  const row = (await getTypedDirectus().request(
    createItem("support_messages", {
      request: req.id,
      author: input.author?.id ?? null,
      author_name: staff ? `${who?.name ?? "HOA Connect"} (HOA Connect)` : (who?.name ?? null),
      author_kind: staff ? "staff" : input.kind === "requester" ? "requester" : "admin",
      body: input.body,
      internal,
    })
  )) as { id: string };
  if (internal) return row;

  const now = new Date().toISOString();
  await getTypedDirectus().request(
    updateItem("support_requests", req.id, {
      last_message_at: now,
      last_message_by: staff ? "staff" : "requester",
      status: staff ? "waiting" : "open",
      ...(staff ? {} : { closed_at: null }),
    })
  );

  if (staff) {
    await notifyRequester(req, input.body);
  } else {
    const org = await orgRef(idOf(req.organization));
    await notifyPlatform({
      subject: `Re: ${req.subject}`,
      rows: [
        ["Community", org?.name],
        ["From", `${who?.name ?? "Someone"}${input.kind === "community_admin" ? " (HOA Admin)" : ""}`],
      ],
      body: input.body,
      link: { label: "Open in the support inbox", url: `${appUrl()}/ops/support/${req.id}` },
    });
  }
  return row;
}

async function notifyRequester(req: any, body: string): Promise<void> {
  const orgId = idOf(req.organization);
  const requester = idOf(req.requester);
  const excerpt = body.length > 280 ? `${body.slice(0, 277)}…` : body;
  if (orgId && requester) {
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [requester],
      category: "request",
      subject: `HOA Connect replied: ${req.subject}`,
      message: excerpt,
      collection: "support_requests",
      item: req.id,
      path: `/support/${req.id}`,
      email: {
        heading: "HOA Connect replied to your request",
        bodyHtml: `<p><strong>${escapeHtml(req.subject)}</strong></p><p style="white-space:pre-wrap">${escapeHtml(body)}</p>`,
        cta: { label: "Reply or view the request", path: `/support/${req.id}` },
      },
    }).catch((e: any) => console.error("[support] requester not notified:", e?.message ?? e));
    return;
  }
  // No community (an agency billing account's request): email them directly.
  if (req.requester_email) {
    const { sendEmail } = await import("./sendgrid");
    await sendEmail({
      to: req.requester_email,
      subject: `HOA Connect replied: ${req.subject}`,
      text: `${body}\n\nReply or view the request: ${appUrl()}/support/${req.id}`,
    }).catch((e: any) => console.error("[support] requester not emailed:", e?.message ?? e));
  }
}

/**
 * An entry HOA Connect raises for itself: a failed payment, a signup that never
 * completed, a webhook that errored. One per `autoKey` (unique), so Stripe
 * retrying an event doesn't open a second. Never throws: the callers are the
 * Stripe webhook's handlers.
 */
export async function openAutoSupportRequest(input: {
  autoKey: string;
  category: SupportCategory;
  subject: string;
  body: string;
  organizationId?: string | null;
  billingAccountId?: string | null;
}): Promise<{ id: string; created: boolean } | null> {
  try {
    const existing = (await getTypedDirectus().request(
      readItems("support_requests", { filter: { auto_key: { _eq: input.autoKey } }, fields: ["id"], limit: 1 })
    )) as any[];
    if (existing?.[0]) return { id: existing[0].id, created: false };
    const row = await createSupportRequest({
      requester: null,
      organizationId: input.organizationId ?? null,
      billingAccountId: input.billingAccountId ?? null,
      roles: null,
      category: input.category,
      subject: input.subject,
      body: input.body,
      source: "auto",
      autoKey: input.autoKey,
    });
    return { id: row.id, created: true };
  } catch (e: any) {
    console.error(`[support] automatic entry ${input.autoKey} not opened:`, e?.message ?? e);
    return null;
  }
}
