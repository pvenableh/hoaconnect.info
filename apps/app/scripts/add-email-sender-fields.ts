/**
 * White-label email sender fields on block_settings (per-org).
 *
 * - from_name: display name on outgoing org email (defaults to org name).
 * - from_email: full from address — only used once the domain is verified.
 * - email_domain: the domain being authenticated in SendGrid (e.g. 1033lenox.com).
 * - email_domain_id: SendGrid domain-authentication id.
 * - email_domain_verified: DNS validated in SendGrid.
 * - email_domain_dns: the CNAME records the org must add to DNS (shown in UI).
 *
 * Idempotent. Run with: pnpm run create:email-sender
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
  console.log("🚀 Adding white-label email sender fields to block_settings\n");
  console.log(`📡 ${DIRECTUS_URL}`);

  await createField("block_settings", "from_name", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Display name on outgoing email (defaults to the org name)" },
  });

  await createField("block_settings", "from_email", {
    type: "string",
    meta: { interface: "input", width: "half", note: "From address — only used once the sending domain is verified" },
  });

  await createField("block_settings", "email_domain", {
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, note: "Authenticated sending domain (SendGrid)" },
  });

  await createField("block_settings", "email_domain_id", {
    type: "string",
    meta: { interface: "input", width: "half", readonly: true, hidden: true, note: "SendGrid domain-authentication id" },
  });

  await createField("block_settings", "email_domain_verified", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half", readonly: true, note: "Sending domain DNS validated in SendGrid" },
  });

  await createField("block_settings", "email_domain_dns", {
    type: "json",
    meta: { interface: "input-code", width: "full", readonly: true, options: { language: "json" }, note: "CNAME records the org must add to DNS" },
  });

  console.log("\n✅ Done.");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
