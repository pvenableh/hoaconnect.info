/**
 * `ops_audit_log`: what HOA Connect staff did from the operator console
 * (docs/plan-operator-console.md §4.3, §6). Written only by
 * `writeOpsAuditEntry()` in core/server/utils/ops-audit.ts.
 *
 *   occurred_at        — when the action ran
 *   action             — refund | cancel_now | cancel_at_period_end | resume |
 *                        extend_trial | comp_on | comp_off | code_create |
 *                        code_deactivate | portal_open. A string, not an enum
 *                        column: later phases add values.
 *   actor_user         — M2O directus_users (SET NULL)
 *   actor_role         — app_admin | platform_support, as checked at the time
 *   actor_name /
 *   actor_email        — denormalized on purpose, as in org_audit_log: the row
 *                        must still read correctly once the account is gone
 *   reason             — required on every action
 *   summary            — the human sentence
 *   organization       — M2O hoa_organizations (SET NULL, not CASCADE: a refund
 *                        stays on record after the community is deleted)
 *   organization_name  — denormalized for the same reason
 *   billing_account    — M2O billing_accounts (SET NULL)
 *   stripe_mode        — live | test
 *   stripe_ids         — { charge, refund, subscription, customer, coupon,
 *                        promotion_code, portal_session } as touched
 *   amount_cents,
 *   currency           — for money actions
 *   before / after     — the state either side
 *   idempotency_key    — UNIQUE: one submit is one row, however often it arrives
 *   schema_version     — which shape the row holds
 *
 * **Append-only**, as org_audit_log is: no role permissions are created here,
 * the app has no update or delete path, and the database trigger in
 * docs/go-live-checklist.md §3c (which this script can't install) is what would
 * make it true of the database too. Until then it is a property of the code.
 *
 * Read-only by default: prints what exists and what it would create.
 *   pnpm run create:ops-audit-log            # look
 *   pnpm run create:ops-audit-log -- --apply # create (hosted Directus: Peter's yes first)
 *
 * Idempotent: existing fields are left alone. Prerequisites: DIRECTUS_URL +
 * DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");
const C = "ops_audit_log";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

type Field = { field: string; type: string; meta: Record<string, unknown>; schema: Record<string, unknown> };

const FIELDS: Field[] = [
  {
    field: "occurred_at",
    type: "timestamp",
    meta: { interface: "datetime", width: "half", required: true, readonly: true },
    schema: { is_nullable: false },
  },
  {
    field: "action",
    type: "string",
    meta: { interface: "input", width: "half", required: true, readonly: true, note: "A string, not an enum: later phases add values." },
    schema: { is_nullable: false, max_length: 64 },
  },
  {
    field: "actor_user",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", readonly: true, note: "SET NULL on delete: the row outlives the account." },
    schema: { is_nullable: true },
  },
  {
    field: "actor_role",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, note: "app_admin or platform_support, as checked when it ran." },
    schema: { is_nullable: false, max_length: 32 },
  },
  {
    field: "actor_name",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, note: "Denormalized on purpose." },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "actor_email",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "reason",
    type: "text",
    meta: { interface: "input-multiline", width: "full", required: true, readonly: true },
    schema: { is_nullable: false },
  },
  {
    field: "summary",
    type: "text",
    meta: { interface: "input-multiline", width: "full", required: true, readonly: true },
    schema: { is_nullable: false },
  },
  {
    field: "organization",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", readonly: true, note: "SET NULL: a refund stays on record after the community is gone." },
    schema: { is_nullable: true },
  },
  {
    field: "organization_name",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "billing_account",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", readonly: true },
    schema: { is_nullable: true },
  },
  {
    field: "stripe_mode",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: false, max_length: 8 },
  },
  {
    field: "stripe_ids",
    type: "json",
    meta: { interface: "input-code", width: "full", readonly: true, options: { language: "json" } },
    schema: { is_nullable: true },
  },
  {
    field: "amount_cents",
    type: "integer",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: true },
  },
  {
    field: "currency",
    type: "string",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: true, max_length: 8 },
  },
  {
    field: "before",
    type: "json",
    meta: { interface: "input-code", width: "half", readonly: true, options: { language: "json" } },
    schema: { is_nullable: true },
  },
  {
    field: "after",
    type: "json",
    meta: { interface: "input-code", width: "half", readonly: true, options: { language: "json" } },
    schema: { is_nullable: true },
  },
  {
    field: "idempotency_key",
    type: "string",
    meta: { interface: "input", width: "full", readonly: true, note: "Unique: one submit is one row." },
    schema: { is_nullable: false, is_unique: true, max_length: 255 },
  },
  {
    field: "schema_version",
    type: "integer",
    meta: { interface: "input", width: "half", readonly: true },
    schema: { is_nullable: false, default_value: 1 },
  },
  {
    field: "date_created",
    type: "timestamp",
    meta: { interface: "datetime", special: ["date-created"], readonly: true, hidden: true, width: "half" },
    schema: { is_nullable: true },
  },
];

const RELATIONS = [
  { field: "actor_user", related_collection: "directus_users" },
  { field: "organization", related_collection: "hoa_organizations" },
  { field: "billing_account", related_collection: "billing_accounts" },
];

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);

  const exists = !!(await directusFetch(`/collections/${C}`))?.data;
  const have = new Set<string>(
    exists ? (((await directusFetch(`/fields/${C}`))?.data ?? []) as Array<{ field: string }>).map((f) => f.field) : []
  );
  const missing = FIELDS.filter((f) => !have.has(f.field));
  const relations = exists ? (((await directusFetch(`/relations/${C}`))?.data ?? []) as Array<{ field: string }>) : [];
  const missingRelations = RELATIONS.filter((r) => !relations.some((x) => x.field === r.field));

  console.log(`Collection ${C}: ${exists ? "exists" : "missing"}`);
  console.log(`Fields missing: ${missing.length ? missing.map((f) => f.field).join(", ") : "none"}`);
  console.log(`Relations missing: ${missingRelations.length ? missingRelations.map((r) => r.field).join(", ") : "none"}`);

  if (!APPLY) {
    if (!exists || missing.length || missingRelations.length) console.log("\nNothing written. Run with --apply to create what's missing.");
    return;
  }

  if (!exists) {
    await directusFetch("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: C,
        meta: {
          icon: "policy",
          note: "Append-only record of what HOA Connect staff did in the operator console. Written only by writeOpsAuditEntry. Never updated, never deleted.",
          display_template: "{{occurred_at}} · {{action}} · {{summary}}",
          sort_field: "occurred_at",
          hidden: false,
        },
        schema: { name: C },
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
    console.log(`Created collection ${C}`);
  }
  for (const f of missing) {
    await directusFetch(`/fields/${C}`, { method: "POST", body: JSON.stringify(f) });
    console.log(`Created field ${f.field}`);
  }
  for (const r of missingRelations) {
    await directusFetch("/relations", {
      method: "POST",
      body: JSON.stringify({
        collection: C,
        field: r.field,
        related_collection: r.related_collection,
        schema: { on_delete: "SET NULL" },
        meta: { sort_field: null },
      }),
    });
    console.log(`Created relation ${r.field} → ${r.related_collection}`);
  }

  // No role gets access. Say so, and check it.
  const perms = ((await directusFetch(`/permissions?filter=${encodeURIComponent(JSON.stringify({ collection: { _eq: C } }))}&limit=-1&fields=id`))?.data ?? []) as unknown[];
  console.log(`\nRole permissions on ${C}: ${perms.length} (expected 0).`);
  console.log("Immutability is enforced by code until the trigger in docs/go-live-checklist.md §3c covers this table.");
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
