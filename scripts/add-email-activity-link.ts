/**
 * Add a direct `email_record` M2O link from hoa_email_activity → hoa_emails, so
 * a SendGrid activity event ties straight to the email it came from (set from
 * the `email_id` custom_arg) — alongside the existing `organization` + `member`
 * + `email_recipient` links. ("email" on this collection is already the string
 * address, hence the `email_record` name.)
 *
 * Run with: pnpm run add:email-activity-link
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: an existing field/relation is skipped.
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

async function createField(collection: string, field: string, fieldConfig: Record<string, any>) {
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

async function createRelation(relationConfig: Record<string, any>) {
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
  console.log("🔗 Linking hoa_email_activity → hoa_emails (email_record)...\n");
  await createField("hoa_email_activity", "email_record", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      display: "related-values",
      display_options: { template: "{{subject}}" },
      note: "The hoa_emails record this activity event belongs to (from the email_id custom_arg).",
    },
  });
  await createRelation({
    collection: "hoa_email_activity",
    field: "email_record",
    related_collection: "hoa_emails",
    schema: { on_delete: "SET NULL" },
  });
  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
