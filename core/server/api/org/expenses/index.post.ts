/**
 * POST /api/org/expenses — an admin, or a property manager with the projects
 * grant, enters an expense.
 *
 * Body: { orgId, expense }. The community is the server's; a project must be
 * one of its, and a receipt one of its files (POST /api/org/expenses/receipt
 * files it in Records › Expense receipts) or an older loose upload of the
 * caller's. Written with the app's
 * token: the HOA Admin policy has no create on payment_expenses, because its
 * rule never checked the project or receipt a row names
 * (core/shared/expenses/expense-writes.ts). Never `paid`: that is
 * POST /api/org/expenses/record. Reads stay GET /api/org/expenses.
 */
import { createItem } from "@directus/sdk";
import { createExpenseBody } from "#core/shared/expenses/expense-writes";
import { assertProjectInOrg } from "#core/server/utils/responsibilities";
import { assertReceiptInOrg } from "#core/server/utils/expense-receipts";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parsed = createExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, expense } = parsed.data;

  await requireAdminOrManagerGrant(event, orgId, "projects");

  await assertProjectInOrg(orgId, expense.project);
  await assertReceiptInOrg(orgId, expense.receipt, String((session.user as { id?: unknown } | undefined)?.id ?? ""));

  const row = await getTypedDirectus().request(
    createItem("payment_expenses" as never, { ...expense, status: expense.status ?? "draft", organization: orgId } as never)
  );
  return numericMoney([row as object], ["amount"])[0];
});
