/**
 * Add `notification_preferences` (JSON) to `directus_users` — the single home for
 * a member's per-category email/bell toggles AND their digest settings. The
 * master email switch is the stock `directus_users.email_notifications` boolean
 * (already present), so this adds just the one field.
 *
 * Additive + idempotent against prod Directus.
 *
 * Run with: pnpm run setup:notification-prefs
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function api(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("🔔 Adding notification_preferences to directus_users…\n");

  try {
    await api("/fields/directus_users/notification_preferences");
    console.log("   ⏭️  Field already exists, skipping.");
  } catch {
    await api("/fields/directus_users", {
      method: "POST",
      body: JSON.stringify({
        field: "notification_preferences",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          width: "full",
          note: "Per-category email/bell toggles + digest settings. Managed from the account preferences UI.",
        },
        schema: {},
      }),
    });
    console.log("   ✅ Created directus_users.notification_preferences");
  }

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
