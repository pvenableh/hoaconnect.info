import { readItems, updateItem } from "@directus/sdk";

/**
 * Public (no-auth) decision for a tokenized milestone approval link.
 * Body: { decision: "approved" | "rejected", name?, note? }.
 *
 * The token is single-use: a valid decision consumes it (token cleared), so
 * the link can't be replayed. Strictly rate-limited. Notifies whoever
 * requested approval in-app (best-effort). Leaks nothing on failure.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") || "";
  if (!token || token.length < 16) throw createError({ statusCode: 404, message: "Not found" });

  if (!rateLimit(`approval-post:${clientIp(event)}`, 20, 60_000) || !rateLimit(`approval-post-tok:${token}`, 10, 60_000)) {
    throw createError({ statusCode: 429, message: "Too many requests" });
  }

  const body = await readBody(event);
  const decision = body?.decision === "rejected" ? "rejected" : "approved";
  const name = body?.name ? String(body.name).slice(0, 120).trim() : "";
  const note = body?.note ? String(body.note).slice(0, 1000).trim() : "";

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("hoa_project_events", {
      filter: { approval_token: { _eq: token } },
      fields: ["id", "title", "approval", "approval_token_expires", "organization", "user_created"],
      limit: 1,
    })
  );
  const ev = rows?.[0] as any;
  if (!ev) throw createError({ statusCode: 404, message: "Not found" });

  const exp = ev.approval_token_expires ? new Date(ev.approval_token_expires).getTime() : 0;
  if (!exp || exp < Date.now()) throw createError({ statusCode: 410, message: "This approval link has expired" });
  if (ev.approval !== "needs_approval") throw createError({ statusCode: 410, message: "This milestone has already been decided" });

  const stamp = [name && `Decided by ${name} via link.`, note].filter(Boolean).join(" ");

  await directus.request(
    updateItem("hoa_project_events", ev.id, {
      approval: decision,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
      approval_note: stamp || null,
      approval_token: null, // single-use
      approval_token_expires: null,
    } as any)
  );

  // Ping the requester in-app (best-effort).
  const requestedBy =
    (typeof ev.user_created === "string" ? ev.user_created : ev.user_created?.id) || null;
  await notifyApprovalDecided({ id: ev.id, title: ev.title }, null, decision === "approved", requestedBy).catch(() => {});

  return { ok: true, decision };
});
