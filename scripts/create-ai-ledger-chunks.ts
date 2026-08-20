/**
 * Create `ai_ledger_chunks` — the vector index over the Community Ledger.
 *
 * The doc/bylaw index (`ai_doc_chunks`) answers "what do our rules say". This
 * one answers "what actually happened here", which is the half of Pillar C's
 * promise that Phase 5 made possible: one row per `org_audit_log` entry, its
 * text embedded so an owner's question can find it however they phrase it.
 *
 * ── Why a separate collection, and not a `source_type` on ai_doc_chunks ──────
 *
 * **Every ledger row carries a visibility tier; a document chunk does not.**
 * Mixing them into one index means every existing document query is one
 * forgotten `visibility` filter away from returning a board-only row — and the
 * board-only rows are the payment entries that name one household, which is the
 * first named risk to this whole product. Two indexes cannot make that mistake.
 *
 * The `visibility` column here is DENORMALIZED from the entry, which is only
 * safe because `org_audit_log` is append-only: a row's tier is fixed at write
 * time, so the copy cannot drift from the source. Retrieval narrows on it in the
 * Directus query — never after — the same rule `/api/org/ledger` follows.
 *
 * `entry` is a plain uuid rather than a hard FK. The ledger is append-only and
 * (once the §3c trigger is installed) refuses DELETE outright, so there is no
 * cascade to honour; `organization` CASCADEs, which is the only cleanup that
 * matters when a community leaves.
 *
 * Tenant-isolated via the `organization` FK and reached ONLY through the server
 * with the static admin token — no per-role Directus permissions, exactly like
 * ai_doc_chunks and ai_wallets.
 *
 * Run with: pnpm run create:ai-ledger-chunks
 * Then:     pnpm generate:types
 *
 * Additive and idempotent: existing collection/fields/relations are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
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
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("🚀 Creating the Community Ledger vector index (ai_ledger_chunks)...\n");

  console.log("📒 ai_ledger_chunks");
  await createCollection("ai_ledger_chunks", {
    icon: "manage_search",
    note: "Embedded Community Ledger entries, for owner-facing AI retrieval. One row per org_audit_log entry.",
    display_template: "{{summary}}",
    sort_field: null,
  });

  // Tenant key.
  await createField("ai_ledger_chunks", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
    },
  });
  await createRelation({
    collection: "ai_ledger_chunks",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  // The entry this row indexes. Plain uuid — see the header for why not a FK.
  await createField("ai_ledger_chunks", "entry", {
    type: "uuid",
    schema: { is_nullable: false, is_unique: true },
    meta: {
      interface: "input",
      required: true,
      width: "half",
      note: "The org_audit_log row this chunk indexes. Unique — one chunk per entry.",
    },
  });

  // Denormalized from the entry so the vector SCAN can be narrowed in the query.
  // Safe only because org_audit_log is append-only; see the header.
  await createField("ai_ledger_chunks", "visibility", {
    type: "string",
    schema: { is_nullable: false, default_value: "board" },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      display: "labels",
      options: {
        choices: [
          { text: "Owners", value: "owners" },
          { text: "Board only", value: "board" },
        ],
      },
      note: "Copied from the entry at index time. Defaults to the NARROWER tier so a bad write withholds rather than leaks.",
    },
  });

  await createField("ai_ledger_chunks", "event_type", {
    type: "string",
    meta: { interface: "input", width: "half", note: "The entry's event type, for filtering and display." },
  });
  await createField("ai_ledger_chunks", "occurred_at", {
    type: "timestamp",
    meta: { interface: "datetime", width: "half", note: "The entry's own timestamp — retrieval's recency floor sorts on this." },
  });
  await createField("ai_ledger_chunks", "summary", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "The entry's one-sentence summary, denormalized for citation display." },
  });

  await createField("ai_ledger_chunks", "chunk_text", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Exactly what was embedded (embeddableLedgerText) — what the lexical fallback matches on too." },
  });
  await createField("ai_ledger_chunks", "embedding", {
    type: "json",
    meta: {
      interface: "input-code",
      special: ["cast-json"],
      width: "full",
      note: "Voyage embedding vector (unit-normalized float array).",
    },
  });
  await createField("ai_ledger_chunks", "tokens", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "Voyage tokens billed for this chunk." },
  });
  await createField("ai_ledger_chunks", "content_hash", {
    type: "string",
    meta: { interface: "input", width: "half", note: "sha256 of chunk_text — a re-index skips an entry whose text is unchanged." },
  });

  await createField("ai_ledger_chunks", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types, then pnpm run backfill:ledger-embeddings -- --apply");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
