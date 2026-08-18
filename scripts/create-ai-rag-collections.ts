/**
 * Script to create the doc/bylaw RAG collection (Phase 3 commit 2 — doc/bylaw
 * retrieval via Voyage AI; see ~/.claude/plans/fluttering-skipping-snowflake.md).
 * Additive and idempotent against prod Directus, mirroring
 * create-ai-chat-collections.ts:
 *
 *   ai_doc_chunks — one row per embedded text chunk of a governing document.
 *                   Sources are POLYMORPHIC across hoa_governance (bylaws/rules,
 *                   already text) and hoa_documents (uploaded PDFs), so the link
 *                   is a (source_collection, source_id) pair rather than a hard
 *                   FK. Each row carries the chunk text, its Voyage embedding
 *                   vector (json float array), the billed token count, and a
 *                   content_hash so re-ingestion skips unchanged sources.
 *
 * Tenant-isolated via the `organization` FK and accessed ONLY through the server
 * (static admin token, like ai_wallets/ai_conversations) — the retrieval route
 * filters by org, so no per-role Directus permission rows are needed.
 *
 * Run with: pnpm run create:ai-rag
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collection/fields/relations are skipped.
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
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
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

const SOURCE_CHOICES = [
  { text: "Governance (bylaws/rules)", value: "hoa_governance" },
  { text: "Document (uploaded file)", value: "hoa_documents" },
];

async function main() {
  console.log("🚀 Creating doc/bylaw RAG collection (ai_doc_chunks)...\n");

  console.log("📚 ai_doc_chunks");
  await createCollection("ai_doc_chunks", {
    icon: "scatter_plot",
    note: "Embedded chunks of governing documents (bylaws/rules + PDFs) for AI retrieval.",
    display_template: "{{source_title}} #{{chunk_index}}",
    sort_field: "chunk_index",
  });

  // Tenant key.
  await createField("ai_doc_chunks", "organization", {
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
    collection: "ai_doc_chunks",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  // Polymorphic source link — (collection, id) rather than a hard FK, since a
  // chunk can come from hoa_governance OR hoa_documents.
  await createField("ai_doc_chunks", "source_collection", {
    type: "string",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      display: "labels",
      options: { choices: SOURCE_CHOICES },
      note: "Which collection the chunk's source row lives in.",
    },
  });
  await createField("ai_doc_chunks", "source_id", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "The source row id (governance or document)." },
  });
  await createField("ai_doc_chunks", "source_title", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Source title, denormalized for citation display." },
  });
  await createField("ai_doc_chunks", "section", {
    type: "string",
    meta: { interface: "input", width: "half", note: 'Section number for governance (e.g. "4.2.1"), if any.' },
  });

  // The chunk + its embedding.
  await createField("ai_doc_chunks", "chunk_index", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "0-based position of this chunk within its source." },
  });
  await createField("ai_doc_chunks", "chunk_text", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "The chunk's plain text (what gets cited)." },
  });
  await createField("ai_doc_chunks", "embedding", {
    type: "json",
    meta: { interface: "input-code", special: ["cast-json"], width: "full", note: "Voyage embedding vector (unit-normalized float array)." },
  });
  await createField("ai_doc_chunks", "tokens", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "Voyage tokens billed for this chunk." },
  });
  await createField("ai_doc_chunks", "content_hash", {
    type: "string",
    meta: { interface: "input", width: "half", note: "sha256 of the source text — re-ingestion skips unchanged sources." },
  });

  await createField("ai_doc_chunks", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
