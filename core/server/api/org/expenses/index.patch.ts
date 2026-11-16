/**
 * PATCH /api/org/expenses — an admin, or a property manager with the projects
 * grant, changes an expense.
 *
 * Body: { orgId, id, patch }. The row must be the community's (its own
 * organization, and its project's when it names one, agree); a project must be
 * one of its, and a new receipt one of its files (the receipt upload files it in
 * Records › Expense receipts) or an older loose upload of the caller's. The community cannot change here. Written with the app's
 * token: the HOA Admin policy has no update on payment_expenses
 * (core/shared/expenses/expense-writes.ts).
 *
 * Never to `paid`: POST /api/org/expenses/record owns that move. An expense
 * already paid may be sent back as paid, unchanged.
 */
import { readItem, updateItem } from "@directus/sdk";
import { expenseCommunity, patchExpenseBody, statusRefusal } from "#core/shared/expenses/expense-writes";
import { assertProjectInOrg } from "#core/server/utils/responsibilities";
import { assertReceiptInOrg } from "#core/server/utils/expense-receipts";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

type Row = { id: string; organization?: unknown; status?: string | null; receipt?: unknown; project?: unknown };

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parsed = patchExpenseBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  const { orgId, id, patch } = parsed.data;

  await requireAdminOrManagerGrant(event, orgId, "projects");

  const directus = getTypedDirectus();
  let row: Row | null = null;
  try {
    row = (await directus.request(
      readItem("payment_expenses" as never, id, { fields: ["id", "organization", "status", "receipt", "project.organization"] } as never)
    )) as unknown as Row;
  } catch {
    row = null;
  }
  if (!row || expenseCommunity(row) !== orgId) throw createError({ statusCode: 404, message: "No such expense in this community." });

  const refusal = statusRefusal(row.status, patch.status);
  if (refusal) throw createError({ statusCode: 400, message: refusal });

  await assertProjectInOrg(orgId, patch.project);
  // The receipt it already has is its own; only a new one is checked.
  if (patch.receipt && patch.receipt !== asId(row.receipt)) {
    await assertReceiptInOrg(orgId, patch.receipt, String((session.user as { id?: unknown } | undefined)?.id ?? ""));
  }

  const updated = await directus.request(updateItem("payment_expenses" as never, id, patch as never));
  return numericMoney([updated as object], ["amount"])[0];
});
