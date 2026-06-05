/**
 * Script to add Stripe Connect (Express) fields to hoa_organizations.
 *
 * Adds the columns needed to route resident dues into each association's own
 * connected Stripe account and to track onboarding state:
 * - stripe_connect_account_id   : the `acct_...` id of the org's Express account
 * - connect_onboarding_status   : none | pending | restricted | active
 * - connect_charges_enabled     : mirror of Stripe account.charges_enabled
 * - connect_payouts_enabled     : mirror of Stripe account.payouts_enabled
 *
 * These are synced from Stripe by the `account.updated` webhook handler.
 *
 * Run with: pnpm run add:connect-fields
 *
 * Prerequisites:
 * - DIRECTUS_URL in .env file
 * - DIRECTUS_STATIC_TOKEN in .env file (admin token)
 *
 * Idempotent: existing fields are skipped. Additive only — does not touch the
 * existing SaaS subscription billing fields.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
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
    // Field doesn't exist, create it
  }

  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });

  console.log(`   ✅ Created field: ${collection}.${field}`);
}

const ONBOARDING_STATUS_CHOICES = [
  { text: "Not connected", value: "none", color: "var(--theme--foreground-subdued)" },
  { text: "Pending", value: "pending", color: "var(--theme--warning)" },
  { text: "Restricted", value: "restricted", color: "var(--theme--danger)" },
  { text: "Active", value: "active", color: "var(--theme--success)" },
];

async function main(): Promise<void> {
  console.log("🚀 Adding Stripe Connect fields to hoa_organizations...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    await createField("hoa_organizations", "stripe_connect_account_id", {
      type: "string",
      meta: {
        interface: "input",
        width: "half",
        readonly: true,
        note: "Stripe Connect (Express) account id — acct_...",
      },
    });

    await createField("hoa_organizations", "connect_onboarding_status", {
      type: "string",
      schema: { default_value: "none" },
      meta: {
        interface: "select-dropdown",
        display: "labels",
        width: "half",
        options: { choices: ONBOARDING_STATUS_CHOICES },
        note: "Synced from Stripe via the account.updated webhook",
      },
    });

    await createField("hoa_organizations", "connect_charges_enabled", {
      type: "boolean",
      schema: { default_value: false },
      meta: {
        interface: "boolean",
        width: "half",
        readonly: true,
        note: "Mirror of Stripe account.charges_enabled",
      },
    });

    await createField("hoa_organizations", "connect_payouts_enabled", {
      type: "boolean",
      schema: { default_value: false },
      meta: {
        interface: "boolean",
        width: "half",
        readonly: true,
        note: "Mirror of Stripe account.payouts_enabled",
      },
    });

    console.log("\n✅ Stripe Connect fields added to hoa_organizations!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   2. Set STRIPE_CONNECT_FEE_PERCENT in .env (platform fee %)");
    console.log("   3. Onboard an org via the Connect payouts card in org settings");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
