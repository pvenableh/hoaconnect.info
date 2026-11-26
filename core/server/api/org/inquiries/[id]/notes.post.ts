/**
 * POST /api/org/inquiries/:id/notes — { orgId, body, parentComment?,
 * attachments?, mentionedUsers? }: post an internal note on a request
 * (docs/spec-delegation.md). Written with the app's token, authored as the caller
 * (createAs), always `is_internal`, behind the request's gate
 * (readAreaRequest) and the caller's posting pause. A reply names a comment on
 * the same request. The page announces the note as it announces any comment,
 * which tells staff only.
 */
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { requireOrgId } from "#core/server/utils/area-reads";
import { NOTE_FIELDS, readAreaRequest } from "#core/server/utils/area-requests";
import { requireCanPost } from "#core/server/utils/member-restrictions";
import { createAs } from "#core/server/utils/create-as";

const Body = z.object({
  orgId: z.string().optional(),
  body: z.string().max(50_000),
  parentComment: z.string().trim().min(1).nullable().optional(),
  attachments: z.array(z.string().trim().min(1)).max(20).optional(),
  mentionedUsers: z.array(z.string().trim().min(1)).max(50).optional(),
});

const isBlank = (html: string) => html.replace(/<[^>]*>/g, "").trim().length === 0;

export default defineEventHandler(async (event) => {
  const raw = await readBody(event).catch(() => null);
  const orgId = requireOrgId(raw?.orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Invalid body" });
  const { body, parentComment, attachments, mentionedUsers } = parsed.data;
  if (isBlank(body) && !attachments?.length) throw createError({ statusCode: 400, message: "Write a note first." });

  await readAreaRequest(event, orgId, id);
  await requireCanPost(event, orgId);
  const session = await requireUserSession(event);
  const userId = String(session.user?.id ?? "");

  const directus = getTypedDirectus();
  if (parentComment) {
    const parents = (await directus.request(
      readItems("hoa_comments" as any, {
        filter: {
          id: { _eq: parentComment },
          organization: { _eq: orgId },
          target_collection: { _eq: "hoa_requests" },
          target_id: { _eq: id },
          status: { _neq: "deleted" },
        },
        fields: ["id"],
        limit: 1,
      } as any)
    )) as any[];
    if (!parents?.length) throw createError({ statusCode: 400, message: "That comment is not on this request." });
  }

  const note: any = await createAs(
    "hoa_comments",
    {
      status: "published",
      target_collection: "hoa_requests",
      target_id: id,
      organization: orgId,
      parent_comment: parentComment ?? null,
      body,
      attachments: attachments?.length ? attachments : null,
      mentioned_users: mentionedUsers?.length ? mentionedUsers : null,
      is_internal: true,
    },
    userId,
    { query: { fields: [...NOTE_FIELDS] } }
  );
  return { note };
});
