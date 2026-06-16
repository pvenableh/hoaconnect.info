import { createItem } from "@directus/sdk";

/**
 * Elevated request creation for property managers.
 *
 * Property managers have no direct `create` on hoa_requests (their policy is
 * read + update only). Creating a request — chiefly a violation — is a gated
 * action: a violation requires the per-manager "violations" grant; any other
 * type requires the "inquiries" grant. Org admins are always allowed. The
 * client passes an already-formed payload (status/metadata computed from the
 * shared requestWorkflows config); the server stamps organization + submitted_by
 * and authorizes.
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
