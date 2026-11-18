/**
 * POST /api/org/money/charges/[id]/waive — ask to waive an owner charge
 * (docs/spec-money-approvals.md, the `waive` rows). money:enter.
 *
 * Waiving gives up income the community is owed, so it takes the same
 * approval as spending: this opens a `waive` approval with the reason, links
 * it as the charge's `waiver`, and tells the approvers. Whoever asks can
 * never decide it. Nothing changes on the charge until the rule is met;
 * then settleApproval cancels it and writes `charge_waived` (board).
 *
 * Refused (409): a charge already paid or canceled, or one with a waiver
 * open. Another community's charge is 404.
 *
 * Body: { orgId, reason }.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";

const body = z.object({
  orgId: z.string().min(1, "orgId is required"),
  reason: z.string({ message: "Say why it should be waived." }).trim().min(1, "Say why it should be waived.").max(1000),
});

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, reason } = parsed.data;

  const viewer = await requireMoneyEnter(event, orgId);
  const charge = await loadCharge(orgId, id);
  if (!isWaivableCharge(charge.status)) {
    throw createError({ statusCode: 409, message: `This charge is already ${charge.status === "paid" ? "paid" : "canceled"}.` });
  }
  if ((await openWaiversFor(orgId, id)).length) {
    throw createError({ statusCode: 409, message: "A waiver of this charge is already awaiting approval." });
  }

  const { approval, view } = await openApproval({
    orgId,
    kind: "waive",
    charge: id,
    round: 1,
    requestedBy: viewer.userId,
    excluded: [],
    reason,
    seats: await loadCurrentSeats(orgId),
  });
  await getTypedDirectus().request(updateItem("payment_requests", id, { waiver: approval.id } as any));
  const origin = await safeRequestOrigin(event).catch(() => null);
  await notifyApprovers({ orgId, approval, view, charge: chargeSubject(charge), origin });
  return { approval: { id: approval.id, state: view.state, needed: view.needed } };
});
