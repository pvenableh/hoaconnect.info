/**
 * Adds a `context` JSON column to `ai_conversations` so a conversation can be
 * SCOPED to a specific thing the user was looking at — an entity
 * ({ entityType, entityId, label }) or a route/scope ({ scope, route }). This
 * is what lets a member / vendor / project / ticket each carry its own AI thread
 * and history (see docs/plan-earnest-parity-upgrade.md, Phase 1).
 *
 * Directus can't deep-filter JSON, so the by-entity / by-route lookups fetch the
 * user's recent conversations with a non-null `context` and match in memory
 * (mirrors Earnest's ai_chat_sessions.context pattern).
 *
 * Run with: pnpm run add:ai-conversation-context
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing field is skipped.
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

async function main() {
  console.log("🚀 Adding ai_conversations.context...\n");
  await createField("ai_conversations", "context", {
    type: "json",
    meta: {
      interface: "input-code",
      options: { language: "json" },
      note: "What this conversation is scoped to: { entityType, entityId, label } or { scope, route }.",
    },
  });
  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
