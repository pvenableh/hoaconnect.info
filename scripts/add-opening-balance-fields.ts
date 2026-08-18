/**
 * Add hoa_organizations.opening_balance + opening_balance_date — the starting
 * point for the Finances → Reports running balance.
 *
 * A community migrating in from a bank statement or a previous system strikes
 * a balance on a date; without these fields every report starts at $0 and the
 * running balance is meaningless for anyone but a brand-new association.
 * Entries dated before `opening_balance_date` are excluded from the reports
 * (they are already inside the balance) — see core/shared/reporting/ledger.ts.
 *
 * Idempotent. Run with: pnpm add:opening-balance
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token) in .env
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
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    // Field doesn't exist — create it.
  }

  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function main(): Promise<void> {
  console.log("🚀 Adding opening-balance fields to hoa_organizations...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    await createField("hoa_organizations", "opening_balance", {
      type: "decimal",
      schema: { numeric_precision: 12, numeric_scale: 2, default_value: 0 },
      meta: {
        interface: "input",
        width: "half",
        note: "Cash on hand when the association started keeping books here. Seeds the running balance in Finances → Reports. May be negative.",
        options: { min: -1000000000, step: 0.01 },
      },
    });

    await createField("hoa_organizations", "opening_balance_date", {
      type: "date",
      meta: {
        interface: "datetime",
        width: "half",
        note: "Date the opening balance was struck. Income/expenses dated before it are excluded from reports (already inside the balance).",
      },
      schema: { is_nullable: true },
    });

    console.log("\n✅ Opening-balance fields added to hoa_organizations!");
    console.log("\n📌 Next steps:");
    console.log("   1. Run `pnpm generate:types` to refresh core/types/directus.ts");
    console.log("   2. Set the balance per org in Settings → Payments → Opening balance");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
