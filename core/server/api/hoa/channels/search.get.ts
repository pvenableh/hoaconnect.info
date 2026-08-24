/**
 * GET /api/hoa/channels/search?q=&channel=&limit=
 *
 * Message search across the channels the caller can read, or within one of
 * them. Adapted from Earnest's `messages/search.get.ts`.
 *
 * Search used to run in the browser against the Directus proxy, which was
 * access-correct by accident: the caller's own token carries the
 * membership-scoped read policy, so the database refused what the query did not
 * bother to exclude. Moving it server-side gives the results what they were
 * missing — the channel each hit belongs to, and its author, so a hit is
 * actually navigable — but it also spends the admin token, which is why the
 * readable-channel scope is computed explicitly first (`channel-scope.ts`) and
 * the query is fenced to those ids. A member must never be able to grep a
 * channel they cannot open.
 *
 * Two characters minimum: a one-character `_icontains` over every message in a
 * community is a table scan that returns everything, which is neither a search
 * result nor cheap.
 */

import { readItems } from "@directus/sdk";

const stripHtml = (html: unknown): string =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const query = getQuery(event);

  const q = String(query.q ?? "").trim();
  const channelScope = String(query.channel ?? "").trim() || null;
  const organizationId = String(query.organization ?? "").trim() || null;
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);

  if (q.length < 2) return { items: [], query: q };

  const directus = getTypedDirectus();

  const scope = await readableChannelIds({
    directus,
    userId,
    organizationId,
    hasOrgWideAccess: async (orgId) => {
      if ((await checkAdminAccess(event, orgId)).isAdmin) return true;
      return await isActiveBoardMember(directus, userId, orgId);
    },
  });

  // Narrowing to one channel can only ever shrink the scope, never escape it.
  const channelIds = channelScope ? scope.filter((id) => id === channelScope) : scope;
  if (!channelIds.length) return { items: [], query: q };

  const rows = (await directus.request(
    readItems("hoa_channel_messages", {
      filter: {
        _and: [
          { channel: { _in: channelIds } },
          { status: { _eq: "published" } },
          { content: { _icontains: q } },
        ],
      } as never,
      fields: [
        "id",
        "content",
        "date_created",
        { channel: ["id", "name", "slug"] },
        { user_created: ["id", "first_name", "last_name", "avatar"] },
      ],
      sort: ["-date_created"],
      limit,
    })
  )) as unknown as any[];

  return {
    query: q,
    items: (rows || []).map((m) => ({
      id: m.id,
      content: m.content,
      snippet: stripHtml(m.content).slice(0, 160),
      date_created: m.date_created ?? null,
      channel:
        m.channel && typeof m.channel === "object"
          ? { id: m.channel.id, name: m.channel.name, slug: m.channel.slug }
          : null,
      author:
        m.user_created && typeof m.user_created === "object"
          ? {
              id: m.user_created.id,
              first_name: m.user_created.first_name ?? null,
              last_name: m.user_created.last_name ?? null,
              avatar: m.user_created.avatar ?? null,
            }
          : null,
    })),
  };
});
