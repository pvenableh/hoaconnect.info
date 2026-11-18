/**
 * POST /api/org/money/charges/[id]/withdraw — take back a charge entered in
 * error (docs/spec-charge-corrections.md, decision 2). Admins only.
 *
 * The one way to lower what an owner owes without the board, so it is held
 * to undoing a fresh mistake: a charge entered by hand, within 24 hours,
 * with nothing paid, no reminder sent, no late fee charged and no approval
 * open. After that, taking it back is a waiver (409 says so).
 *
 * The charge is canceled and kept on record, never deleted: `withdrawn_at`,
 * `withdrawn_by` and `withdrawn_reason` say so. `charge_withdrawn` goes to
 * the Ledger (board), and the owner is told.
 *
 * Body: { orgId, reason }.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { withdrawRefusal } from "#core/shared/money/charge-corrections";
import { buildChargeWithdrawnEntry, formatMoney } from "#core/shared/ledger/entries";
import { ledgerActorFor } from "#core/server/utils/member-names";

const body = z.object({
  orgId: z.string().min(1, "orgId is required"),
  reason: z.string({ message: "Say why it is being withdrawn." }).trim().min(1, "Say why it is being withdrawn.").max(1000),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, reason } = parsed.data;

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an administrator can withdraw a charge." });

  const charge = await loadCorrectableCharge(orgId, id);
  const refusal = withdrawRefusal(await chargeFacts(orgId, charge), new Date());
  if (refusal) throw createError({ statusCode: 409, message: refusal });

  const now = new Date().toISOString();
  const actor = await ledgerActorFor(orgId, (session.user ?? null) as Record<string, any> | null);
  await getTypedDirectus().request(
    updateItem("payment_requests", id, {
      status: "canceled",
      withdrawn_at: now,
      withdrawn_by: actor.userId,
      withdrawn_reason: reason,
    } as any)
  );

  try {
    await writeAuditEntry(
      buildChargeWithdrawnEntry({
        organizationId: orgId,
        organizationName: await orgName(orgId),
        charge: chargeSubject(charge),
        reason,
        actor,
        occurredAt: now,
      })
    );
  } catch (e) {
    console.error("[charge-corrections] ledger write failed:", e);
  }

  await notifyHousehold({
    orgId,
    userId: householdUserOf(charge),
    subject: "A charge to you was withdrawn",
    message: `Your ${formatMoney(charge.amount)} charge for ${chargeTitle(charge)} was withdrawn: it was entered in error.`,
    chargeId: id,
    origin: await safeRequestOrigin(event).catch(() => null),
    excludeUserId: actor.userId,
  });

  return { charge: { id, status: "canceled", withdrawn_at: now } };
});
