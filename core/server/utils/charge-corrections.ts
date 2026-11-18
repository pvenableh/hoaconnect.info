/**
 * Correcting an owner charge on the server (docs/spec-charge-corrections.md):
 * a charge with what the rules read (its late fees, payments, open
 * approvals), the household's name and user, and the owner's notice. The
 * rules themselves are pure, in core/shared/money/charge-corrections.ts.
 *
 * Reads and writes use the app's token, always filtered by the community.
 * No Directus policy updates or deletes a charge: these routes are the only
 * way to correct one.
 */
import { readItems } from "@directus/sdk";
import type { ChargeFacts, LateFeeFacts } from "#core/shared/money/charge-corrections";
import type { ChargeSubject } from "#core/shared/ledger/entries";
import { roleIdOf } from "#core/shared/ops/permissions";

const idOf = (v: unknown): string | null => roleIdOf(v as never) ?? null;

/** What the correction routes read from a charge, beyond its subject. */
export const CORRECTION_FIELDS = [
  "source", "request_type", "date_created", "due_date", "reminder_sent", "metadata",
  "description", "notes", "unit", "paid_at", "withdrawn_at", "member.user",
] as const;

/** The kinds of approval that hold a charge: one at a time. */
export const CHARGE_APPROVAL_KINDS = ["waive", "move"] as const;

/** One charge of the community with everything a correction reads, 404 otherwise. */
export async function loadCorrectableCharge(orgId: string, id: string): Promise<any> {
  return loadCharge(orgId, id, CORRECTION_FIELDS);
}

/** The open waive or move approvals on a charge. */
export async function openChargeApprovals(orgId: string, chargeId: string): Promise<ApprovalRow[]> {
  return loadApprovals(orgId, {
    charge: { _eq: chargeId },
    kind: { _in: [...CHARGE_APPROVAL_KINDS] },
    state: { _in: [...OPEN_STATES] },
  });
}

/** The late fees on each charge (`source_id`), canceled ones included. */
export async function lateFeesOf(orgId: string, chargeIds: readonly string[]): Promise<Map<string, LateFeeFacts[]>> {
  const out = new Map<string, LateFeeFacts[]>();
  if (!chargeIds.length) return out;
  const rows = ((await getTypedDirectus().request(
    readItems("payment_requests", {
      filter: { organization: { _eq: orgId }, request_type: { _eq: "late_fee" }, source_id: { _in: [...chargeIds] } } as any,
      fields: ["id", "status", "amount", "amount_paid", "amount_remaining", "source_id"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  for (const r of rows) {
    const key = String(r.source_id ?? "");
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push({ id: String(r.id), status: r.status ?? null, amount: r.amount, amount_paid: r.amount_paid, amount_remaining: r.amount_remaining });
    out.set(key, list);
  }
  return out;
}

/** The charges, of these, with a payment recorded against them. */
export async function chargesWithPayments(chargeIds: readonly string[]): Promise<Set<string>> {
  if (!chargeIds.length) return new Set();
  const rows = ((await getTypedDirectus().request(
    readItems("payment_transactions", {
      filter: { payment_request: { _in: [...chargeIds] }, status: { _in: ["succeeded", "refunded"] } } as any,
      fields: ["payment_request"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  return new Set(rows.map((r) => idOf(r.payment_request)).filter(Boolean) as string[]);
}

/** A charge row as the rules read it. */
export function factsOf(
  row: any,
  extra: { lateFees?: readonly LateFeeFacts[]; hasTransactions?: boolean; approvalOpen?: boolean } = {}
): ChargeFacts {
  return {
    status: row.status ?? null,
    source: row.source ?? null,
    request_type: row.request_type ?? null,
    date_created: row.date_created ?? null,
    amount: row.amount,
    amount_paid: row.amount_paid,
    amount_remaining: row.amount_remaining,
    due_date: row.due_date ?? null,
    reminder_sent: row.reminder_sent ?? null,
    metadata: row.metadata ?? null,
    lateFees: extra.lateFees ?? [],
    hasTransactions: !!extra.hasTransactions,
    approvalOpen: !!extra.approvalOpen,
  };
}

/** One charge's facts, read now. */
export async function chargeFacts(orgId: string, row: any): Promise<ChargeFacts> {
  const id = String(row.id);
  const [fees, paid, open] = await Promise.all([lateFeesOf(orgId, [id]), chargesWithPayments([id]), openChargeApprovals(orgId, id)]);
  return factsOf(row, { lateFees: fees.get(id) ?? [], hasTransactions: paid.has(id), approvalOpen: open.length > 0 });
}

/** The household's user on a charge (`member.user`), when it has one. */
export function householdUserOf(row: any): string | null {
  return row?.member && typeof row.member === "object" ? idOf(row.member.user) : null;
}

/**
 * Tell a household of a change to what it owes, or when (decision 5). Not
 * essential: a dues notice is the household's own category to mute. Never
 * fails the route.
 */
export async function notifyHousehold(input: {
  orgId: string;
  userId: string | null;
  subject: string;
  message: string;
  chargeId: string;
  origin?: string | null;
  excludeUserId?: string | null;
}): Promise<void> {
  if (!input.userId) return;
  await notifyUsers({
    organizationId: input.orgId,
    recipientUserIds: [input.userId],
    category: "payment",
    subject: input.subject,
    message: input.message,
    collection: "payment_requests",
    item: input.chargeId,
    path: "/payments",
    origin: input.origin ?? null,
    excludeUserId: input.excludeUserId ?? null,
  }).catch((e) => console.error("[charge-corrections] household notice failed:", e));
}

/** "March dues", or a fallback for an untitled charge: how an owner's notice names it. */
export const chargeTitle = (row: any) => String(row?.title ?? "").trim() || "a charge";

/** A household of the community, active, by its `hoa_members` id; null otherwise. */
export async function loadHousehold(orgId: string, memberId: string): Promise<any | null> {
  if (!memberId) return null;
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_members", {
      filter: { id: { _eq: memberId }, organization: { _eq: orgId }, status: { _eq: "active" } } as any,
      fields: ["id", "first_name", "last_name", "email", "user", "organization"] as any,
      limit: 1,
    })
  )) ?? []) as any[];
  const row = rows[0];
  return row && idOf(row.organization) === orgId ? row : null;
}

/**
 * The unit a moved charge takes: the household's primary unit, or its only
 * one; none when it has several and none is primary, or none at all.
 */
export async function householdUnit(memberId: string): Promise<string | null> {
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_member_units", {
      filter: { member_id: { _eq: memberId }, end_date: { _null: true } } as any,
      fields: ["unit_id", "is_primary_unit"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  const primary = rows.find((r) => r.is_primary_unit === true);
  if (primary) return idOf(primary.unit_id);
  return rows.length === 1 ? idOf(rows[0].unit_id) : null;
}

/** A move's subject: the charge, naming the household it would go to. */
export async function moveSubject(orgId: string, row: any, approval: Pick<ApprovalRow, "proposed">): Promise<ChargeSubject> {
  const to = approval.proposed?.member ? await loadHousehold(orgId, approval.proposed.member).catch(() => null) : null;
  return { ...chargeSubject(row), moveToName: to ? chargeHousehold(to) : null };
}

/** An approval's charge subject, by kind: a waiver's cut and late fees, or a move's destination. */
export async function chargeApprovalSubject(orgId: string, row: any, approval: ApprovalRow): Promise<ChargeSubject> {
  return approval.kind === "move" ? moveSubject(orgId, row, approval) : waiverSubject(orgId, row, approval);
}
