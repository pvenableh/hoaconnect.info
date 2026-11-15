/**
 * The responsibilities register, first slice (docs/spec-responsibilities.md,
 * plan §3.4): two collections, a file junction, and the fields it adds to
 * existing collections.
 *
 *   hoa_responsibilities          one row per standing job
 *   hoa_responsibility_assignees  one dated row per holder (office, member,
 *                                 user, vendor, team or a free-text label)
 *   hoa_responsibilities_files    evidence (M2M directus_files)
 *
 *   hoa_board_members.end_reason, .holder_name   End term / Change office
 *   hoa_tasks.responsibility                     a task a job spawned
 *   hoa_organizations.responsibilities_published, .responsibilities_show_unassigned
 *   hoa_organizations.modules.responsibilities   default true; back-filled
 *                                                onto every stored map
 *   hoa_activity.event_type choices              responsibility, board_term
 *
 * No permissions here: scripts/setup-directus-permissions.ts holds them, and
 * gives no policy any access to the new collections (every read and write is a
 * route under /api/org/responsibilities).
 *
 * No attestation or review collections: they are Phase 11.
 *
 * Run with: pnpm create:responsibilities   (add --dry-run to report only)
 * Then:     pnpm setup:permissions, pnpm generate:types
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 * Idempotent: everything is created only when absent; the back-fill only
 * touches maps that lack the key.
 */
import {
  BASES,
  CADENCES,
  CATEGORIES,
  END_REASONS,
  OFFICES,
  ROLES,
  STATUSES,
} from "../core/shared/responsibilities/config";
import { MANAGER_GRANT_KEYS } from "../core/shared/transition/grants";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
// Same default as core/nuxt.config.ts `directusRolePropertyManager`.
const PM_ROLE =
  process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PROPERTY_MANAGER || "b3c5a96f-ca24-41f1-8c1f-5683db384844";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const would = (what: string) => console.log(`   🔎 would ${what}`);

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function exists(endpoint: string): Promise<boolean> {
  try {
    await directusFetch(endpoint);
    return true;
  } catch {
    return false;
  }
}

/** Collections created in this run, so a dry run knows their fields are new too. */
const plannedCollections = new Set<string>();

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await exists(`/collections/${collection}`)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping`);
    return;
  }
  plannedCollections.add(collection);
  if (DRY_RUN) return would(`create collection ${collection}`);
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } },
      ],
    }),
  });
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, config: Record<string, any>): Promise<void> {
  if (!plannedCollections.has(collection) && (await exists(`/fields/${collection}/${field}`))) {
    console.log(`   ⏭️  ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`create field ${collection}.${field} (${config.type})`);
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...config }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(config: { collection: string; field: string; related_collection: string; meta?: any; schema?: any }): Promise<void> {
  const { collection, field, related_collection } = config;
  if (!plannedCollections.has(collection) && (await exists(`/relations/${collection}/${field}`))) {
    console.log(`   ⏭️  Relation ${collection}.${field} already exists, skipping`);
    return;
  }
  if (DRY_RUN) return would(`relate ${collection}.${field} → ${related_collection} (${config.schema?.on_delete ?? "NO ACTION"})`);
  await directusFetch("/relations", { method: "POST", body: JSON.stringify(config) });
  console.log(`   ✅ Related ${collection}.${field} → ${related_collection}`);
}

const choices = (list: readonly { key: string; label: string }[]) => list.map((c) => ({ text: c.label, value: c.key }));

const dropdown = (list: readonly { key: string; label: string }[], extra: Record<string, any> = {}) => ({
  interface: "select-dropdown",
  options: { choices: choices(list) },
  display: "labels",
  width: "half",
  ...extra,
});

async function addOrgField(collection: string): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection, field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });
}

async function addM2O(collection: string, field: string, related: string, note: string, oneField: string | null = null): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    schema: { is_nullable: true },
    meta: { interface: "select-dropdown-m2o", width: "half", note },
  });
  await createRelation({ collection, field, related_collection: related, meta: { one_field: oneField, sort_field: null }, schema: { on_delete: "SET NULL" } });
}

async function addAuditFields(collection: string): Promise<void> {
  await createField(collection, "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField(collection, "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField(collection, "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField(collection, "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });
  await createField(collection, "user_updated", { type: "uuid", meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection, field: "user_updated", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });
}

// ── hoa_responsibilities ────────────────────────────────────────────────────

async function createResponsibilities(): Promise<void> {
  const c = "hoa_responsibilities";
  console.log(`\n📋 ${c}`);
  await createCollection(c, {
    collection: c,
    icon: "assignment_ind",
    note: "Responsibilities register: one row per standing job. Read and written only through /api/org/responsibilities.",
    sort_field: "sort",
    display_template: "{{title}}",
  });
  await addOrgField(c);
  await createField(c, "title", { type: "string", schema: { is_nullable: false, max_length: 255 }, meta: { interface: "input", required: true, width: "full" } });
  await createField(c, "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });
  await createField(c, "category", { type: "string", schema: { is_nullable: false }, meta: dropdown(CATEGORIES, { required: true }) });
  await createField(c, "cadence", { type: "string", schema: { is_nullable: true }, meta: dropdown(CADENCES) });
  await createField(c, "basis", { type: "string", schema: { is_nullable: false, default_value: "unknown" }, meta: dropdown(BASES) });
  await createField(c, "basis_reference", { type: "string", meta: { interface: "input", width: "half", note: "Contract name, bylaw article, statute section, resolution date…" } });
  await createField(c, "evidence", { type: "alias", meta: { interface: "files", special: ["files"], width: "full" } });
  await createField(c, "area", {
    type: "string",
    schema: { is_nullable: true },
    meta: { interface: "input", width: "half", note: "A key from AREAS (core/shared/transition/grants.ts). Checked by the routes; nothing syncs with manager_areas." },
  });
  await createField(c, "status", { type: "string", schema: { is_nullable: false, default_value: "active" }, meta: dropdown(STATUSES, { note: "Unassigned is never stored: a job with no current holder reads as unassigned." }) });
  await createField(c, "last_verified", { type: "date", meta: { interface: "datetime", width: "half" } });
  await addM2O(c, "last_verified_by", "directus_users", "Who last verified the row");
  await createField(c, "member_visible", {
    type: "boolean",
    schema: { is_nullable: false, default_value: true },
    meta: { interface: "boolean", special: ["cast-boolean"], width: "half", note: "Per-row opt-out. Owners see nothing until the community publishes the register." },
  });
  await addM2O(c, "project", "hoa_projects", "A project this job belongs to");
  await createField(c, "notes", { type: "text", meta: { interface: "input-multiline", width: "full" } });
  await createField(c, "assignees", { type: "alias", meta: { interface: "list-o2m", special: ["o2m"], width: "full" } });
  await createField(c, "tasks", { type: "alias", meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } } });
  await addAuditFields(c);

  const j = "hoa_responsibilities_files";
  console.log(`\n📁 ${j}`);
  await createCollection(j, { collection: j, icon: "folder", note: "Junction: hoa_responsibilities ↔ directus_files (evidence)", hidden: true });
  await createField(j, "hoa_responsibilities_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection: j,
    field: "hoa_responsibilities_id",
    related_collection: c,
    meta: { one_field: "evidence", junction_field: "directus_files_id", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
  await createField(j, "directus_files_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection: j,
    field: "directus_files_id",
    related_collection: "directus_files",
    meta: { junction_field: "hoa_responsibilities_id" },
    schema: { on_delete: "CASCADE" },
  });
}

// ── hoa_responsibility_assignees ────────────────────────────────────────────

async function createAssignees(): Promise<void> {
  const c = "hoa_responsibility_assignees";
  console.log(`\n👥 ${c}`);
  await createCollection(c, {
    collection: c,
    icon: "badge",
    note: "One dated row per holder of a job. Exactly one of office / member / user / vendor / team / label. Ended, never deleted.",
    sort_field: "sort",
    hidden: true,
  });
  await addOrgField(c);
  await createField(c, "responsibility", { type: "uuid", schema: { is_nullable: false }, meta: { interface: "select-dropdown-m2o", required: true, width: "half" } });
  await createRelation({
    collection: c,
    field: "responsibility",
    related_collection: "hoa_responsibilities",
    meta: { one_field: "assignees", sort_field: "sort" },
    schema: { on_delete: "CASCADE" },
  });
  await createField(c, "office", { type: "string", schema: { is_nullable: true }, meta: dropdown(OFFICES, { note: "A board office: the person is read from the board terms for the date." }) });
  await addM2O(c, "member", "hoa_members", "A member of this community");
  await addM2O(c, "user", "directus_users", "A user with a membership here");
  await addM2O(c, "vendor", "hoa_vendors", "A vendor of this community");
  await addM2O(c, "team", "hoa_teams", "A team of this community");
  await createField(c, "label", { type: "string", meta: { interface: "input", width: "half", note: "A name with no record: “City of Miami Beach”, “Nobody”" } });
  await createField(c, "role", { type: "string", schema: { is_nullable: false, default_value: "owner" }, meta: dropdown(ROLES) });
  await createField(c, "start_date", { type: "date", schema: { is_nullable: false }, meta: { interface: "datetime", required: true, width: "half" } });
  await createField(c, "end_date", { type: "date", schema: { is_nullable: true }, meta: { interface: "datetime", width: "half", note: "Null while the row is current. Inclusive." } });
  await createField(c, "holder_name", { type: "string", meta: { interface: "input", width: "half", readonly: true, note: "Frozen by the server when the row is ended, so a departed holder still reads correctly." } });
  await createField(c, "notes", { type: "text", meta: { interface: "input-multiline", width: "full" } });
  await addAuditFields(c);
}

// ── Existing collections ────────────────────────────────────────────────────

async function extendExisting(): Promise<void> {
  console.log("\n🏛️  hoa_board_members");
  await createField("hoa_board_members", "end_reason", {
    type: "string",
    schema: { is_nullable: true },
    meta: dropdown(END_REASONS, { note: "Set by End term or Change office. Null while the term runs." }),
  });
  await createField("hoa_board_members", "holder_name", {
    type: "string",
    schema: { is_nullable: true },
    meta: { interface: "input", width: "half", readonly: true, note: "Frozen when the term is ended: deleting a member sets hoa_member to null." },
  });

  console.log("\n✅ hoa_tasks");
  // one_field: hoa_responsibilities.tasks lists them.
  await addM2O("hoa_tasks", "responsibility", "hoa_responsibilities", "The standing job this task was spawned from", "tasks");

  console.log("\n🏢 hoa_organizations");
  for (const [field, note] of [
    ["responsibilities_published", "Owners read the published register. Admin only; each change is logged."],
    ["responsibilities_show_unassigned", "Owners see published jobs nobody holds, as “Unassigned since …”. Admin only; each change is logged."],
  ] as const) {
    await createField("hoa_organizations", field, {
      type: "boolean",
      schema: { is_nullable: false, default_value: false },
      meta: { interface: "boolean", special: ["cast-boolean"], width: "half", note },
    });
  }
}

/** modules.responsibilities: in the field default, and on every stored map that lacks it. */
async function backfillModules(): Promise<void> {
  console.log("\n🧩 hoa_organizations.modules.responsibilities");
  const field = await directusFetch("/fields/hoa_organizations/modules").catch(() => null);
  if (!field?.data) {
    console.log("   ⚠️  No modules field (scripts/add-org-modules-field.ts has not run). Missing keys read as enabled.");
  } else {
    const raw = field.data.schema?.default_value;
    const current = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (current && typeof current === "object" && current.responsibilities === undefined) {
      if (DRY_RUN) would("add responsibilities: true to the field default");
      else {
        await directusFetch("/fields/hoa_organizations/modules", {
          method: "PATCH",
          body: JSON.stringify({ schema: { default_value: { ...current, responsibilities: true } } }),
        });
        console.log("   ✅ Field default has responsibilities: true");
      }
    } else {
      console.log("   ⏭️  Field default already set (or none)");
    }
  }

  const res = await directusFetch("/items/hoa_organizations?fields=id,name,modules&limit=-1");
  const orgs: any[] = res?.data ?? [];
  let updated = 0;
  let unset = 0;
  for (const o of orgs) {
    const m = o.modules;
    if (!m || typeof m !== "object") {
      unset++;
      continue;
    }
    if (m.responsibilities !== undefined) continue;
    updated++;
    if (DRY_RUN) would(`set modules.responsibilities on ${o.name ?? o.id}`);
    else await directusFetch(`/items/hoa_organizations/${o.id}`, { method: "PATCH", body: JSON.stringify({ modules: { ...m, responsibilities: true } }) });
  }
  console.log(`   ${orgs.length} communities · ${updated} ${DRY_RUN ? "to update" : "updated"} · ${unset} with no stored map (read as enabled)`);
}

async function addActivityTypes(): Promise<void> {
  console.log("\n📈 hoa_activity.event_type choices");
  const field = await directusFetch("/fields/hoa_activity/event_type").catch(() => null);
  if (!field?.data) {
    console.log("   ⚠️  No hoa_activity.event_type field. Skipping.");
    return;
  }
  const meta = field.data.meta ?? {};
  const list: any[] = meta.options?.choices ?? [];
  const add = [
    { text: "Responsibility", value: "responsibility" },
    { text: "Board term", value: "board_term" },
  ].filter((c) => !list.some((x) => x.value === c.value));
  if (!add.length) {
    console.log("   ⏭️  Already there");
    return;
  }
  if (DRY_RUN) return would(`add choices ${add.map((c) => c.value).join(", ")}`);
  await directusFetch("/fields/hoa_activity/event_type", {
    method: "PATCH",
    body: JSON.stringify({ meta: { options: { ...(meta.options ?? {}), choices: [...list, ...add] } } }),
  });
  console.log(`   ✅ Added ${add.map((c) => c.value).join(", ")}`);
}

/** Listed only. A grant set that held every old key now reads as Custom until an admin picks Full service again. */
async function reportFullService(): Promise<void> {
  console.log("\n🧾 Property Managers who held every grant before `responsibilities` (listed only — not changed)");
  const res = await directusFetch(
    `/items/hoa_members?filter[role][_eq]=${encodeURIComponent(PM_ROLE)}&fields=id,organization,status,manager_permissions&limit=-1`
  );
  const old = MANAGER_GRANT_KEYS.filter((k) => k !== "responsibilities");
  const rows = (res?.data ?? []).filter((r: any) => {
    const g = r.manager_permissions ?? {};
    return old.every((k) => g[k] === true) && g.responsibilities !== true;
  });
  if (!rows.length) console.log("   none");
  for (const r of rows) console.log(`   member ${r.id} (${r.status}, org ${r.organization}): reads as Custom until Full service is picked again`);
}

async function reportOrphanTerms(): Promise<void> {
  console.log("\n🪪 Board terms whose member row is gone (listed only)");
  const res = await directusFetch("/items/hoa_board_members?filter[hoa_member][_null]=true&fields=id,title,term_start,term_end&limit=-1");
  const rows: any[] = res?.data ?? [];
  if (!rows.length) console.log("   none");
  for (const r of rows) console.log(`   ${r.id}: ${r.title} ${r.term_start ?? "?"} – ${r.term_end ?? "open"} (no name to freeze)`);
}

async function main(): Promise<void> {
  console.log(`🚀 create-responsibilities-collections${DRY_RUN ? " (dry run — nothing is written)" : ""}`);
  console.log(`📡 ${new URL(DIRECTUS_URL!).host}`);
  await createResponsibilities();
  await createAssignees();
  await extendExisting();
  await backfillModules();
  await addActivityTypes();
  await reportFullService();
  await reportOrphanTerms();
  console.log(`\n✅ Done${DRY_RUN ? " (dry run)" : ""}. Next: pnpm setup:permissions, then pnpm generate:types`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
