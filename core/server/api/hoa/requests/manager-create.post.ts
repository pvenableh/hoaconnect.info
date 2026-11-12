import { readItems, createItem } from "@directus/sdk";

const idOf = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : (v.id ?? null);

/**
 * Elevated request creation for property managers.
 *
 * Property managers have no direct `create` on hoa_requests (their policy is
 * read + update only). Creating a request — chiefly a violation — is a gated
 * action: a violation requires the per-manager "violations" grant; any other
 * type requires the "inquiries" grant. Org admins are always allowed. The
 * client passes an already-formed payload (status/metadata computed from the
 * shared requestWorkflows config); the server stamps organization + submitted_by
 * and authorizes. The `unit` and `member` the body names must be rows of that
 * same organization (the write is on the admin client, so this route is the
 * only thing stopping a request in A from pointing at B's unit or member).
 *
 * `attachments` are NOT org-checked here: the request form uploads them as plain
 * files with no folder and no owning row, so nothing can prove which community
 * they belong to, and refusing them would refuse legitimate uploads.
 *
 * Body: { organization, type, title, status, description?, priority?, category?,
 *         unit?, member?, due_date?, attachments?, metadata? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const {
    organization,
    type,
    title,
    status,
    description,
    priority,
    category,
    unit,
    member,
    due_date,
    attachments,
    metadata,
  } = body || {};

  if (!organization || !type || !title) {
    throw createError({ statusCode: 400, message: "organization, type and title are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);

  // Violations need the "violations" grant; everything else the "inquiries" grant.
  const grantKey = type === "violation" ? "violations" : "inquiries";
  await requireAdminOrManagerGrant(event, organization, grantKey);

  const directus = getTypedDirectus();

  // The unit and member this request concerns must be this organization's own.
  for (const [collection, id, label] of [
    ["hoa_units", unit, "unit"],
    ["hoa_members", member, "member"],
  ] as const) {
    if (!id) continue;
    const rows = (await directus.request(
      readItems(collection, {
        filter: { id: { _eq: id } },
        fields: ["id", "organization"],
        limit: 1,
      } as never)
    )) as any[];
    if (idOf(rows?.[0]?.organization) !== organization) {
      throw createError({
        statusCode: 403,
        message: `That ${label} is not in this community`,
      });
    }
  }

  const created = await directus.request(
    createItem("hoa_requests", {
      organization,
      type,
      title,
      status: status || "open",
      submitted_by: userId,
      description: description || null,
      priority: priority || "normal",
      category: category || null,
      unit: unit || null,
      member: member || null,
      due_date: due_date || null,
      attachments: attachments?.length ? attachments : null,
      metadata: metadata || null,
    } as any)
  );

  return { request: created };
});
