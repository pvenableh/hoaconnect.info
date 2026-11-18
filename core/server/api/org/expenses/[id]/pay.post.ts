/**
 * POST /api/org/expenses/[id]/pay — record that the money went out, with the
 * date and the check or transfer reference (docs/spec-money-approvals.md).
 * Replaces POST /api/org/expenses/record. money:enter.
 *
 * Allowed before approval, because the books must match the bank. Then the
 * expense is flagged for good (`paid_without_approval`), every board seat is
 * told with an essential notice, and its spend approval stays open: the
 * board can still approve (ratify) or reject it, and the flag stays either way.
 *
 * Writes `expense_recorded` to the Ledger, owner-visible: the money went out.
 * Body: { orgId, paidDate, reference }.
 */
import { updateItem } from "@directus/sdk";
import { buildExpenseRecordedEntry, expensePhrase } from "#core/shared/ledger/entries";
import { payExpenseBody } from "#core/shared/expenses/expense-writes";
import { ledgerActorFor } from "#core/server/utils/member-names";

/** The label the admin picked in the form, not the raw enum value. */
const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  utilities: "Utilities",
  insurance: "Insurance",
  landscaping: "Landscaping",
  admin: "Admin",
  other: "Other",
};

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const parsed = payExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, paidDate, reference } = parsed.data;

  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, id);
  await requireExpenseAction(orgId, row, viewer, "pay");

  const withoutApproval = row.status !== "approved";
  const now = new Date().toISOString();
  const seats = await loadCurrentSeats(orgId);
  const approvals = row.approval ? await loadApprovals(orgId, { id: { _eq: String(row.approval?.id ?? row.approval) } }) : [];
  const decisions = await loadDecisions(approvals.map((a) => a.id));
  const names = await namesFor(orgId, [viewer.userId, ...(decisions.get(approvals[0]?.id ?? "") ?? []).map((d) => d.decided_by)]);
  const actor = await ledgerActorFor(orgId, (session.user ?? {}) as Record<string, any>);

  await getTypedDirectus().request(
    updateItem("payment_expenses", id, {
      status: "paid",
      paid_date: paidDate,
      paid_reference: reference,
      paid_by: viewer.userId,
      paid_without_approval: withoutApproval,
    } as any)
  );

  const entry = buildExpenseRecordedEntry({
    organizationId: orgId,
    organizationName: await orgName(orgId),
    expense: { ...expenseSubject(row), categoryLabel: CATEGORY_LABELS[String(row.category ?? "")] ?? null, paidDate },
    previousStatus: row.status,
    actor,
    occurredAt: now,
    approvedBy: withoutApproval ? [] : approverNames(decisions.get(approvals[0]?.id ?? "") ?? [], names),
    paidBy: names.get(viewer.userId) ?? actor.name,
    paidReference: reference,
    paidWithoutApproval: withoutApproval,
  });

  let recorded = false;
  let recordError: string | null = null;
  if (entry) {
    try {
      await writeAuditEntry(entry);
      recorded = true;
    } catch (e: any) {
      console.error("[expenses/pay] ledger write failed:", e);
      recordError = e?.message || "The expense was saved but could not be recorded in the ledger.";
    }
  }

  if (withoutApproval) {
    const what = expensePhrase(expenseSubject(row));
    const message = `${names.get(viewer.userId) ?? actor.name} recorded ${what} as paid before it was approved. It still needs the board's approval.`;
    await notifyUsers({
      organizationId: orgId,
      recipientUserIds: [...new Set(seats.map((s) => s.userId))],
      category: "payment",
      subject: "Paid before approval",
      message,
      collection: "payment_expenses",
      item: id,
      path: "/approvals",
      origin: await safeRequestOrigin(event).catch(() => null),
      essential: true,
      email: {
        bodyHtml: `<p>${message.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)}</p>`,
        cta: { label: "Review it", path: "/approvals" },
        emailType: "alert",
      },
    }).catch((e) => console.error("[expenses/pay] board notice failed:", e));
  }

  return { paid: true, paidWithoutApproval: withoutApproval, recorded, recordError, summary: entry?.summary ?? null };
});
