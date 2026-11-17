/**
 * Money approvals (plan decisions 16 and 17, docs/spec-money-approvals.md):
 * the whole schema, Session 4 and Session 5 alike, so the waiver session needs
 * no schema run.
 *
 *   money_approvals (new)            one approval: a `spend` or `void` of an
 *                                    expense, or a `waive` of an owner charge
 *   money_approval_decisions (new)   each approve or reject, with the office
 *                                    its maker held then. Append-only. One per
 *                                    person per approval: Directus cannot make
 *                                    a two-column unique index, so `unique_key`
 *                                    ("{approval}:{user}") is unique instead
 *   payment_expenses                 status gains submitted, rejected and void;
 *                                    entered_by, approval, paid_by,
 *                                    paid_reference, paid_without_approval,
 *                                    void_reason
 *   payment_requests                 waiver (the open or last `waive` approval)
 *
 * Every organization on the instance is test data, so nothing is back-filled.
 *
 * Permissions are not touched: no policy gets any access to the two new
 * collections, so only the app's token reads or writes them.
 *
 * Run with: pnpm add:money-approvals           (dry run: reports only)
 *           pnpm add:money-approvals --apply   (writes the schema)
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then
 * `pnpm generate:types`. Idempotent: what exists is skipped.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const would = (what: string) => console.log(`   🔎 would ${what}`);
const did = (what: string) => console.log(`   ✅ ${what}`);
const skip = (what: string) => console.log(`   ⏭️  ${what}`);

async function exists(endpoint: string): Promise<boolean> {
  try {
    await directusFetch(endpoint);
    return true;
  } catch {
    return false;
  }
}

async function ensureCollection(collection: string, meta: Record<string, unknown>): Promise<void> {
  if (await exists(`/collections/${collection}`)) return skip(`collection ${collection} exists`);
  if (!APPLY) return would(`create collection ${collection}`);
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta: { collection, ...meta },
      schema: { name: collection },
      fields: [
        {
          field: "id",
          type: "uuid",
          meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
          schema: { is_primary_key: true, has_auto_increment: false },
        },
      ],
    }),
  });
  did(`created collection ${collection}`);
}

async function ensureField(collection: string, field: string, config: Record<string, unknown>): Promise<void> {
  if (await exists(`/fields/${collection}/${field}`)) return skip(`${collection}.${field} exists`);
  if (!APPLY) return would(`create ${collection}.${field}`);
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...config }) });
  did(`created ${collection}.${field}`);
}

async function ensureRelation(collection: string, field: string, related: string, onDelete: "SET NULL" | "CASCADE"): Promise<void> {
  const existing = await directusFetch(`/relations/${collection}/${field}`).catch(() => null);
  if (existing?.data?.related_collection) return skip(`relation ${collection}.${field} → ${existing.data.related_collection} exists`);
  if (!APPLY) return would(`relate ${collection}.${field} → ${related} (${onDelete})`);
  await directusFetch("/relations", {
    method: "POST",
    body: JSON.stringify({ collection, field, related_collection: related, meta: { sort_field: null }, schema: { on_delete: onDelete } }),
  });
  did(`related ${collection}.${field} → ${related}`);
}

const choices = (pairs: readonly [string, string][]) => pairs.map(([value, text]) => ({ value, text }));

const m2o = (note: string, template?: string) => ({
  type: "uuid",
  schema: { is_nullable: true },
  meta: {
    interface: "select-dropdown-m2o",
    display: "related-values",
    ...(template ? { display_options: { template } } : {}),
    width: "half",
    readonly: true,
    note,
  },
});
const userField = (note: string) => ({
  type: "uuid",
  schema: { is_nullable: true },
  meta: { interface: "select-dropdown-m2o", display: "user", width: "half", readonly: true, note },
});
const created = {
  type: "timestamp",
  meta: { special: ["date-created"], interface: "datetime", readonly: true, width: "half" },
};

async function approvals(): Promise<void> {
  console.log("\n📁 money_approvals");
  await ensureCollection("money_approvals", {
    icon: "approval",
    note: "Money approvals: spending, voids and waivers (docs/spec-money-approvals.md). Written only by the app's routes.",
    display_template: "{{kind}} · {{state}}",
  });
  await ensureField("money_approvals", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await ensureRelation("money_approvals", "organization", "hoa_organizations", "CASCADE");
  await ensureField("money_approvals", "kind", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      required: true,
      readonly: true,
      options: { choices: choices([["spend", "Spend"], ["void", "Void"], ["waive", "Waive"]]) },
    },
  });
  await ensureField("money_approvals", "expense", m2o("The expense, for spend and void.", "{{title}}"));
  await ensureRelation("money_approvals", "expense", "payment_expenses", "SET NULL");
  await ensureField("money_approvals", "charge", m2o("The owner charge, for waive.", "{{title}}"));
  await ensureRelation("money_approvals", "charge", "payment_requests", "SET NULL");
  await ensureField("money_approvals", "round", {
    type: "integer",
    schema: { is_nullable: false, default_value: 1 },
    meta: { interface: "input", width: "half", readonly: true, note: "Starts at 1; a change to the amount, vendor or payee opens the next." },
  });
  await ensureField("money_approvals", "state", {
    type: "string",
    schema: { is_nullable: false, default_value: "pending" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      readonly: true,
      options: {
        choices: choices([
          ["pending", "Pending"],
          ["approved", "Approved"],
          ["rejected", "Rejected"],
          ["cannot_approve", "Cannot be approved"],
          ["superseded", "Superseded"],
        ]),
      },
    },
  });
  await ensureField("money_approvals", "mode", {
    type: "string",
    schema: { is_nullable: true },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      readonly: true,
      options: { choices: choices([["committee", "Committee"], ["majority", "Majority"]]) },
      note: "The rule's mode at the last decision (core/shared/money/approval-rule.ts).",
    },
  });
  await ensureField("money_approvals", "needed", {
    type: "integer",
    schema: { is_nullable: true },
    meta: { interface: "input", width: "half", readonly: true, note: "Approvals the rule needed at the last decision." },
  });
  await ensureField("money_approvals", "requested_by", userField("Who asked for it. Never decides it."));
  await ensureRelation("money_approvals", "requested_by", "directus_users", "SET NULL");
  await ensureField("money_approvals", "excluded", {
    type: "json",
    schema: { is_nullable: true },
    meta: {
      interface: "input-code",
      options: { language: "json" },
      special: ["cast-json"],
      readonly: true,
      note: "User ids who cannot decide: the requester and anyone who changed the amount, vendor or payee in this round.",
    },
  });
  await ensureField("money_approvals", "reason", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", readonly: true, note: "Why: for a void or a waiver." },
  });
  await ensureField("money_approvals", "date_created", created);
  await ensureField("money_approvals", "decided_at", {
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", width: "half", readonly: true, note: "When it was approved, rejected or superseded." },
  });
}

async function decisions(): Promise<void> {
  console.log("\n📁 money_approval_decisions");
  await ensureCollection("money_approval_decisions", {
    icon: "how_to_vote",
    note: "Each approve or reject on a money approval. Append-only, written only by the app's routes.",
    display_template: "{{decision}} · {{office}}",
  });
  await ensureField("money_approval_decisions", "approval", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", readonly: true },
  });
  await ensureRelation("money_approval_decisions", "approval", "money_approvals", "CASCADE");
  await ensureField("money_approval_decisions", "decided_by", userField("Who decided."));
  await ensureRelation("money_approval_decisions", "decided_by", "directus_users", "SET NULL");
  await ensureField("money_approval_decisions", "office", {
    type: "string",
    schema: { is_nullable: true, max_length: 40 },
    meta: { interface: "input", width: "half", readonly: true, note: "The board office they held when they decided." },
  });
  await ensureField("money_approval_decisions", "decision", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      readonly: true,
      options: { choices: choices([["approve", "Approve"], ["reject", "Reject"]]) },
    },
  });
  await ensureField("money_approval_decisions", "note", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", readonly: true },
  });
  await ensureField("money_approval_decisions", "unique_key", {
    type: "string",
    schema: { is_nullable: false, is_unique: true, max_length: 80 },
    meta: { interface: "input", hidden: true, readonly: true, note: "{approval}:{decided_by}: one decision per person per approval." },
  });
  await ensureField("money_approval_decisions", "date_created", created);
}

const EXPENSE_STATUS = choices([
  ["draft", "Draft"],
  ["submitted", "Submitted"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["paid", "Paid"],
  ["void", "Void"],
]);

async function expenseStatusChoices(): Promise<void> {
  const field = await directusFetch("/fields/payment_expenses/status");
  const have = ((field?.data?.meta?.options?.choices ?? []) as { value: string }[]).map((c) => c.value);
  const missing = EXPENSE_STATUS.filter((c) => !have.includes(c.value)).map((c) => c.value);
  if (!missing.length) return skip("payment_expenses.status has every choice");
  if (!APPLY) return would(`add ${missing.join(", ")} to payment_expenses.status`);
  await directusFetch("/fields/payment_expenses/status", {
    method: "PATCH",
    body: JSON.stringify({ meta: { options: { ...(field?.data?.meta?.options ?? {}), choices: EXPENSE_STATUS } } }),
  });
  did(`added ${missing.join(", ")} to payment_expenses.status`);
}

async function expenses(): Promise<void> {
  console.log("\n📁 payment_expenses");
  await expenseStatusChoices();
  await ensureField("payment_expenses", "entered_by", userField("Who entered it. Never approves it."));
  await ensureRelation("payment_expenses", "entered_by", "directus_users", "SET NULL");
  await ensureField("payment_expenses", "approval", m2o("The current spend approval."));
  await ensureRelation("payment_expenses", "approval", "money_approvals", "SET NULL");
  await ensureField("payment_expenses", "paid_by", userField("Who recorded it paid."));
  await ensureRelation("payment_expenses", "paid_by", "directus_users", "SET NULL");
  await ensureField("payment_expenses", "paid_reference", {
    type: "string",
    schema: { is_nullable: true, max_length: 120 },
    meta: { interface: "input", width: "half", note: "Check number or transfer reference." },
  });
  await ensureField("payment_expenses", "paid_without_approval", {
    type: "boolean",
    schema: { is_nullable: false, default_value: false },
    meta: {
      interface: "boolean",
      special: ["cast-boolean"],
      width: "half",
      readonly: true,
      note: "Recorded paid before its approval was met. Stays true for good.",
    },
  });
  await ensureField("payment_expenses", "void_reason", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", readonly: true },
  });
}

async function charges(): Promise<void> {
  console.log("\n📁 payment_requests");
  await ensureField("payment_requests", "waiver", m2o("The open or last waive approval."));
  await ensureRelation("payment_requests", "waiver", "money_approvals", "SET NULL");
}

async function main(): Promise<void> {
  console.log(`🚀 add-money-approvals${APPLY ? "" : " (dry run: nothing is written; --apply to write)"}`);
  console.log(`📡 ${DIRECTUS_URL}`);
  await approvals();
  await decisions();
  await expenses();
  await charges();
  console.log(`\n✅ Done.${APPLY ? " Next: pnpm generate:types" : ""}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
