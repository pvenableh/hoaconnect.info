/**
 * GET /api/org/expenses?orgId= — the community's expenses, read-only, for
 * oversight (docs/spec-capability-nav.md, decided 2026-11-14): admins and
 * every board seat (`money:read`). Members have no Directus access to
 * `payment_expenses`, so without this route the board's Money pages showed
 * no expenses at all — an empty list that reads like clean books.
 *
 * Read-only: writes stay admin-only (useExpenses, /api/org/expenses/record).
 */
import { readItems } from "@directus/sdk";

const FIELDS = [
  "id", "status", "category", "title", "vendor", "amount",
  "expense_date", "paid_date", "description", "notes",
  "receipt", "organization", "project", "date_created",
];

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    let canRead = false;
    try {
      const { capabilities } = await resolveCapabilities(event, orgId);
      canRead = capabilities.includes("money:read");
    } catch {
      canRead = false;
    }
    if (!canRead) throw createError({ statusCode: 403, message: "Board or admin access required" });
  }

  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems("payment_expenses", {
      fields: FIELDS as any,
      filter: { organization: { _eq: orgId } } as any,
      sort: ["-expense_date", "-date_created"] as any,
      limit: 500,
    })
  );
  return { expenses: rows ?? [] };
});
