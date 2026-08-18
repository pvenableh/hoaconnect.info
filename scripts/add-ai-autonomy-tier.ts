/**
 * Adds `ai_autonomy_tier` to hoa_organizations — the per-org trust dial for the
 * AI assistant's HITL actions (docs/plan-earnest-parity-upgrade.md, Phase 4).
 *
 *   0 — Ask me everything (default, safest)
 *   1 — Auto-approve low-risk internal actions (create task/note)
 *   2 — Auto-approve any non-outbound action up to medium risk
 *   3 — Auto-approve any non-outbound action
 *
 * Outbound (resident/board-facing) actions ALWAYS require approval regardless of
 * tier — enforced in code (shared/ai/actions.ts shouldAutoApprove), not here.
 *
 * Run with: pnpm run add:ai-autonomy-tier
 * Then:     pnpm generate:types
 * Idempotent: skips if the field already exists.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("🚀 Adding hoa_organizations.ai_autonomy_tier...\n");
  try {
    await directusFetch(`/fields/hoa_organizations/ai_autonomy_tier`);
    console.log("   ⏭️  Field already exists, skipping.");
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/hoa_organizations`, {
    method: "POST",
    body: JSON.stringify({
      field: "ai_autonomy_tier",
      type: "integer",
      schema: { default_value: 0 },
      meta: {
        interface: "select-dropdown",
        width: "half",
        note: "AI assistant trust dial: 0 ask everything · 1 low-risk internal · 2 up to medium · 3 all non-outbound. Outbound always asks.",
        options: {
          choices: [
            { text: "0 — Ask me everything", value: 0 },
            { text: "1 — Handle small internal tasks", value: 1 },
            { text: "2 — Handle internal work", value: 2 },
            { text: "3 — Full non-outbound autonomy", value: 3 },
          ],
        },
        display: "labels",
      },
    }),
  });
  console.log("   ✅ Created field hoa_organizations.ai_autonomy_tier");
  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
