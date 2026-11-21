/**
 * POST /api/org/forms  { orgId, title, description?, audience?, dueDate?, document? }
 *
 * An admin creates a form to sign (a draft). Gated by plan: a community whose
 * plan does not include forms to sign gets 402 and the upgrade sentence.
 */
import { createItem } from "@directus/sdk";

const AUDIENCES = ["owners", "tenants", "board", "all"];

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "");
  const title = String(body?.title || "").trim().slice(0, 200);
  if (!orgId || !title) throw createError({ statusCode: 400, statusMessage: "orgId and title are required" });
  const audience = AUDIENCES.includes(body?.audience) ? body.audience : "owners";

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.hats.admin) throw createError({ statusCode: 403, statusMessage: "Only this community's administrators can create forms." });
  await requireFormsPlan(orgId);

  const row = (await getTypedDirectus().request(
    createItem("hoa_forms", {
      organization: orgId,
      title,
      description: body?.description ? String(body.description).slice(0, 5000) : null,
      audience,
      due_date: body?.dueDate ? String(body.dueDate).slice(0, 10) : null,
      document: body?.document ? String(body.document) : null,
      status: "draft",
    } as never)
  )) as { id: string };
  return { ok: true, id: String(row.id) };
});
