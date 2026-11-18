/**
 * Correcting a charge (Phase 5c, docs/spec-charge-corrections.md): the whole
 * schema, in one pass.
 *
 *   money_approvals    kind gains `move` (a charge to another household).
 *                      amount: a partial waiver's cut (empty is all that
 *                      remains). proposed: a move's change,
 *                      { member, unit, from_member, from_unit }
 *   payment_requests   withdrawn_at, withdrawn_by, withdrawn_reason: a
 *                      charge withdrawn within its 24-hour window. It is
 *                      canceled and kept on record, never deleted
 *
 * Every organization on the instance is test data, so nothing is back-filled.
 *
 * Permissions do not change. The script lists every rule on payment_requests
 * and fails if any policy can update or delete a charge (the cancel lock,
 * Session 5): every correction is a route on the app's token.
 *
 * Run with: pnpm add:charge-corrections           (dry run: reports only)
 *           pnpm add:charge-corrections --apply   (writes the schema)
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then
 * `pnpm generate:types`. Idempotent: what exists is skipped.
 */
import { chargeWriteRules, type PermissionRow } from "./lib/money-approval-perms";

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

const KINDS = choices([
  ["spend", "Spend"],
  ["void", "Void"],
  ["waive", "Waive"],
  ["move", "Move"],
]);

/** `kind` is a string with choices, not a database enum: adding one is a meta change. */
async function kindChoices(): Promise<void> {
  const field = await directusFetch("/fields/money_approvals/kind");
  const have = ((field?.data?.meta?.options?.choices ?? []) as { value: string }[]).map((c) => c.value);
  const missing = KINDS.filter((c) => !have.includes(c.value)).map((c) => c.value);
  if (!missing.length) return skip("money_approvals.kind has every choice");
  if (!APPLY) return would(`add ${missing.join(", ")} to money_approvals.kind`);
  await directusFetch("/fields/money_approvals/kind", {
    method: "PATCH",
    body: JSON.stringify({ meta: { options: { ...(field?.data?.meta?.options ?? {}), choices: KINDS } } }),
  });
  did(`added ${missing.join(", ")} to money_approvals.kind`);
}

async function approvals(): Promise<void> {
  console.log("\n📁 money_approvals");
  await kindChoices();
  await ensureField("money_approvals", "amount", {
    type: "decimal",
    schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 },
    meta: {
      interface: "input",
      width: "half",
      readonly: true,
      note: "A partial waiver's cut. Empty: all that remains.",
    },
  });
  await ensureField("money_approvals", "proposed", {
    type: "json",
    schema: { is_nullable: true },
    meta: {
      interface: "input-code",
      options: { language: "json" },
      special: ["cast-json"],
      readonly: true,
      note: "A move's change: { member, unit, from_member, from_unit }.",
    },
  });
}

async function charges(): Promise<void> {
  console.log("\n📁 payment_requests");
  await ensureField("payment_requests", "withdrawn_at", {
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", width: "half", readonly: true, note: "Withdrawn within 24 hours of being entered, before anything was paid or reminded." },
  });
  await ensureField("payment_requests", "withdrawn_by", {
    type: "uuid",
    schema: { is_nullable: true },
    meta: { interface: "select-dropdown-m2o", display: "user", width: "half", readonly: true, note: "Who withdrew it." },
  });
  await ensureRelation("payment_requests", "withdrawn_by", "directus_users", "SET NULL");
  await ensureField("payment_requests", "withdrawn_reason", {
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", readonly: true },
  });
}

/** No policy may update or delete a charge: say what rules exist, and fail on a write. */
async function lockCheck(): Promise<boolean> {
  console.log("\n🔒 The charge cancel lock");
  const res = await directusFetch(
    `/permissions?filter=${encodeURIComponent(
      JSON.stringify({ collection: { _eq: "payment_requests" } })
    )}&fields=id,policy.id,policy.name,collection,action&limit=-1`
  );
  const rows: PermissionRow[] = (res?.data ?? []).map((r: any) => ({
    id: r.id,
    policyName: r.policy?.name ?? null,
    collection: r.collection,
    action: r.action,
  }));
  for (const r of rows) console.log(`   · ${r.policyName ?? "a policy"}: ${r.action} on ${r.collection} (#${r.id})`);
  const broken = chargeWriteRules(rows);
  if (!broken.length) {
    skip("no policy updates or deletes a charge");
    return true;
  }
  for (const r of broken) console.error(`   ❌ ${r.policyName ?? "a policy"} can ${r.action} a charge (#${r.id}): run pnpm add:money-approvals --lock`);
  return false;
}

async function main(): Promise<void> {
  console.log(`🚀 add-charge-corrections${APPLY ? "" : " (dry run: nothing is written; --apply to write)"}`);
  console.log(`📡 ${DIRECTUS_URL}`);
  const locked = await lockCheck();
  if (!locked) {
    console.error("\n❌ The charge cancel lock is broken: nothing written.");
    process.exit(1);
  }
  await approvals();
  await charges();
  console.log(`\n✅ Done.${APPLY ? " Next: pnpm generate:types" : ""}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
