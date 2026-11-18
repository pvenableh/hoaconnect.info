/**
 * POST /api/org/expenses — enter an expense: a draft, or submitted straight
 * away (`submit: true`), which opens its spend approval
 * (docs/spec-money-approvals.md).
 *
 * money:enter: every board seat, an admin, a manager with the projects grant.
 * Entering is never approving: the person who enters an expense can never
 * decide its approval.
 *
 * Body: { orgId, expense, submit? }. The community is the server's; a project
 * must be one of its, and a receipt one of its files (POST
 * /api/org/expenses/receipt files it in Records › Expense receipts) or an
 * older loose upload of the caller's. Written with the app's token: no policy
 * writes payment_expenses. Never paid here: POST /api/org/expenses/[id]/pay.
 */
import { createItem } from "@directus/sdk";
import { createExpenseBody } from "#core/shared/expenses/expense-writes";
import { assertProjectInOrg } from "#core/server/utils/responsibilities";
import { assertReceiptInOrg } from "#core/server/utils/expense-receipts";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const parsed = createExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, expense, submit } = parsed.data;

  const { userId } = await requireMoneyEnter(event, orgId);

  await assertProjectInOrg(orgId, expense.project);
  await assertReceiptInOrg(orgId, expense.receipt, userId);

  const row = (await getTypedDirectus().request(
    createItem("payment_expenses" as never, { ...expense, status: "draft", entered_by: userId, organization: orgId } as never)
  )) as any;

  if (submit) {
    await startSpendRound({ orgId, expense: row, requestedBy: userId, now: new Date().toISOString(), origin: await safeRequestOrigin(event).catch(() => null) });
    return { ...numericMoney([row as object], ["amount"])[0], status: "submitted" };
  }
  return numericMoney([row as object], ["amount"])[0];
});
