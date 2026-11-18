/**
 * GET /api/org/expenses/[id]/receipt?orgId= — an expense's receipt, streamed
 * through the server (docs/spec-money-approvals.md). money:read: every board
 * seat and the community's admins, the people who read the books.
 *
 * The file is reached by the expense that names it, read through the
 * community filter, so the caller never names a file and another
 * community's expense is 404. A draft's receipt is for the people who can
 * enter expenses, as the draft is (GET /api/org/expenses).
 */
import { readFile } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const row = await loadExpense(orgId, String(getRouterParam(event, "id") || ""));
  if (row.status === "draft" && !(await canEnterMoney(event, orgId))) {
    throw createError({ statusCode: 404, message: "No such expense in this community." });
  }
  const fileId = row.receipt && typeof row.receipt === "object" ? String(row.receipt.id ?? "") : String(row.receipt ?? "");
  if (!fileId) throw createError({ statusCode: 404, message: "This expense has no receipt." });

  let file: { id: string; filename_download?: string | null };
  try {
    file = (await getTypedDirectus().request(readFile(fileId, { fields: ["id", "type", "filename_download"] }))) as typeof file;
  } catch {
    throw createError({ statusCode: 404, message: "The receipt file is missing." });
  }
  // The file as stored: no image transforms, whatever the query asks.
  return streamDirectusFile(event, file, { transforms: false });
});
