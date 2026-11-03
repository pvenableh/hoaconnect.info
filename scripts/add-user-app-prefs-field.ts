/**
 * Add `directus_users.app_prefs` (JSON) — per-user workspace preferences
 * (Earnest parity round 3, Phase 2 item 3). Today it holds the dock's
 * appearance: `{ dock: { palette, position, labels, glass } }`; see
 * core/shared/nav/app-prefs.ts for the shape and the sanitizer.
 *
 * Additive and non-destructive: nullable, no default. A user who never changes
 * the dock stores nothing, and the client falls back to its localStorage cache
 * and then to the defaults. No permission change: the app reads and writes the
 * field only through /api/user/app-prefs, with the admin token, for the
 * session's own user.
 *
 * Run with: pnpm run add:user-app-prefs   (then `pnpm generate:types`)
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing field is left alone.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL and/or DIRECTUS_STATIC_TOKEN");
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
  console.log("🧭 Adding app_prefs to directus_users…\n");

  try {
    await api("/fields/directus_users/app_prefs");
    console.log("   ⏭️  Field already exists, skipping.");
  } catch {
    await api("/fields/directus_users", {
      method: "POST",
      body: JSON.stringify({
        field: "app_prefs",
        type: "json",
        meta: {
          interface: "input-code",
          options: { language: "json" },
          special: ["cast-json"],
          width: "full",
          note: "Per-user workspace preferences (dock palette, position, labels, glass). Managed from the account menu's Dock appearance.",
        },
        schema: {},
      }),
    });
    console.log("   ✅ Created directus_users.app_prefs");
  }

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
