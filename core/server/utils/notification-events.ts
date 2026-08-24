/**
 * The server half of the notify-event path: hydrate the row, work out who the
 * plan's audience descriptor actually names, and hand the result to
 * `notifyUsers`.
 *
 * The division of labour matters. `core/shared/notifications/events.ts` decides
 * WHAT is news and what it says — pure, testable, no Directus. This decides WHO,
 * which needs the database and therefore can't be pure. Keeping them apart is
 * what makes the copy and the category unit-testable, and it's why the client
 * never gets to influence either: it sends `(collection, action, itemId)`, and
 * every string a member reads is derived from the row we re-read ourselves.
 *
 * Everything here runs on the admin token, so each resolver is written as a
 * scoped read — `organization: { _eq: orgId }` in the filter, not a check after
 * the fact. `notifyUsers` re-scopes the final list anyway (that gate is the
 * program's non-negotiable), but a resolver that reads across communities and
 * relies on a later filter to save it is one refactor away from a leak.
 */

import { readItem, readItems, readNotifications } from "@directus/sdk";
import {
  planNotifyEvent,
  type NotifyAudience,
  type NotifyEventPlan,
} from "#core/shared/notifications/events";
import { notifyUsers } from "./notify";

/** Per-collection field sets. Enough to route and to write the copy, no more. */
const HYDRATE_FIELDS: Record<string, string[]> = {
  hoa_channel_mentions: [
    "id",
    "mentioned_user",
    "mentioned_by.id",
    "mentioned_by.first_name",
    "mentioned_by.last_name",
    "channel.id",
    "channel.name",
    "channel.organization",
    "message.id",
    "message.content",
    "date_created",
  ],
  hoa_meetings: [
    "id",
    "title",
    "type",
    "meeting_date",
    "is_published",
    "target_audience",
    "organization",
    "user_created",
  ],
  hoa_announcements: [
    "id",
    "title",
    "content",
    "status",
    "target_audience",
    "organization",
    "user_created",
  ],
  hoa_comments: [
    "id",
    "status",
    "body",
    "is_internal",
    "target_collection",
    "target_id",
    "organization",
    "user_created.id",
    "user_created.first_name",
    "user_created.last_name",
  ],
};

const idOf = (v: any): string | null =>
  !v ? null : typeof v === "string" ? v : v?.id ? String(v.id) : null;

/**
 * The org a row belongs to. Mentions have no `organization` of their own — they
 * hang off a channel — so this is per-collection rather than a field lookup.
 */
function orgIdOf(collection: string, item: Record<string, any>): string | null {
  if (collection === "hoa_channel_mentions") return idOf(item.channel?.organization);
  return idOf(item.organization);
}

export interface NotifyEventResult {
  ok: boolean;
  reason?: string;
  bell?: number;
  push?: number;
  email?: number;
}

/**
 * Announce one event. Returns `{ok:false, reason}` for the many non-failures —
 * a draft comment, an unpublished meeting, a republish that already fired —
 * because "nothing to say" is the normal outcome and shouldn't read as an error
 * to the caller or in the logs.
 *
 * `authorize` is called with the org taken from the ROW, once we've read it, and
 * a false answer stops everything. That ordering is the point: the caller names
 * an item, not a community, so the only org that can be authorized against is
 * the one that actually owns the row. Passing the callback rather than an
 * expected id also keeps this to a single read — the endpoint would otherwise
 * have to fetch the row just to learn which org to check.
 */
export async function announceEvent(input: {
  collection: string;
  action: "create" | "update";
  itemId: string;
  /** Gate on the row's own org. Omit for server-internal callers. */
  authorize?: (orgId: string) => boolean | Promise<boolean>;
  /** The user who triggered it, so they aren't notified about themselves. */
  actorId?: string | null;
  origin?: string | null;
}): Promise<NotifyEventResult> {
  const fields = HYDRATE_FIELDS[input.collection];
  if (!fields) return { ok: false, reason: "collection is not notifiable" };

  const admin = getTypedDirectus();

  let item: Record<string, any> | null = null;
  try {
    item = (await admin.request(
      readItem(input.collection as never, input.itemId, { fields } as never)
    )) as Record<string, any>;
  } catch (e) {
    console.warn("[notify-event] could not read", input.collection, (e as Error).message);
    return { ok: false, reason: "item not readable" };
  }
  if (!item) return { ok: false, reason: "item not found" };

  const orgId = orgIdOf(input.collection, item);
  if (!orgId) return { ok: false, reason: "item has no organization" };
  if (input.authorize && !(await input.authorize(orgId))) {
    return { ok: false, reason: "not authorized for this organization" };
  }

  const plan = planNotifyEvent({
    collection: input.collection,
    action: input.action,
    item,
    itemId: input.itemId,
  });
  if (!plan) return { ok: false, reason: "not a notifiable change" };

  if (plan.once && (await alreadyAnnounced(plan))) {
    return { ok: false, reason: "already announced" };
  }

  const recipients = await resolveAudience(orgId, plan.audience, item);
  if (!recipients.length) return { ok: true, bell: 0, push: 0, email: 0 };

  const counts = await notifyUsers({
    organizationId: orgId,
    recipientUserIds: recipients,
    category: plan.category,
    subject: plan.subject,
    message: plan.message,
    collection: plan.collection,
    item: plan.item,
    path: plan.path,
    origin: input.origin ?? null,
    excludeUserId: input.actorId || plan.actorId || null,
  });

  return { ok: true, ...counts };
}

/**
 * Has this (collection, item) already produced a bell row?
 *
 * The cheapest honest idempotency available: `directus_notifications` has no
 * place to stamp an event key, but it does carry collection + item, and for the
 * `once` events (a state transition, not a message) one row is one announcement.
 * A republish therefore stays quiet, and so does a double-fire from a client
 * that retried. Read failure returns false — a duplicate notification is a much
 * smaller harm than a silently lost one.
 */
async function alreadyAnnounced(plan: NotifyEventPlan): Promise<boolean> {
  try {
    const rows = (await getTypedDirectus().request(
      readNotifications({
        filter: { collection: { _eq: plan.collection }, item: { _eq: plan.item } },
        fields: ["id"],
        limit: 1,
      })
    )) as Array<{ id: string }>;
    return (rows?.length ?? 0) > 0;
  } catch (e) {
    console.warn("[notify-event] dedupe check failed; announcing anyway", (e as Error).message);
    return false;
  }
}

/** Turn an audience descriptor into user ids, org-scoped at the read. */
async function resolveAudience(
  orgId: string,
  audience: NotifyAudience,
  item: Record<string, any>
): Promise<string[]> {
  switch (audience.kind) {
    case "user":
      return [audience.id];

    case "admins":
      return adminUserIds(orgId);

    case "org-audience":
      return orgAudienceUserIds(orgId, audience.audience);

    case "participants":
      return participantUserIds(orgId, audience, item);
  }
}

/** Admins and property managers — the people a community expects to be told. */
export async function adminUserIds(orgId: string): Promise<string[]> {
  const config = useRuntimeConfig();
  const roles = [
    config.public.directusRoleHoaAdmin,
    config.public.directusRolePropertyManager,
  ].filter(Boolean) as string[];
  if (!roles.length) return [];

  const rows = (await getTypedDirectus().request(
    readItems("hoa_members", {
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "active" },
        role: { _in: roles },
      },
      fields: ["user"],
      limit: -1,
    })
  )) as Array<{ user: unknown }>;
  return [...new Set((rows || []).map((r) => idOf(r.user)).filter(Boolean) as string[])];
}

/**
 * Everyone an announcement or meeting is addressed to.
 *
 * The audience vocabulary comes from the content collections
 * (`all | owners | tenants | board_members`) and has to be translated to the
 * membership model, where "owners"/"tenants" is `member_type` and board
 * membership lives in a separate terms collection. `all` is the common case and
 * is deliberately the fallback for an unrecognised tag: a meeting notice reaching
 * more members than intended is a smaller failure than one reaching nobody.
 */
export async function orgAudienceUserIds(orgId: string, audience: string): Promise<string[]> {
  const admin = getTypedDirectus();
  const tag = String(audience || "all").replace(/\s+/g, "_").toLowerCase();

  if (tag === "board_members") {
    const now = new Date().toISOString();
    const terms = (await admin.request(
      readItems("hoa_board_members", {
        filter: {
          hoa_member: { organization: { _eq: orgId }, status: { _eq: "active" } },
        },
        fields: ["term_end", { hoa_member: ["user"] }],
        limit: -1,
      })
    )) as Array<{ term_end?: string | null; hoa_member?: { user?: unknown } }>;
    return [
      ...new Set(
        (terms || [])
          .filter((t) => !t.term_end || t.term_end >= now)
          .map((t) => idOf(t.hoa_member?.user))
          .filter(Boolean) as string[]
      ),
    ];
  }

  const filter: Record<string, unknown> = {
    organization: { _eq: orgId },
    status: { _eq: "active" },
  };
  if (tag === "owners" || tag === "tenants") {
    filter.member_type = { _eq: tag === "owners" ? "owner" : "tenant" };
  }

  const rows = (await admin.request(
    readItems("hoa_members", { filter: filter as never, fields: ["user"], limit: -1 })
  )) as Array<{ user: unknown }>;
  return [...new Set((rows || []).map((r) => idOf(r.user)).filter(Boolean) as string[])];
}

/**
 * The people already in a conversation: everyone who has commented on the same
 * target, plus whoever the target itself points at (a request's submitter and
 * assignee). An internal note goes to staff only — that is the whole meaning of
 * the flag, and the one place where `is_internal` changes anything.
 */
async function participantUserIds(
  orgId: string,
  audience: Extract<NotifyAudience, { kind: "participants" }>,
  item: Record<string, any>
): Promise<string[]> {
  const admin = getTypedDirectus();

  if (item.is_internal) return adminUserIds(orgId);

  const ids = new Set<string>();

  const siblings = (await admin.request(
    readItems("hoa_comments", {
      filter: {
        organization: { _eq: orgId },
        target_collection: { _eq: audience.collection },
        target_id: { _eq: audience.id },
        status: { _eq: "published" },
        is_internal: { _neq: true },
      },
      fields: ["user_created"],
      limit: 200,
    })
  )) as Array<{ user_created: unknown }>;
  for (const c of siblings || []) {
    const uid = idOf(c.user_created);
    if (uid) ids.add(uid);
  }

  // A request's own people, so the first comment on a request still reaches
  // someone rather than only the person who wrote it.
  if (audience.collection === "hoa_requests") {
    try {
      const target = (await admin.request(
        readItem("hoa_requests", audience.id, {
          fields: ["id", "organization", "submitted_by", "assigned_to"],
        } as never)
      )) as Record<string, any>;
      if (idOf(target?.organization) === orgId) {
        for (const uid of [idOf(target.submitted_by), idOf(target.assigned_to)]) {
          if (uid) ids.add(uid);
        }
      }
    } catch {
      // The comment still reaches the other commenters.
    }
  }

  return [...ids];
}
