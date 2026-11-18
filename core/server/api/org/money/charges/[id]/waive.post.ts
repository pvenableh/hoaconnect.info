/**
 * POST /api/org/money/charges/[id]/waive — ask to waive an owner charge, or
 * part of it (docs/spec-money-approvals.md, the `waive` rows;
 * docs/spec-charge-corrections.md, decisions 1 and 4). money:enter.
 *
 * Waiving gives up income the community is owed, so it takes the same
 * approval as spending: this opens a `waive` approval with the reason, links
 * it as the charge's `waiver`, and tells the approvers. Whoever asks can
 * never decide it. Nothing changes on the charge until the rule is met.
 *
 *   amount absent    all that remains, and the charge's unpaid late fees
 *                    with it (the approvers are told their total)
 *   amount present   a partial waiver: more than 0, less than what remains.
 *                    Lowering a charge is this, never a direct edit
 *
 * Refused (409): a charge already paid or canceled, or one with a waiver or
 * a move awaiting approval. An amount out of range is 422. Another
 * community's charge is 404.
 *
 * Body: { orgId, reason, amount? }.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { cents, fromCents, isOpenChargeStatus, waiveRefusal } from "#core/shared/money/charge-corrections";

const body = z.object({
  orgId: z.string().min(1, "orgId is required"),
  reason: z.string({ message: "Say why it should be waived." }).trim().min(1, "Say why it should be waived.").max(1000),
  amount: z.coerce.number({ message: "Enter an amount." }).finite().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, reason } = parsed.data;
  const amount = parsed.data.amount == null ? null : fromCents(cents(parsed.data.amount));

  const viewer = await requireMoneyEnter(event, orgId);
  const charge = await loadCorrectableCharge(orgId, id);
  const facts = await chargeFacts(orgId, charge);
  const refusal = waiveRefusal(facts, amount);
  if (refusal) {
    throw createError({ statusCode: !isOpenChargeStatus(charge.status) || facts.approvalOpen ? 409 : 422, message: refusal });
  }

  const { approval, view } = await openApproval({
    orgId,
    kind: "waive",
    charge: id,
    round: 1,
    requestedBy: viewer.userId,
    excluded: [],
    reason,
    amount,
    seats: await loadCurrentSeats(orgId),
  });
  await getTypedDirectus().request(updateItem("payment_requests", id, { waiver: approval.id } as any));
  const origin = await safeRequestOrigin(event).catch(() => null);
  await notifyApprovers({ orgId, approval, view, charge: await waiverSubject(orgId, charge, approval), origin });
  return { approval: { id: approval.id, state: view.state, needed: view.needed, amount } };
});
