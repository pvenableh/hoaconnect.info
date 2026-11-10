/**
 * Operator console Phase 3 (docs/plan-operator-console.md §5–§6): the platform
 * support door, and "Ask my community" as a question in the existing inbox.
 *
 * ── support_requests ── "Contact HOA Connect" (platform requests only; the
 * community door reuses hoa_requests, Peter's call 2026-11-10)
 *   organization / billing_account — the context (M2O, SET NULL)
 *   requester (M2O users, SET NULL), requester_name / requester_email (kept for
 *     replies by email after the account is gone)
 *   requester_roles — the asker's hats at that moment (membership role, board
 *     office, residency, manager grants, billing account role)
 *   category: question | bug | billing | feature
 *   status: new | open | waiting | closed;  priority: low | normal | high | urgent
 *   subject, page, app_version, source (app | auto)
 *   auto_key — UNIQUE, for entries HOA Connect raises itself (a failed payment,
 *     a signup that never completed, a webhook that errored), one per cause
 *   last_message_at / last_message_by (requester | staff | system), closed_at
 *
 * ── support_messages ──
 *   request (M2O, CASCADE), author (M2O users, SET NULL), author_name,
 *   author_kind (requester | admin | staff | system), body,
 *   internal — HOA Connect's own notes, never shown outside the console
 *   attachments — reserved (JSON list of file ids); no upload UI yet
 *
 * No role gets access to either: the app's routes read and write them with the
 * admin token after their own checks (core/server/utils/support.ts).
 *
 * ── hoa_requests: the "question" type ── "Ask my community". Adds the choice to
 * the field, and to the member policy's create validation (which lists the types
 * a member may file), so members can create one with their own token.
 *
 * Read-only by default:
 *   pnpm run create:support-schema            # look
 *   pnpm run create:support-schema -- --apply # create (hosted Directus: Peter's yes first)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const q = (f: unknown) => encodeURIComponent(JSON.stringify(f));

type Field = { field: string; type: string; meta: Record<string, unknown>; schema: Record<string, unknown> };
const ro = (meta: Record<string, unknown> = {}) => ({ width: "half", ...meta });
const str = (field: string, max: number, nullable = true, meta: Record<string, unknown> = {}): Field => ({
  field,
  type: "string",
  meta: ro({ interface: "input", ...meta }),
  schema: { is_nullable: nullable, max_length: max },
});
const ts = (field: string, meta: Record<string, unknown> = {}): Field => ({
  field,
  type: "timestamp",
  meta: ro({ interface: "datetime", ...meta }),
  schema: { is_nullable: true },
});
const uuid = (field: string, note: string): Field => ({
  field,
  type: "uuid",
  meta: ro({ interface: "select-dropdown-m2o", special: ["m2o"], note }),
  schema: { is_nullable: true },
});
const json = (field: string): Field => ({ field, type: "json", meta: { interface: "input-code", width: "full", options: { language: "json" } }, schema: { is_nullable: true } });
const text = (field: string, nullable = true): Field => ({ field, type: "text", meta: { interface: "input-multiline", width: "full" }, schema: { is_nullable: nullable } });

const COLLECTIONS: Array<{ name: string; meta: Record<string, unknown>; fields: Field[]; relations: Array<{ field: string; related: string; onDelete: string }> }> = [
  {
    name: "support_requests",
    meta: { icon: "support_agent", note: "Contact HOA Connect: platform support requests. Read and written by the app only.", display_template: "{{subject}} ({{status}})", sort_field: "last_message_at" },
    fields: [
      uuid("organization", "The community it's about. SET NULL: the request outlives it."),
      uuid("billing_account", "The agency billing account it's about, if any."),
      uuid("requester", "Who asked. SET NULL: the name and email below are kept."),
      str("requester_name", 255),
      str("requester_email", 255),
      json("requester_roles"),
      str("category", 16, false),
      { field: "status", type: "string", meta: ro({ interface: "input" }), schema: { is_nullable: false, max_length: 16, default_value: "new" } },
      { field: "priority", type: "string", meta: ro({ interface: "input" }), schema: { is_nullable: false, max_length: 16, default_value: "normal" } },
      str("subject", 200, false, { width: "full" }),
      str("page", 500),
      str("app_version", 64),
      { field: "source", type: "string", meta: ro({ interface: "input" }), schema: { is_nullable: false, max_length: 8, default_value: "app" } },
      { field: "auto_key", type: "string", meta: ro({ interface: "input", note: "Unique: one automatic entry per cause." }), schema: { is_nullable: true, is_unique: true, max_length: 255 } },
      ts("last_message_at"),
      str("last_message_by", 16),
      ts("closed_at"),
      ts("date_created", { special: ["date-created"], readonly: true }),
      ts("date_updated", { special: ["date-updated"], readonly: true }),
    ],
    relations: [
      { field: "organization", related: "hoa_organizations", onDelete: "SET NULL" },
      { field: "billing_account", related: "billing_accounts", onDelete: "SET NULL" },
      { field: "requester", related: "directus_users", onDelete: "SET NULL" },
    ],
  },
  {
    name: "support_messages",
    meta: { icon: "forum", note: "Messages on support_requests. Internal notes never leave the console.", display_template: "{{author_name}}: {{body}}", sort_field: "date_created" },
    fields: [
      { ...uuid("request", "The request (CASCADE)."), schema: { is_nullable: false } },
      uuid("author", "Who wrote it. SET NULL: author_name is kept."),
      str("author_name", 255),
      str("author_kind", 16, false),
      text("body", false),
      { field: "internal", type: "boolean", meta: ro({ interface: "boolean" }), schema: { is_nullable: false, default_value: false } },
      json("attachments"),
      ts("date_created", { special: ["date-created"], readonly: true }),
    ],
    relations: [
      { field: "request", related: "support_requests", onDelete: "CASCADE" },
      { field: "author", related: "directus_users", onDelete: "SET NULL" },
    ],
  },
];

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);
  let todo = 0;

  for (const c of COLLECTIONS) {
    const exists = !!(await directusFetch(`/collections/${c.name}`))?.data;
    const have = new Set<string>(exists ? (((await directusFetch(`/fields/${c.name}`))?.data ?? []) as any[]).map((f) => f.field) : []);
    const missing = c.fields.filter((f) => !have.has(f.field));
    const rels = exists ? (((await directusFetch(`/relations/${c.name}`))?.data ?? []) as any[]) : [];
    const missingRels = c.relations.filter((r) => !rels.some((x) => x.field === r.field));
    console.log(`${c.name}: ${exists ? "exists" : "missing"} · fields missing: ${missing.map((f) => f.field).join(", ") || "none"} · relations missing: ${missingRels.map((r) => r.field).join(", ") || "none"}`);
    todo += (exists ? 0 : 1) + missing.length + missingRels.length;
    if (!APPLY) continue;
    if (!exists) {
      await directusFetch("/collections", {
        method: "POST",
        body: JSON.stringify({
          collection: c.name,
          meta: { ...c.meta, hidden: false },
          schema: { name: c.name },
          fields: [{ field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } }],
        }),
      });
      console.log(`  created ${c.name}`);
    }
    for (const f of missing) {
      await directusFetch(`/fields/${c.name}`, { method: "POST", body: JSON.stringify(f) });
      console.log(`  created field ${f.field}`);
    }
    for (const r of missingRels) {
      await directusFetch("/relations", {
        method: "POST",
        body: JSON.stringify({ collection: c.name, field: r.field, related_collection: r.related, schema: { on_delete: r.onDelete }, meta: { sort_field: null } }),
      });
      console.log(`  created relation ${r.field} → ${r.related}`);
    }
  }

  // hoa_requests.type: the "question" choice.
  const typeField = (await directusFetch("/fields/hoa_requests/type"))?.data;
  const choices: Array<{ text: string; value: string }> = typeField?.meta?.options?.choices ?? [];
  const hasChoice = choices.some((c) => c.value === "question");
  console.log(`hoa_requests.type choice "question": ${hasChoice ? "present" : "missing"}`);
  if (!hasChoice) todo += 1;
  if (APPLY && typeField && !hasChoice) {
    await directusFetch("/fields/hoa_requests/type", {
      method: "PATCH",
      body: JSON.stringify({ meta: { options: { ...(typeField.meta.options ?? {}), choices: [...choices, { text: "Question", value: "question" }] } } }),
    });
    console.log("  added the choice");
  }

  // Member create permissions that list the types a member may file.
  const perms = (((await directusFetch(`/permissions?limit=-1&fields=id,validation&filter=${q({ collection: { _eq: "hoa_requests" }, action: { _eq: "create" } })}`))?.data) ?? []) as any[];
  for (const p of perms) {
    const v = JSON.stringify(p.validation ?? null);
    if (!v.includes('"type":{"_in"')) continue;
    const next = JSON.parse(v, (_k, val) =>
      val && typeof val === "object" && Array.isArray(val._in) && val._in.includes("maintenance") && !val._in.includes("question")
        ? { ...val, _in: [...val._in, "question"] }
        : val
    );
    const changed = JSON.stringify(next) !== v;
    console.log(`create permission ${String(p.id).slice(0, 8)}…: question ${changed ? "missing" : "allowed"}`);
    if (changed) todo += 1;
    if (APPLY && changed) {
      await directusFetch(`/permissions/${p.id}`, { method: "PATCH", body: JSON.stringify({ validation: next }) });
      console.log("  allowed question");
    }
  }

  const supportPerms = (((await directusFetch(`/permissions?limit=-1&fields=id&filter=${q({ collection: { _in: ["support_requests", "support_messages"] } })}`))?.data) ?? []) as any[];
  console.log(`Role permissions on the support collections: ${supportPerms.length} (expected 0).`);
  if (!APPLY && todo) console.log(`\n${todo} change(s) pending. Nothing written. Run with --apply.`);
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
