/**
 * PATCH /api/org/money/charges/[id] — the corrections that give up nothing
 * (docs/spec-charge-corrections.md). Admins only, as they create charges.
 *
 *   title, description, notes   free on an open charge; the owner is not told
 *   amount                       up only: what is owed rises by the difference.
 *                                Lowering it is a partial waiver (422)
 *   due_date                     while the charge is not yet due and no late
 *                                fee is charged; never to a past date (422)
 *
 * While a waiver or move of it awaits approval, the amount and due date are
 * locked (409); the words stay free. Only fields that differ are written.
 * Each change goes to the Ledger (`charge_corrected`, board), and the owner
 * is told of a new amount or due date.
 *
 * Body: { orgId, title?, description?, notes?, amount?, due_date? }.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import {
  amountRefusal,
  dueDateRefusal,
  isOpenChargeStatus,
  ownerHearsOf,
  raisedAmount,
  cents,
  type ChargeChange,
} from "#core/shared/money/charge-corrections";
import { buildChargeCorrectedEntry, formatDay, formatMoney } from "#core/shared/ledger/entries";
import { todayUtc } from "#core/shared/roles/role-context";
import { ledgerActorFor } from "#core/server/utils/member-names";

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const body = z
  .object({
    orgId: z.string().min(1, "orgId is required"),
    title: z.string().trim().min(1, "A charge needs a title.").max(255).optional(),
    description: text(2000),
    notes: text(5000),
    amount: z.coerce.number({ message: "Enter an amount." }).finite().optional(),
    due_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, "Choose a valid due date.").optional(),
  })
  .strip();

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const input = parsed.data;
  const orgId = input.orgId;

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an administrator can correct a charge." });

  const charge = await loadCorrectableCharge(orgId, id);
  if (!isOpenChargeStatus(charge.status)) {
    throw createError({ statusCode: 409, message: "Only a charge that is still owed can be corrected." });
  }

  const changes: ChargeChange[] = [];
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined && !same(input.title, charge.title)) {
    changes.push({ field: "title", from: charge.title ?? null, to: input.title });
    patch.title = input.title;
  }
  for (const field of ["description", "notes"] as const) {
    const next = input[field] === undefined ? undefined : input[field] || null;
    if (next !== undefined && !same(next, charge[field])) {
      changes.push({ field, from: charge[field] ?? null, to: next });
      patch[field] = next;
    }
  }

  const amountChanges = input.amount !== undefined && cents(input.amount) !== cents(charge.amount);
  const day = input.due_date?.slice(0, 10);
  const dueChanges = day !== undefined && day !== (charge.due_date ? String(charge.due_date).slice(0, 10) : null);
  if (amountChanges || dueChanges) {
    const facts = await chargeFacts(orgId, charge);
    if (facts.approvalOpen) {
      throw createError({ statusCode: 409, message: "A waiver or move of this charge is awaiting approval: its amount and due date are locked until it is decided." });
    }
    if (amountChanges) {
      const refusal = amountRefusal(facts, input.amount);
      if (refusal) throw createError({ statusCode: 422, message: refusal });
      const next = raisedAmount(facts, input.amount);
      changes.push({ field: "amount", from: Number(charge.amount ?? 0), to: next.amount });
      patch.amount = next.amount;
      patch.amount_remaining = next.amount_remaining;
    }
    if (dueChanges) {
      const refusal = dueDateRefusal(facts, day!, todayUtc());
      if (refusal) throw createError({ statusCode: 422, message: refusal });
      changes.push({ field: "due_date", from: charge.due_date ? String(charge.due_date).slice(0, 10) : null, to: day! });
      patch.due_date = day;
    }
  }

  if (!changes.length) return { changes: [] };

  await getTypedDirectus().request(updateItem("payment_requests", id, patch as any));

  const now = new Date().toISOString();
  const actor = await ledgerActorFor(orgId, (session.user ?? null) as Record<string, any> | null);
  try {
    await writeAuditEntry(
      buildChargeCorrectedEntry({
        organizationId: orgId,
        organizationName: await orgName(orgId),
        charge: chargeSubject(charge),
        changes,
        actor,
        occurredAt: now,
      })
    );
  } catch (e) {
    console.error("[charge-corrections] ledger write failed:", e);
  }

  const heard = ownerHearsOf(changes);
  if (heard.length) {
    const title = chargeTitle({ ...charge, ...patch });
    const parts = heard.map((c) =>
      c.field === "amount"
        ? `is now ${formatMoney(c.to)} (was ${formatMoney(c.from)})`
        : `is now due ${formatDay(String(c.to))}${c.from ? ` (was ${formatDay(String(c.from))})` : ""}`
    );
    await notifyHousehold({
      orgId,
      userId: householdUserOf(charge),
      subject: "A charge to you changed",
      message: `Your charge for ${title} ${parts.join(" and ")}.`,
      chargeId: id,
      origin: await safeRequestOrigin(event).catch(() => null),
      excludeUserId: actor.userId,
    });
  }

  return { changes };
});
