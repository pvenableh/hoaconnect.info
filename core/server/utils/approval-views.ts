/**
 * What the Approvals page reads (docs/spec-money-approvals.md): each
 * approval with its subject, the rule's view now, who has decided, who it
 * waits on, who is excluded, and `canDecide` for the caller. `canDecide` is
 * for showing the buttons only: POST .../decide checks the rule again and
 * never reads it from the client.
 *
 * An open approval whose board changed under it, so that the rule now says
 * approved or rejected with no new decision, is settled here, as a decision
 * would have settled it.
 */
import type { Seat } from "#core/shared/money/approval-rule";
import { OFFICE_LABELS, progressLabel } from "#core/shared/money/approval-rule";
import { readItems } from "@directus/sdk";

const person = (id: string, names: Map<string, string>, seats: readonly Seat[]) => {
  const { label } = officeLabelOf(seats, id);
  return { userId: id, name: names.get(id) ?? "A board member", office: label };
};

export async function describeApprovals(orgId: string, approvals: ApprovalRow[], userId: string | null, seatsArg?: readonly Seat[]) {
  const seats = seatsArg ?? (await loadCurrentSeats(orgId));
  let decisions = await loadDecisions(approvals.map((a) => a.id));

  // Settle what the board's change decided.
  let settled = false;
  for (const a of approvals) {
    if (!isOpen(a.state)) continue;
    const view = viewOf(a, seats, decisions.get(a.id) ?? []);
    if (view.state === "approved" || view.state === "rejected") {
      await settleApproval({ orgId, approval: a, view, decisions: decisions.get(a.id) ?? [], seats, actor: SYSTEM_ACTOR, now: new Date().toISOString() });
      a.state = view.state;
      a.needed = view.needed;
      settled = true;
    }
  }
  if (settled) decisions = await loadDecisions(approvals.map((a) => a.id));

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
    const view = viewOf(a, seats, own);
    const e = a.expense ? expenseById.get(a.expense) : null;
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
        : a.charge
          ? { type: "charge" as const, id: a.charge }
          : null,
      canDecide: callerCanDecide(a, view, userId),
    };
  });
}

export type ApprovalItem = Awaited<ReturnType<typeof describeApprovals>>[number];
