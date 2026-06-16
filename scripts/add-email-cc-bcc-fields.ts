/**
 * Add CC/BCC support to the email system.
 *
 * - hoa_emails.cc / hoa_emails.bcc: JSON arrays holding free-form email
 *   addresses and/or group tokens (@board, @property_manager). Stored as
 *   entered so a re-send re-resolves the current board/PM roster.
 * - block_settings.cc_bcc_threshold: per-org recipient cutoff. At or below it,
 *   CC/BCC are attached to each personalized email (everyone sees the CC). Above
 *   it, the CC/BCC contacts each get a single copy. Default 5.
 *
 * Idempotent. Run with: pnpm run create:email-cc-bcc
 * Then: pnpm generate:types
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
    console.log(`   ⏭️  ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    // create
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created ${collection}.${field}`);
}

async function main(): Promise<void> {
  console.log("🚀 Adding CC/BCC fields\n");
  console.log(`📡 ${DIRECTUS_URL}`);

  await createField("hoa_emails", "cc", {
    type: "json",
    meta: {
      interface: "tags",
      width: "half",
      note: "CC recipients — emails and/or group tokens (@board, @property_manager)",
    },
  });

  await createField("hoa_emails", "bcc", {
    type: "json",
    meta: {
      interface: "tags",
      width: "half",
      note: "BCC recipients — emails and/or group tokens (@board, @property_manager)",
    },
  });

  await createField("block_settings", "cc_bcc_threshold", {
    type: "integer",
    schema: { default_value: 5 },
    meta: {
      interface: "input",
      width: "half",
      note: "Recipient count at/below which CC/BCC are attached to each email (everyone sees the CC). Above it, CC/BCC contacts each get one copy. Default 5.",
    },
  });

  console.log("\n✅ Done.");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
