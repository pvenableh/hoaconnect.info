// GET /api/support/requests/:id — one platform request and its thread, for the
// requester, their community's HOA Admins, or the billing account's admins.
// Internal notes (HOA Connect's own) never leave the console. Anyone else: 404.
import { supportAccess } from "#core/shared/support/access";
import { readSupportMessages, readSupportRequest, supportViewerFor } from "#core/server/utils/support";

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  const viewer = await supportViewerFor(event);
  const id = getRouterParam(event, "id") ?? "";
  const req = id ? await readSupportRequest(id) : null;
  const access = req
    ? supportAccess({ ...viewer, staff: false }, { requester: idOf(req.requester), organization: idOf(req.organization), billing_account: idOf(req.billing_account) })
    : null;
  if (!req || !access) throw createError({ statusCode: 404, message: "Request not found" });

  const messages = await readSupportMessages(req.id, { internal: false });
  return {
    request: {
      id: req.id,
      category: req.category,
      status: req.status,
      subject: req.subject,
      dateCreated: req.date_created ?? null,
      mine: access === "requester",
      requester: access === "requester" ? "You" : req.requester_name ?? null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      // HOA Connect's messages always read as HOA Connect, even to staff who asked themselves.
      author:
        m.author_kind === "staff" || m.author_kind === "system"
          ? (m.author_name ?? "HOA Connect")
          : idOf(m.author) === viewer.userId
            ? "You"
            : (m.author_name ?? null),
      fromHoaConnect: m.author_kind === "staff" || m.author_kind === "system",
      body: m.body,
      at: m.date_created ?? null,
    })),
    canReply: true,
  };
});
