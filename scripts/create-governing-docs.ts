/**
 * Governing documents and statute flags: the collections
 * (docs/plan-governing-docs.md §3, spec docs/governing-docs/SPEC_governing-documents.md §3).
 *
 *   hoa_governing_documents        — one recorded instrument (declaration, by-laws, an amendment…)
 *   hoa_governing_sources          — an uploaded copy of it (PDF or image); which copy is authoritative
 *   hoa_governing_pages            — per-page image and extracted text of a source (upload flow)
 *   hoa_governing_provisions       — a citable piece of a document. `text` is VERBATIM.
 *   hoa_governing_provision_links  — amends / replaces / adds_to / conflicts_with between provisions
 *   hoa_statute_references         — shared statute library (no organization)
 *   hoa_statute_flags              — what the statute does on a point, per organization
 *   hoa_statute_flags_provisions   — flag ↔ provision
 *   hoa_statute_flags_references   — flag ↔ statute reference
 *   hoa_governing_audit_log        — append-only: text edits, status changes, publishes
 *
 * plus five nullable fields on hoa_organizations (regime, governing_statute,
 * original_statute_cited, incorporates_future_amendments and its note).
 *
 * **No role gets any permission on these collections** (Peter, 2026-11-10).
 * Every read and write goes through the guarded routes in
 * core/server/api/governing/, which is what keeps drafts and unconfirmed
 * suggestions from members and makes the audited edit route the only way
 * provision text changes. This script creates none and reports the count.
 *
 * No string field here sets Directus's `trim` option: provision text must be
 * stored exactly as given.
 *
 * Read-only by default: prints what exists and what it would create.
 *   pnpm run create:governing-docs            # look
 *   pnpm run create:governing-docs -- --apply # create (hosted Directus: Peter's yes first)
 *
 * Idempotent: existing collections, fields and relations are left alone.
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
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
type Relation = { field: string; related_collection: string; on_delete: "CASCADE" | "SET NULL" };
type Collection = { name: string; icon: string; note: string; display?: string; fields: Field[]; relations: Relation[] };

// ── Field builders ───────────────────────────────────────────────────────────
const str = (field: string, max = 255, note?: string): Field => ({
  field,
  type: "string",
  meta: { interface: "input", width: "half", ...(note ? { note } : {}) },
  schema: { is_nullable: true, max_length: max },
});
const text = (field: string, note?: string): Field => ({
  field,
  type: "text",
  meta: { interface: "input-multiline", width: "full", ...(note ? { note } : {}) },
  schema: { is_nullable: true },
});
const int = (field: string, hidden = false): Field => ({
  field,
  type: "integer",
  meta: { interface: "input", width: "half", hidden },
  schema: { is_nullable: true },
});
const bool = (field: string, note?: string): Field => ({
  field,
  type: "boolean",
  meta: { interface: "boolean", width: "half", ...(note ? { note } : {}) },
  schema: { is_nullable: true },
});
const date = (field: string): Field => ({
  field,
  type: "date",
  meta: { interface: "datetime", width: "half" },
  schema: { is_nullable: true },
});
const timestamp = (field: string): Field => ({
  field,
  type: "timestamp",
  meta: { interface: "datetime", width: "half" },
  schema: { is_nullable: true },
});
const json = (field: string): Field => ({
  field,
  type: "json",
  meta: { interface: "input-code", options: { language: "json" }, width: "full", readonly: true },
  schema: { is_nullable: true },
});
const choice = (field: string, values: string[], fallback?: string): Field => ({
  field,
  type: "string",
  meta: {
    interface: "select-dropdown",
    width: "half",
    options: { choices: values.map((value) => ({ text: value, value })) },
  },
  schema: { is_nullable: fallback === undefined, max_length: 32, ...(fallback !== undefined ? { default_value: fallback } : {}) },
});
const m2o = (field: string, note?: string): Field => ({
  field,
  type: "uuid",
  meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", ...(note ? { note } : {}) },
  schema: { is_nullable: true },
});
const file = (field: string): Field => ({
  field,
  type: "uuid",
  meta: { interface: "file", special: ["file"], width: "half" },
  schema: { is_nullable: true },
});
const created: Field = {
  field: "date_created",
  type: "timestamp",
  meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true, width: "half" },
  schema: { is_nullable: true },
};
const updated: Field = {
  field: "date_updated",
  type: "timestamp",
  meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true, width: "half" },
  schema: { is_nullable: true },
};

const ORG: Relation = { field: "organization", related_collection: "hoa_organizations", on_delete: "CASCADE" };
const SOURCE_KEY_NOTE = "Stable key from an import (e.g. bylaws:3.5). Matched on re-import so nothing is duplicated.";

const COLLECTIONS: Collection[] = [
  {
    name: "hoa_governing_documents",
    icon: "gavel",
    note: "A recorded governing instrument. Read and written only through /api/governing.",
    display: "{{title}}",
    fields: [
      m2o("organization"),
      str("source_key", 128, SOURCE_KEY_NOTE),
      int("sort", true),
      str("title"),
      choice("kind", ["declaration", "articles", "bylaws", "amendment", "rules", "prospectus", "other"], "other"),
      str("citation_prefix", 64, 'e.g. "By-Law", "Decl.", "Art."'),
      date("executed_on"),
      date("recorded_on"),
      str("or_book", 32, "Official Records book"),
      int("or_page_start"),
      int("or_page_end"),
      str("clerk_file_no", 64),
      str("county"),
      m2o("amends", "The document this one amends, if any."),
      choice("status", ["draft", "in_review", "published", "superseded"], "draft"),
      text("transcriber_notes", "Markdown. Lets a reader tell an original error from an import error."),
      text("transcription", "The full transcription as imported, verbatim. Never searched; provisions are."),
      created,
      updated,
    ],
    relations: [ORG, { field: "amends", related_collection: "hoa_governing_documents", on_delete: "SET NULL" }],
  },
  {
    name: "hoa_governing_sources",
    icon: "picture_as_pdf",
    note: "An uploaded copy of a governing document. Recorded copies outrank all others.",
    fields: [
      m2o("organization"),
      m2o("document"),
      file("file"),
      bool("is_recorded_copy"),
      bool("is_authoritative", "The copy the published text was taken from."),
      text("notes"),
      int("page_count"),
      created,
    ],
    relations: [
      ORG,
      { field: "document", related_collection: "hoa_governing_documents", on_delete: "CASCADE" },
      { field: "file", related_collection: "directus_files", on_delete: "SET NULL" },
    ],
  },
  {
    name: "hoa_governing_pages",
    icon: "auto_stories",
    note: "One page of a source: its image and the text extracted from it (a draft until reviewed).",
    fields: [m2o("organization"), m2o("source"), int("page_number"), file("image"), text("text"), str("extraction", 32, "text_layer or ocr")],
    relations: [
      ORG,
      { field: "source", related_collection: "hoa_governing_sources", on_delete: "CASCADE" },
      { field: "image", related_collection: "directus_files", on_delete: "SET NULL" },
    ],
  },
  {
    name: "hoa_governing_provisions",
    icon: "format_list_numbered",
    note: "A citable provision. `text` is the recorded words, verbatim: it changes only through the audited edit route.",
    display: "{{citation}} {{heading}}",
    fields: [
      m2o("organization"),
      m2o("document"),
      m2o("parent"),
      str("source_key", 128, SOURCE_KEY_NOTE),
      int("sort", true),
      str("citation", 128, 'Normalized, e.g. "By-Law 3.5".'),
      str("original_label", 64, 'As printed, e.g. ".5".'),
      str("heading", 512),
      text("text", "VERBATIM. Never corrected, reflowed or summarized. Original typos stay."),
      choice("text_format", ["markdown"], "markdown"),
      int("or_page_start"),
      int("or_page_end"),
      choice("review_state", ["ocr_draft", "reviewed", "verified"], "ocr_draft"),
      m2o("reviewed_by"),
      timestamp("reviewed_at"),
      choice("block_type", ["text", "execution", "exhibit", "drawing"], "text"),
      bool("uncertain", "A handwritten or doubtful reading."),
      created,
      updated,
    ],
    relations: [
      ORG,
      { field: "document", related_collection: "hoa_governing_documents", on_delete: "CASCADE" },
      { field: "parent", related_collection: "hoa_governing_provisions", on_delete: "SET NULL" },
      { field: "reviewed_by", related_collection: "directus_users", on_delete: "SET NULL" },
    ],
  },
  {
    name: "hoa_governing_provision_links",
    icon: "link",
    note: "How one provision touches another. Amendments are linked, never merged.",
    fields: [
      m2o("organization"),
      m2o("from_provision"),
      m2o("to_provision"),
      choice("type", ["amends", "replaces", "adds_to", "conflicts_with"], "amends"),
      text("note"),
    ],
    relations: [
      ORG,
      { field: "from_provision", related_collection: "hoa_governing_provisions", on_delete: "CASCADE" },
      { field: "to_provision", related_collection: "hoa_governing_provisions", on_delete: "CASCADE" },
    ],
  },
  {
    name: "hoa_statute_references",
    icon: "account_balance",
    note: "Shared statute library, per jurisdiction. Curated: nothing here is generated.",
    display: "{{jurisdiction}} {{code}}",
    fields: [
      str("jurisdiction", 16, 'e.g. "FL"'),
      str("code", 255, 'e.g. "718.112(2)(b)"'),
      str("title", 512),
      text("summary"),
      str("url", 1024),
      str("edition", 255, "The edition of the statute that was read."),
      date("checked_on"),
      created,
      updated,
    ],
    relations: [],
  },
  {
    name: "hoa_statute_flags",
    icon: "flag",
    note: "What the statute does on a point a provision covers. A working comparison, not legal advice.",
    display: "{{topic}} · {{relationship}}",
    fields: [
      m2o("organization"),
      str("source_key", 128, SOURCE_KEY_NOTE),
      str("topic"),
      text("document_rule"),
      text("statute_rule"),
      str("statute_citation", 512, "The citation as curated, verbatim. May be empty, compound, or a case."),
      choice("relationship", ["statute_controls", "statute_supplements", "document_controls", "consistent", "counsel_review"]),
      choice("severity", ["info", "low", "medium", "high"], "info"),
      text("note"),
      choice("status", ["suggested", "confirmed", "dismissed", "counsel_confirmed"], "suggested"),
      m2o("confirmed_by"),
      timestamp("confirmed_at"),
      choice("origin", ["curated", "ai_suggested"], "curated"),
      text("quoted_text", "For ai_suggested flags: the provision text the suggestion relied on."),
      created,
      updated,
    ],
    relations: [ORG, { field: "confirmed_by", related_collection: "directus_users", on_delete: "SET NULL" }],
  },
  {
    name: "hoa_statute_flags_provisions",
    icon: "import_export",
    note: "Flag ↔ provision.",
    fields: [m2o("flag"), m2o("provision"), int("sort", true)],
    relations: [
      { field: "flag", related_collection: "hoa_statute_flags", on_delete: "CASCADE" },
      { field: "provision", related_collection: "hoa_governing_provisions", on_delete: "CASCADE" },
    ],
  },
  {
    name: "hoa_statute_flags_references",
    icon: "import_export",
    note: "Flag ↔ statute reference.",
    fields: [m2o("flag"), m2o("reference"), int("sort", true)],
    relations: [
      { field: "flag", related_collection: "hoa_statute_flags", on_delete: "CASCADE" },
      { field: "reference", related_collection: "hoa_statute_references", on_delete: "CASCADE" },
    ],
  },
  {
    name: "hoa_governing_audit_log",
    icon: "policy",
    note: "Append-only record of text edits, status changes and publishes. Never updated, never deleted.",
    display: "{{occurred_at}} · {{action}} · {{summary}}",
    fields: [
      timestamp("occurred_at"),
      str("action", 64, "text_edit | flag_status | publish | review_state | … A string: later phases add values."),
      m2o("organization"),
      m2o("actor_user", "SET NULL on delete: the row outlives the account."),
      str("actor_name", 255, "Denormalized on purpose."),
      str("actor_email"),
      m2o("document"),
      m2o("provision"),
      m2o("flag"),
      text("summary"),
      text("reason"),
      json("before"),
      json("after"),
    ],
    // SET NULL throughout: the record of an edit stays after the thing edited is gone.
    relations: [
      { field: "organization", related_collection: "hoa_organizations", on_delete: "SET NULL" },
      { field: "actor_user", related_collection: "directus_users", on_delete: "SET NULL" },
      { field: "document", related_collection: "hoa_governing_documents", on_delete: "SET NULL" },
      { field: "provision", related_collection: "hoa_governing_provisions", on_delete: "SET NULL" },
      { field: "flag", related_collection: "hoa_statute_flags", on_delete: "SET NULL" },
    ],
  },
];

const ORG_FIELDS: Field[] = [
  choice("regime", ["condominium", "hoa", "coop"]),
  str("governing_statute", 255, 'e.g. "Fla. Stat. ch. 718"'),
  str("original_statute_cited", 255, "The statute the declaration itself names."),
  bool("incorporates_future_amendments", 'Does the declaration adopt the statute "as amended from time to time"? Null = not yet answered.'),
  text("incorporates_future_amendments_note"),
];

async function fieldsOf(collection: string): Promise<Set<string>> {
  return new Set((((await directusFetch(`/fields/${collection}`))?.data ?? []) as Array<{ field: string }>).map((f) => f.field));
}

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);
  let pending = 0;

  for (const c of COLLECTIONS) {
    const exists = !!(await directusFetch(`/collections/${c.name}`))?.data;
    const have = exists ? await fieldsOf(c.name) : new Set<string>();
    const missing = c.fields.filter((f) => !have.has(f.field));
    const relations = exists ? (((await directusFetch(`/relations/${c.name}`))?.data ?? []) as Array<{ field: string }>) : [];
    const missingRelations = c.relations.filter((r) => !relations.some((x) => x.field === r.field));
    pending += (exists ? 0 : 1) + missing.length + missingRelations.length;

    console.log(
      `${c.name}: ${exists ? "exists" : "MISSING"} · fields missing ${missing.length}/${c.fields.length} · relations missing ${missingRelations.length}/${c.relations.length}`
    );
    if (!APPLY) continue;

    if (!exists) {
      await directusFetch("/collections", {
        method: "POST",
        body: JSON.stringify({
          collection: c.name,
          meta: { icon: c.icon, note: c.note, display_template: c.display ?? null, hidden: false },
          schema: { name: c.name },
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
      console.log(`  created collection`);
    }
    for (const f of missing) {
      await directusFetch(`/fields/${c.name}`, { method: "POST", body: JSON.stringify(f) });
      console.log(`  created field ${f.field}`);
    }
  }

  // Relations after every collection exists: several point forward.
  if (APPLY) {
    for (const c of COLLECTIONS) {
      const relations = (((await directusFetch(`/relations/${c.name}`))?.data ?? []) as Array<{ field: string }>);
      for (const r of c.relations.filter((x) => !relations.some((y) => y.field === x.field))) {
        await directusFetch("/relations", {
          method: "POST",
          body: JSON.stringify({
            collection: c.name,
            field: r.field,
            related_collection: r.related_collection,
            schema: { on_delete: r.on_delete },
            meta: { sort_field: null },
          }),
        });
        console.log(`  ${c.name}.${r.field} → ${r.related_collection} (${r.on_delete})`);
      }
    }
  }

  const orgHave = await fieldsOf("hoa_organizations");
  const orgMissing = ORG_FIELDS.filter((f) => !orgHave.has(f.field));
  pending += orgMissing.length;
  console.log(`hoa_organizations: fields missing ${orgMissing.length ? orgMissing.map((f) => f.field).join(", ") : "none"}`);
  if (APPLY) {
    for (const f of orgMissing) {
      await directusFetch("/fields/hoa_organizations", { method: "POST", body: JSON.stringify(f) });
      console.log(`  created field ${f.field}`);
    }
  }

  // No role gets access. Say so, and check it.
  const filter = encodeURIComponent(JSON.stringify({ collection: { _in: COLLECTIONS.map((c) => c.name) } }));
  const perms = ((await directusFetch(`/permissions?filter=${filter}&limit=-1&fields=id`))?.data ?? []) as unknown[];
  console.log(`\nRole permissions on the governing collections: ${perms.length} (expected 0).`);
  if (!APPLY && pending) console.log(`Nothing written. ${pending} thing(s) to create; run with --apply.`);
  if (!APPLY && !pending) console.log("Nothing to create.");
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
