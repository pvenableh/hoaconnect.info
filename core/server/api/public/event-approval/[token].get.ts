import { readItems } from "@directus/sdk";

/**
 * Public (no-auth) read for a tokenized milestone approval link. Resolves the
 * token to exactly ONE event and returns only what an approver needs to
 * decide — milestone + its project/org context. Leaks nothing else: no other
 * events, no member data, no IDs beyond the event itself.
 *
 * Returns 404 for an unknown/expired/already-decided token (indistinguishable
 * on purpose), 429 when hammered.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") || "";
  if (!token || token.length < 16) throw createError({ statusCode: 404, message: "Not found" });

  if (!rateLimit(`approval-get:${clientIp(event)}`, 60, 60_000)) {
    throw createError({ statusCode: 429, message: "Too many requests" });
  }

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { approval_token: { _eq: token } },
      fields: [
        "id", "title", "description", "type", "event_date", "end_date",
        "cost_amount", "approval", "approval_token_expires",
        { project: ["title", { organization: ["name"] }] },
      ],
      limit: 1,
    })
  );
  const ev = rows?.[0] as any;
  if (!ev) throw createError({ statusCode: 404, message: "Not found" });

  // Expired or already decided → treat as gone.
  const exp = ev.approval_token_expires ? new Date(ev.approval_token_expires).getTime() : 0;
  if (!exp || exp < Date.now()) throw createError({ statusCode: 410, message: "This approval link has expired" });
  if (ev.approval !== "needs_approval") throw createError({ statusCode: 410, message: "This milestone has already been decided" });

  return {
    title: ev.title,
    description: ev.description,
    type: ev.type,
    event_date: ev.event_date,
    end_date: ev.end_date,
    cost_amount: ev.cost_amount,
    project_title: ev.project?.title || null,
    org_name: ev.project?.organization?.name || null,
  };
});
