/**
 * POST /api/org/expenses/record
 *
 * Mark an expense paid — and record that community money went out.
 *
 * `useExpenses()` was plain client-side CRUD, so "where did the dues go" was
 * answerable only from the expense table itself: editable, deletable, and gone
 * with the collection. VISION's Pillar B promises an owner can see what their
 * money paid for; this is the half of that promise that survives a manager
 * change, a data migration, or a deleted row.
 *
 * **This route owns the transition to `paid`.** The expense form saves
 * everything else; when the admin picks "Paid" on an expense that was not paid
 * before, the form saves it as approved and calls this to make it paid. One
 * place money leaves, one place that fact is recorded. Editing an expense that
 * was already paid touches neither.
 *
 * Admin, or a property manager holding the `projects` grant — the same people
 * who can enter an expense at all.
 */

import { readItems, updateItem } from "@directus/sdk";
import { buildExpenseRecordedEntry } from "#core/shared/ledger/entries";

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
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  const expenseId = String(body?.expenseId || "").trim();
  if (!orgId || !expenseId) {
    throw createError({ statusCode: 400, statusMessage: "orgId and expenseId are required" });
  }

  await requireAdminOrManagerGrant(event, orgId, "projects");

  const directus = getTypedDirectus();

  const [rows, orgs] = await Promise.all([
    // Through the org filter: an id from another community must miss.
    directus.request(
      readItems("payment_expenses", {
        filter: { id: { _eq: expenseId }, organization: { _eq: orgId } },
        fields: [
          "id",
          "title",
          "vendor",
          "category",
          "status",
          "amount",
          "paid_date",
          // hoa_projects has `title`, not `name` — and Directus rejects the WHOLE
          // query on one unknown field, so this is the difference between an
          // entry and a 500.
          "project.title",
        ] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
    directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  const expense = rows?.[0];
  if (!expense) {
    throw createError({ statusCode: 404, statusMessage: "No such expense in this community." });
  }

  const occurredAt = new Date().toISOString();
  // The date the money moved, as the admin entered it — falling back to today
  // when they left it blank. `occurred_at` is when the ledger learned of it;
  // `paid_date` is when it happened, and they are not always the same day.
  const paidDate =
    String(body?.paidDate || "").trim() || expense.paid_date || occurredAt.slice(0, 10);

  const user: any = session.user ?? {};

  const entry = buildExpenseRecordedEntry({
    organizationId: orgId,
    organizationName: orgs?.[0]?.name ?? null,
    expense: {
      expenseId: String(expense.id),
      title: expense.title ?? "",
      vendor: expense.vendor ?? null,
      categoryLabel: CATEGORY_LABELS[String(expense.category ?? "")] ?? null,
      // Comes back from Directus as a decimal STRING; the builder coerces it.
      amount: expense.amount,
      paidDate,
      projectName:
        expense.project && typeof expense.project === "object"
          ? expense.project.title ?? null
          : null,
    },
    previousStatus: expense.status ?? null,
    actor: {
      userId: user.id ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "An administrator",
      email: user.email ?? null,
    },
    occurredAt,
  });

  // Already paid: nothing to write to the row, nothing to record.
  if (!entry) {
    return { paid: false, recorded: false, recordError: null, summary: null };
  }

  await directus.request(
    updateItem("payment_expenses", expenseId, { status: "paid", paid_date: paidDate } as any)
  );

  let recorded = false;
  let recordError: string | null = null;
  try {
    await writeAuditEntry(entry);
    recorded = true;
  } catch (e: any) {
    console.error("[expenses/record] audit write failed:", e);
    recordError = e?.message || "The expense was saved but could not be recorded in the ledger.";
  }

  return { paid: true, recorded, recordError, summary: entry.summary };
});
