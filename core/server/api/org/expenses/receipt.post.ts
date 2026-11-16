/**
 * POST /api/org/expenses/receipt — the receipt for an expense, before the
 * expense is saved. Multipart: `orgId`, `file` (a PDF or a photo, 4 MB at
 * most). Returns `{ id, filename, type }`; the expense form saves that id as
 * the expense's `receipt`.
 *
 * Not /api/directus/files/upload: that uploads with the admin's own token, and
 * a file in no folder comes back with no id, so the expense was saved with no
 * receipt (private-uploads.ts says why). The people who enter an expense: an
 * admin, or a property manager with the projects grant (record.post.ts).
 */
import { storeExpenseReceipt } from "#core/server/utils/expense-receipts";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const parts = (await readMultipartFormData(event)) ?? [];
  const orgId = parts.find((p) => p.name === "orgId")?.data.toString("utf8").trim() ?? "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  await requireAdminOrManagerGrant(event, orgId, "projects");
  return storeExpenseReceipt(orgId, userId, parts.find((p) => p.name === "file" && p.filename));
});
