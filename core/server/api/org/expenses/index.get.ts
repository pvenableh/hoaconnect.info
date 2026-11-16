/**
 * GET /api/org/expenses?orgId=&limit= — the community's expenses, read-only,
 * for admins and every board seat (requireMoneyRead, plan decision 16). The
 * only way the app reads them: members have no Directus access to
 * `payment_expenses`, and the board's oversight must not depend on it.
 *
 * Writes stay admin-only (useExpenses, /api/org/expenses/record).
 */
import { readItems } from "@directus/sdk";

const FIELDS = [
  "id", "status", "category", "title", "vendor", "amount",
  "expense_date", "paid_date", "description", "notes",
  "receipt", "organization", "project", "date_created",
];

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const rows = await getTypedDirectus().request(
    readItems("payment_expenses", {
      fields: FIELDS as any,
      filter: { organization: { _eq: orgId } } as any,
      sort: ["-expense_date", "-date_created"] as any,
      limit: moneyLimit(event, 500),
    })
  );
  return { expenses: numericMoney(rows, ["amount"]) };
});
