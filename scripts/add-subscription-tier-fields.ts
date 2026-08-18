/**
 * Add the flat-per-building pricing model to `subscription_plans` and seed the
 * five published tiers (Boutique / Mid / Larger / Grand / Enterprise).
 *
 * This replaces the old PER-UNIT pricing (Essentials/Professional/Enterprise
 * @ $2.50/$4.00/$6.00 per unit) with a FLAT monthly fee per building, selected
 * by a unit-count band, plus a one-time onboarding fee. Unit count only SELECTS
 * the band — it never multiplies the price.
 *
 * Additive + idempotent against prod Directus:
 *   - Adds 6 fields: min_units, max_units, onboarding_fee,
 *     stripe_price_id_onboarding, billing_unit, is_contact_only.
 *   - Upserts the 5 new tiers by slug (publishes them, is_active:true).
 *   - DEPRECATES any pre-existing per-unit plan not in the new set
 *     (is_active:false) — never deletes.
 *
 * AI inclusions mirror shared/ai/credits.ts (1,000 credits = $1, 4× margin).
 *
 * Run with: pnpm run create:subscription-tiers
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
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

// ── Seed definitions ─────────────────────────────────────────────────────────
// included_credits ≈ included AI $ × CREDITS_PER_DOLLAR (1000). Generous on
// purpose — AI is a retention play at near-zero marginal cost.

interface TierSeed {
  slug: string;
  name: string;
  description: string;
  min_units: number;
  max_units: number | null;
  price_monthly: number | null;
  price_yearly: number | null; // monthly × 10 (2 months free)
  onboarding_fee: number | null;
  included_credits: number | null;
  is_featured: boolean;
  is_contact_only: boolean;
  sort: number;
  features: string[];
}

const TIERS: TierSeed[] = [
  {
    slug: "boutique",
    name: "Boutique",
    description: "Flat monthly subscription for buildings up to 30 units.",
    min_units: 1,
    max_units: 30,
    price_monthly: 249,
    price_yearly: 2490,
    onboarding_fee: 1500,
    included_credits: 10000,
    is_featured: false,
    is_contact_only: false,
    sort: 1,
    features: [
      "Branded resident portal",
      "Document library",
      "Announcements with email",
      "Resident directory",
      "Meeting management",
    ],
  },
  {
    slug: "mid",
    name: "Mid",
    description: "Flat monthly subscription for buildings of 31–60 units.",
    min_units: 31,
    max_units: 60,
    price_monthly: 449,
    price_yearly: 4490,
    onboarding_fee: 2500,
    included_credits: 25000,
    is_featured: true,
    is_contact_only: false,
    sort: 2,
    features: [
      "Everything in Boutique",
      "Financial dashboard",
      "Budget vs actual reporting",
      "Channels & messaging",
      "Project management",
    ],
  },
  {
    slug: "larger",
    name: "Larger",
    description: "Flat monthly subscription for buildings of 61–100 units.",
    min_units: 61,
    max_units: 100,
    price_monthly: 699,
    price_yearly: 6990,
    onboarding_fee: 3500,
    included_credits: 50000,
    is_featured: false,
    is_contact_only: false,
    sort: 3,
    features: [
      "Everything in Mid",
      "Advanced reporting",
      "Custom branding",
      "Priority onboarding",
      "Larger AI allowance",
    ],
  },
  {
    slug: "grand",
    name: "Grand",
    description: "Flat monthly subscription for buildings of 101–200 units.",
    min_units: 101,
    max_units: 200,
    price_monthly: 999,
    price_yearly: 9990,
    onboarding_fee: 5000,
    included_credits: 100000,
    is_featured: false,
    is_contact_only: false,
    sort: 4,
    features: [
      "Everything in Larger",
      "Multi-board support",
      "Dedicated onboarding",
      "Generous AI allowance",
      "Priority support",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Custom pricing for buildings over 200 units. Contact us.",
    min_units: 201,
    max_units: null,
    price_monthly: null,
    price_yearly: null,
    onboarding_fee: null,
    // included_credits is non-nullable (default 0); Enterprise AI allowance is
    // custom-quoted, so seed 0 and let is_contact_only drive the UI.
    included_credits: 0,
    is_featured: false,
    is_contact_only: true,
    sort: 5,
    features: [
      "Everything in Grand",
      "Custom integrations",
      "SLA guarantee",
      "Custom AI allowance",
      "White-glove onboarding",
    ],
  },
];

const NEW_SLUGS = new Set(TIERS.map((t) => t.slug));

async function main() {
  console.log("🚀 Extending subscription_plans with flat-per-building tiers...\n");

  // ── 1. Fields ───────────────────────────────────────────────────────────────
  console.log("🧱 Adding band / onboarding fields");
  await createField("subscription_plans", "min_units", {
    type: "integer",
    schema: { is_nullable: true },
    meta: { interface: "input", width: "half", note: "Band lower bound (units)." },
  });
  await createField("subscription_plans", "max_units", {
    type: "integer",
    schema: { is_nullable: true },
    meta: {
      interface: "input",
      width: "half",
      note: "Band upper bound (units). Null = no cap (Enterprise).",
    },
  });
  await createField("subscription_plans", "onboarding_fee", {
    type: "decimal",
    schema: { is_nullable: true, numeric_precision: 10, numeric_scale: 2 },
    meta: { interface: "input", width: "half", note: "Standard one-time setup fee (USD)." },
  });
  await createField("subscription_plans", "stripe_price_id_onboarding", {
    type: "string",
    schema: { is_nullable: true },
    meta: {
      interface: "input",
      width: "half",
      note: "Stripe one-time Price id for standard onboarding.",
    },
  });
  await createField("subscription_plans", "billing_unit", {
    type: "string",
    schema: { default_value: "building", is_nullable: false },
    meta: {
      interface: "input",
      width: "half",
      note: "Display billing unit. Always 'building' — never 'unit'.",
    },
  });
  await createField("subscription_plans", "is_contact_only", {
    type: "boolean",
    schema: { default_value: false, is_nullable: false },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Hide price, show 'Contact us' (Enterprise / Signature).",
    },
  });

  // ── 2. Deprecate old per-unit plans (never delete) ───────────────────────────
  console.log("\n🗂️  Deprecating pre-existing per-unit plans not in the new set");
  const existing = (await directusFetch(
    "/items/subscription_plans?fields=id,slug,is_active&limit=-1"
  )) as { data?: { id: string; slug: string; is_active?: boolean }[] };
  for (const plan of existing?.data ?? []) {
    if (!NEW_SLUGS.has(plan.slug) && plan.is_active !== false) {
      await directusFetch(`/items/subscription_plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      console.log(`   🚫 Deprecated legacy plan: ${plan.slug} (is_active:false)`);
    }
  }

  // ── 3. Upsert the new tiers by slug ──────────────────────────────────────────
  console.log("\n📦 Upserting flat-per-building tiers");
  for (const tier of TIERS) {
    const found = (await directusFetch(
      `/items/subscription_plans?filter[slug][_eq]=${tier.slug}&fields=id&limit=1`
    )) as { data?: { id: string }[] };
    const row = {
      status: "published",
      name: tier.name,
      slug: tier.slug,
      description: tier.description,
      min_units: tier.min_units,
      max_units: tier.max_units,
      price_monthly: tier.price_monthly,
      price_yearly: tier.price_yearly,
      onboarding_fee: tier.onboarding_fee,
      included_credits: tier.included_credits,
      is_featured: tier.is_featured,
      is_contact_only: tier.is_contact_only,
      billing_unit: "building",
      is_active: true,
      sort: tier.sort,
      features: tier.features,
    };
    const id = found?.data?.[0]?.id;
    if (id) {
      await directusFetch(`/items/subscription_plans/${id}`, {
        method: "PATCH",
        body: JSON.stringify(row),
      });
      console.log(`   ♻️  Updated tier: ${tier.slug}`);
    } else {
      await directusFetch("/items/subscription_plans", {
        method: "POST",
        body: JSON.stringify(row),
      });
      console.log(`   ✅ Created tier: ${tier.slug}`);
    }
  }

  console.log("\n✨ Done. Run `pnpm generate:types` next.");
}

main().catch((err) => {
  console.error("\n💥 Failed:", err);
  process.exit(1);
});
