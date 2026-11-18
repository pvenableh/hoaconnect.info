/**
 * What the Approvals page reads (docs/spec-money-approvals.md): each
 * approval with its subject, the rule's view now, who has decided, who it
 * waits on, who is excluded, and `canDecide` for the caller. `canDecide` is
 * for showing the buttons only: POST .../decide checks the rule again and
 * never reads it from the client.
 *
 * Reads never write. An open approval whose board changed under it reads as
 * it is stored until the board change settles it (resettleCommunity).
 */
import type { Seat } from "#core/shared/money/approval-rule";
import { OFFICE_LABELS, progressLabel } from "#core/shared/money/approval-rule";
import { readItems } from "@directus/sdk";
import { openLateFeesTotal } from "#core/shared/money/charge-corrections";

const person = (id: string, names: Map<string, string>, seats: readonly Seat[]) => {
  const { label } = officeLabelOf(seats, id);
  return { userId: id, name: names.get(id) ?? "A board member", office: label };
};

export async function describeApprovals(orgId: string, approvals: ApprovalRow[], userId: string | null, seatsArg?: readonly Seat[]) {
  const seats = seatsArg ?? (await loadCurrentSeats(orgId));
  const decisions = await loadDecisions(approvals.map((a) => a.id));

  const expenseIds = [...new Set(approvals.map((a) => a.expense).filter((x): x is string => !!x))];
  const expenses = expenseIds.length
    ? (((await getTypedDirectus().request(
        readItems("payment_expenses", {
          filter: { id: { _in: expenseIds }, organization: { _eq: orgId } } as any,
          fields: ["id", "title", "vendor", "amount", "status", "category", "paid_without_approval", "expense_date"] as any,
          limit: -1,
        })
      )) ?? []) as any[])
    : [];
  const expenseById = new Map(expenses.map((e) => [String(e.id), e]));

  // A waiver's charge names a household: these routes are money:read only
  // (every board seat, admins), the people who read the charges already.
  const chargeIds = [...new Set(approvals.map((a) => a.charge).filter((x): x is string => !!x))];
  const charges = chargeIds.length
    ? (((await getTypedDirectus().request(
        readItems("payment_requests", {
          filter: { id: { _in: chargeIds }, organization: { _eq: orgId } } as any,
          fields: ["id", "title", "amount", "amount_remaining", "status", "member.first_name", "member.last_name", "member.email"] as any,
          limit: -1,
        })
      )) ?? []) as any[])
    : [];
  const chargeById = new Map(charges.map((c) => [String(c.id), c]));
  // A full waiver takes its charge's unpaid late fees; a move names both households.
  const feesByCharge = await lateFeesOf(orgId, chargeIds);
  const householdIds = [
    ...new Set(approvals.flatMap((a) => (a.kind === "move" ? [a.proposed?.member, a.proposed?.from_member] : [])).filter((x): x is string => !!x)),
  ];
  const households = householdIds.length
    ? (((await getTypedDirectus().request(
        readItems("hoa_members", {
          filter: { id: { _in: householdIds }, organization: { _eq: orgId } } as any,
          fields: ["id", "first_name", "last_name", "email"] as any,
          limit: -1,
        })
      )) ?? []) as any[])
    : [];
  const householdName = new Map(households.map((m) => [String(m.id), chargeHousehold(m)]));

  const people = new Set<string>();
  for (const a of approvals) {
    if (a.requested_by) people.add(a.requested_by);
    a.excluded.forEach((u) => people.add(u));
    for (const d of decisions.get(a.id) ?? []) if (d.decided_by) people.add(d.decided_by);
  }
  seats.forEach((s) => people.add(s.userId));
  const names = await namesFor(orgId, people);

  return approvals.map((a) => {
    const own = decisions.get(a.id) ?? [];
    const view = readViewOf(a, seats, own);
    const e = a.expense ? expenseById.get(a.expense) : null;
    const c = a.charge ? chargeById.get(a.charge) : null;
    return {
      id: a.id,
      kind: a.kind,
      round: a.round,
      state: view.state,
      mode: view.mode,
      needed: view.needed,
      approvals: view.approvals,
      rejections: view.rejections,
      remaining: view.remaining,
      progress: progressLabel(view),
      smallBoard: view.smallBoard,
      reason: a.reason,
      date_created: a.date_created,
      decided_at: a.decided_at,
      requested_by: a.requested_by ? { userId: a.requested_by, name: names.get(a.requested_by) ?? "Someone" } : null,
      excluded: a.excluded.map((u) => ({ userId: u, name: names.get(u) ?? "Someone" })),
      waiting_on: view.waitingOn.map((u) => person(u, names, seats)),
      decisions: own.map((d) => ({
        id: d.id,
        decision: d.decision,
        note: d.note,
        date_created: d.date_created,
        office: OFFICE_LABELS[d.office ?? ""] ?? null,
        name: d.decided_by ? names.get(d.decided_by) ?? "A board member" : "A former board member",
      })),
      subject: e
        ? {
            type: "expense" as const,
            id: String(e.id),
            title: e.title ?? "",
            vendor: e.vendor ?? null,
            amount: e.amount == null ? null : Number(e.amount),
            status: e.status ?? null,
            paid_without_approval: e.paid_without_approval === true,
          }
        : c
          ? {
              type: "charge" as const,
              id: String(c.id),
              title: c.title ?? "",
              amount: c.amount == null ? null : Number(c.amount),
              amount_remaining: c.amount_remaining == null ? null : Number(c.amount_remaining),
              status: c.status ?? null,
              household: chargeHousehold(c.member),
              // A partial waiver's cut; null for all that remains.
              waive_amount: a.kind === "waive" ? a.amount : null,
              // What a full waiver would take with it, as it stands now.
              late_fees: a.kind === "waive" && a.amount == null ? openLateFeesTotal({ lateFees: feesByCharge.get(String(c.id)) ?? [] }) : 0,
              move:
                a.kind === "move"
                  ? {
                      from: householdName.get(a.proposed?.from_member ?? "") ?? null,
                      to: householdName.get(a.proposed?.member ?? "") ?? null,
                    }
                  : null,
            }
          : null,
      canDecide: callerCanDecide(a, view, userId),
    };
  });
}

export type ApprovalItem = Awaited<ReturnType<typeof describeApprovals>>[number];
