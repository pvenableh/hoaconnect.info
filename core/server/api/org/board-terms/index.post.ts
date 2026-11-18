/**
 * POST /api/org/board-terms — add a board term (the Members page's "Add Board
 * Position"). Admin only, as the other board-term actions are. The person must
 * be a member of the community. Written with the app's token: the HOA Admin
 * policy has no create on hoa_board_members, because Directus cannot check the
 * person a new term names (scripts/lib/admin-scope-perms.ts). Edits go
 * through PATCH board-terms/[id], which never changes the person.
 */
import { createItem, readItem } from "@directus/sdk";
import { requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { createTermBody } from "#core/shared/responsibilities/schemas";
import { sentences } from "#core/shared/responsibilities/activity";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const { orgId, ...term } = await readBodyWith(event, createTermBody);
  const access = await requireResponsibilitiesAdmin(event, orgId);

  const directus = getTypedDirectus();
  const member = (await directus
    .request(readItem("hoa_members" as never, term.hoa_member, { fields: ["id", "organization", "first_name", "last_name"] } as never))
    .catch(() => null)) as { organization?: unknown; first_name?: string | null; last_name?: string | null } | null;
  if (!member || asId(member.organization) !== orgId) {
    throw createError({ statusCode: 400, message: "That person isn't a member of this community." });
  }

  const created = (await directus.request(
    createItem("hoa_board_members" as never, { ...term, status: term.status ?? "published" } as never)
  )) as unknown as { id: string };

  const person = [member.first_name, member.last_name].filter(Boolean).join(" ") || "A member";
  // Seats changed: money approvals waiting on the board are asked again (docs/spec-money-approvals.md).
  await settleAfterBoardChange(event, orgId);
  await logRegisterActivity(event, access, {
    type: "board_term",
    collection: "hoa_board_members",
    id: created.id,
    label: sentences.termAdded(person, term.title),
    metadata: { action: "create", term },
  });
  return { id: created.id };
});
