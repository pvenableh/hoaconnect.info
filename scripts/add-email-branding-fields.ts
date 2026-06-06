/**
 * Email branding enhancement (1033-style newsletter look).
 *
 * Adds per-org branding defaults on block_settings and per-send overrides +
 * a friendly web-view slug on hoa_emails.
 *
 * block_settings (org-level defaults, inherited by every email):
 * - header_text:  custom line under the logo, e.g. "Official Communication of {name}".
 *                 Supports {name} and {legal_name} placeholders.
 * - homepage_url: homepage link shown in the footer (falls back to external_url / portal).
 * - footer_image: a building photo shown full-width at the bottom of the footer (M2O file).
 *
 * hoa_emails (per-send):
 * - web_slug:     pretty URL slug for the public "view on web" page
 *                 (/{org-slug}/announcements/email/{web_slug}); falls back to the id.
 * - header_text:  optional override of the org default for this send.
 * - footer_image: optional override of the org default for this send (M2O file).
 *
 * Idempotent. Run with: pnpm run add:email-branding
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

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* doesn't exist — create */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", {
      method: "POST",
      body: JSON.stringify(relationConfig),
    });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  console.log("🚀 Adding email branding fields\n");
  console.log(`📡 ${DIRECTUS_URL}\n`);

  // ── block_settings: per-org defaults ──────────────────────────────────────
  console.log("block_settings (org defaults):");
  await createField("block_settings", "header_text", {
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "Custom line shown under the logo in emails, e.g. \"Official Communication of {name}\". Supports {name} and {legal_name}.",
      options: { placeholder: "Official Communication of {name}" },
    },
    schema: { is_nullable: true },
  });

  await createField("block_settings", "homepage_url", {
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "Homepage link shown in the email footer. Falls back to the org's external site or resident portal.",
      options: { placeholder: "https://yourbuilding.com" },
    },
    schema: { is_nullable: true },
  });

  await createField("block_settings", "footer_image", {
    type: "uuid",
    meta: {
      interface: "file-image",
      special: ["file"],
      width: "full",
      note: "Building photo shown full-width at the bottom of the email footer.",
    },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: "block_settings",
    field: "footer_image",
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
  });

  // ── hoa_emails: per-send + friendly URL ────────────────────────────────────
  console.log("\nhoa_emails (per-send):");
  await createField("hoa_emails", "web_slug", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Pretty URL slug for the public web view (/{org}/announcements/email/{web_slug}). Auto-derived from the subject; falls back to the id.",
      options: { slug: true, placeholder: "june-2026-updates" },
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_emails", "header_text", {
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "Optional override of the org's default header line for this send.",
      options: { placeholder: "Official Communication of {name}" },
    },
    schema: { is_nullable: true },
  });

  await createField("hoa_emails", "footer_image", {
    type: "uuid",
    meta: {
      interface: "file-image",
      special: ["file"],
      width: "full",
      note: "Optional override of the org's default footer building photo for this send.",
    },
    schema: { is_nullable: true },
  });
  await createRelation({
    collection: "hoa_emails",
    field: "footer_image",
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
  });

  console.log("\n✅ Done.");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
