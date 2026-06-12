/**
 * Add the CTA/toast fields to hoa_announcements that the app already uses
 * (Announcement/Sheet.vue, Announcement/Toast.vue, useAnnouncements.ts):
 *
 *   - button_text    string  — CTA button label
 *   - button_link    string  — CTA button href (internal path or full URL)
 *   - external_link  boolean — force the CTA to open in a new tab
 *   - show_toast     boolean — surface the announcement as a toast (default true)
 *
 * Without these the explicit `fields` list in useAnnouncements.ts is rejected
 * by Directus (FORBIDDEN), so announcement fetches fail at runtime.
 *
 * Idempotent. Run with: pnpm run add:announcement-cta
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
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

const FIELDS = [
  {
    field: "button_text",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Optional CTA button label shown on the announcement.",
      options: { placeholder: "Read the full notice" },
    },
    schema: { is_nullable: true },
  },
  {
    field: "button_link",
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "CTA button destination — an internal path (/docs) or a full URL.",
      options: { placeholder: "/documents or https://…" },
    },
    schema: { is_nullable: true },
  },
  {
    field: "external_link",
    type: "boolean",
    meta: {
      interface: "boolean",
      width: "half",
      note: "Open the CTA link in a new tab even if it looks internal.",
    },
    schema: { is_nullable: true, default_value: false },
  },
  {
    field: "show_toast",
    type: "boolean",
    meta: {
      interface: "boolean",
      width: "half",
      note: "Surface this announcement as a toast for members. Off = sheet/feed only.",
    },
    schema: { is_nullable: true, default_value: true },
  },
];

async function main(): Promise<void> {
  console.log("🚀 Adding CTA/toast fields to hoa_announcements\n");
  for (const def of FIELDS) {
    try {
      await directusFetch(`/fields/hoa_announcements/${def.field}`);
      console.log(`   ⏭️  ${def.field} already exists, skipping.`);
      continue;
    } catch {
      /* doesn't exist — create */
    }
    await directusFetch(`/fields/hoa_announcements`, {
      method: "POST",
      body: JSON.stringify(def),
    });
    console.log(`   ✅ Created hoa_announcements.${def.field}`);
  }
  console.log("\n📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
