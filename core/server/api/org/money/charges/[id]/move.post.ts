/**
 * POST /api/org/money/charges/[id]/move — ask to move a charge to the right
 * household (docs/spec-charge-corrections.md, decision 3). money:enter.
 *
 * A charge entered against the wrong household gives up income from one
 * household, so moving it takes the same approval as a waiver: this opens a
 * `move` approval with the proposed household and the reason, and tells the
 * approvers. Whoever asks can never decide it. Nothing changes until the rule
 * is met; then the charge moves, its unpaid late fees are cancelled, and both
 * households are told.
 *
 * Only while nothing is paid on it or its late fees, with no waiver or move
 * waiting (409). The household must be another active member of the
 * community (422). Another community's charge is 404.
 *
 * Body: { orgId, member, reason }.
 */
import { z } from "zod";
import { moveRefusal } from "#core/shared/money/charge-corrections";

const body = z.object({
  orgId: z.string().min(1, "orgId is required"),
  member: z.string({ message: "Choose the household it belongs to." }).trim().min(1, "Choose the household it belongs to."),
  reason: z.string({ message: "Say why it should move." }).trim().min(1, "Say why it should move.").max(1000),
});

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, member, reason } = parsed.data;

  const viewer = await requireMoneyEnter(event, orgId);
  const charge = await loadCorrectableCharge(orgId, id);
  const refusal = moveRefusal(await chargeFacts(orgId, charge));
  if (refusal) throw createError({ statusCode: 409, message: refusal });

  const from = idOf(charge.member);
  const to = member === from ? null : await loadHousehold(orgId, member);
  if (!to) throw createError({ statusCode: 422, message: "Choose another household in this community." });

  const { approval, view } = await openApproval({
    orgId,
    kind: "move",
    charge: id,
    round: 1,
    requestedBy: viewer.userId,
    excluded: [],
    reason,
    proposed: { member: String(to.id), unit: await householdUnit(String(to.id)), from_member: from, from_unit: idOf(charge.unit) },
    seats: await loadCurrentSeats(orgId),
  });
  const origin = await safeRequestOrigin(event).catch(() => null);
  await notifyApprovers({ orgId, approval, view, charge: { ...chargeSubject(charge), moveToName: chargeHousehold(to) }, origin });
  return { approval: { id: approval.id, state: view.state, needed: view.needed } };
});

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? (((v as { id?: unknown }).id as string) ?? null) : typeof v === "string" && v ? v : null;
