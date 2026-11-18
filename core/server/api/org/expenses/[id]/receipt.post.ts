/**
 * POST /api/org/expenses/[id]/receipt — attach a receipt to a saved expense
 * (docs/spec-money-approvals.md). money:enter. Multipart: `orgId`, `file` (a
 * PDF or a photo, 4 MB at most). Returns `{ id, filename, type }`.
 *
 * A receipt changes freely on a draft, a submission, an approval and a paid
 * expense (it never reshapes an approval round); a void expense is closed,
 * so it is refused (409), as an edit is. The file is filed as
 * /api/org/expenses/receipt files one (storeExpenseReceipt).
 */
import { updateItem } from "@directus/sdk";
import { storeExpenseReceipt } from "#core/server/utils/expense-receipts";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const parts = (await readMultipartFormData(event)) ?? [];
  const orgId = parts.find((p) => p.name === "orgId")?.data.toString("utf8").trim() ?? "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, String(getRouterParam(event, "id") || ""));
  await requireExpenseAction(orgId, row, viewer, "edit");

  const stored = await storeExpenseReceipt(orgId, viewer.userId, parts.find((p) => p.name === "file" && p.filename));
  await getTypedDirectus().request(updateItem("payment_expenses", row.id, { receipt: stored.id } as any));
  return stored;
});
