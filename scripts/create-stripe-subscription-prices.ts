/**
 * Create the Stripe catalog for the flat-per-building tiers and write the price
 * ids back onto the Directus `subscription_plans` rows.
 *
 * For each self-serve band (Boutique / Mid / Larger / Grand) it ensures:
 *   - one Product (idempotent via metadata.band_slug)
 *   - a monthly recurring Price        → stripe_price_id_monthly
 *   - an annual recurring Price (×10)  → stripe_price_id_yearly
 *   - a one-time onboarding Price      → stripe_price_id_onboarding
 *
 * Enterprise (contact-only) and Signature onboarding are custom-invoiced — no
 * fixed Price is created for them.
 *
 * Idempotent: prices are keyed by a deterministic `lookup_key`
 * (hoa_<slug>_<monthly|annual|onboarding>); existing ones are reused, and the
 * Directus row is updated only when the stored id differs.
 *
 * The Stripe account is HUE's: Hue is the business and HOA Connect one of its
 * products (2026-11-05). Every product and price is tagged `metadata.app =
 * "hoaconnect"` and named "HOA Connect — <band>", and subscription charges read
 * "HUE HOA CONNECT" on a card statement. The script prints which account it is
 * writing to before it writes anything.
 *
 * Mode: defaults to TEST. Pass `--mode=live` to use the live key (real catalog).
 *
 *   pnpm stripe:subscription-prices            # test mode
 *   pnpm stripe:subscription-prices --mode=live
 *
 * Env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, STRIPE_SECRET_KEY_TEST / _LIVE (Hue's keys).
 * Optional STRIPE_EXPECT_ACCOUNT=acct_… refuses to write to any other account.
 */

import Stripe from "stripe";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

const MODE = process.argv.includes("--mode=live") ? "live" : "test";
const STRIPE_KEY =
  MODE === "live" ? process.env.STRIPE_SECRET_KEY_LIVE : process.env.STRIPE_SECRET_KEY_TEST;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!STRIPE_KEY) {
  console.error(`❌ Missing Stripe ${MODE} secret key`);
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, {
  apiVersion: "2024-11-20.acacia" as unknown as Stripe.LatestApiVersion,
  typescript: true,
});

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

interface BandRow {
  id: string;
  slug: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  onboarding_fee: number | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  stripe_price_id_onboarding: string | null;
}

const APP = "hoaconnect";
/** Card-statement text for subscription charges (5–22 chars, no <>\\'"*). */
const STATEMENT_DESCRIPTOR = "HUE HOA CONNECT";

/**
 * Find-or-create the product for a band (idempotent via metadata.band_slug).
 * A product found from an earlier run without the app tag / name / descriptor
 * is brought up to date rather than duplicated.
 */
async function ensureProduct(band: BandRow): Promise<Stripe.Product> {
  const found = await stripe.products.search({
    query: `metadata['band_slug']:'${band.slug}' AND active:'true'`,
    limit: 1,
  });
  const name = `HOA Connect — ${band.name}`;
  const existing = found.data[0];
  if (existing) {
    if (existing.metadata?.app !== APP || existing.name !== name || existing.statement_descriptor !== STATEMENT_DESCRIPTOR) {
      return stripe.products.update(existing.id, {
        name,
        statement_descriptor: STATEMENT_DESCRIPTOR,
        metadata: { ...existing.metadata, app: APP, band_slug: band.slug },
      });
    }
    return existing;
  }
  return stripe.products.create({
    name,
    statement_descriptor: STATEMENT_DESCRIPTOR,
    metadata: { app: APP, band_slug: band.slug },
  });
}

/** Find-or-create a price by deterministic lookup_key. */
async function ensurePrice(
  lookupKey: string,
  params: Stripe.PriceCreateParams
): Promise<Stripe.Price> {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ ...params, lookup_key: lookupKey });
}

function toCents(usd: number): number {
  return Math.round(usd * 100);
}

async function main() {
  // Say WHICH account before writing anything: the catalog belongs on Hue's.
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve();
  } catch (err: any) {
    const which = MODE === "live" ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST";
    console.error(`❌ Stripe rejected ${which}: ${err?.message ?? err}`);
    console.error(`   Put Hue's ${MODE}-mode secret key (Developers → API keys, ${MODE} mode) in .env as ${which}.`);
    process.exit(1);
  }
  const accountName = account.settings?.dashboard?.display_name || account.business_profile?.name || "(unnamed)";
  console.log(`🏦 Stripe account: ${accountName} (${account.id}) — ${MODE.toUpperCase()} mode`);
  if (process.env.STRIPE_EXPECT_ACCOUNT && process.env.STRIPE_EXPECT_ACCOUNT !== account.id) {
    console.error(`❌ Expected ${process.env.STRIPE_EXPECT_ACCOUNT} (STRIPE_EXPECT_ACCOUNT). Nothing written.`);
    process.exit(1);
  }

  console.log(`🚀 Creating Stripe ${MODE.toUpperCase()} prices for flat-per-building bands...\n`);

  const res = (await directusFetch(
    "/items/subscription_plans?filter[is_active][_eq]=true&filter[is_contact_only][_eq]=false&fields=id,slug,name,price_monthly,price_yearly,onboarding_fee,stripe_price_id_monthly,stripe_price_id_yearly,stripe_price_id_onboarding&sort=sort&limit=-1"
  )) as { data?: BandRow[] };

  const bands = (res?.data ?? []).filter((b) => b.price_monthly != null);
  if (bands.length === 0) {
    console.error("❌ No self-serve bands found. Run pnpm create:subscription-tiers first.");
    process.exit(1);
  }

  for (const band of bands) {
    console.log(`📦 ${band.name} (${band.slug})`);
    const product = await ensureProduct(band);

    const monthly = await ensurePrice(`hoa_${band.slug}_monthly`, {
      product: product.id,
      currency: "usd",
      unit_amount: toCents(Number(band.price_monthly)),
      recurring: { interval: "month" },
      metadata: { app: APP, band_slug: band.slug, kind: "subscription_monthly" },
    });

    const annual = await ensurePrice(`hoa_${band.slug}_annual`, {
      product: product.id,
      currency: "usd",
      unit_amount: toCents(Number(band.price_yearly ?? Number(band.price_monthly) * 10)),
      recurring: { interval: "year" },
      metadata: { app: APP, band_slug: band.slug, kind: "subscription_annual" },
    });

    let onboardingId: string | null = band.stripe_price_id_onboarding;
    if (band.onboarding_fee != null) {
      const onboarding = await ensurePrice(`hoa_${band.slug}_onboarding`, {
        product: product.id,
        currency: "usd",
        unit_amount: toCents(Number(band.onboarding_fee)),
        metadata: { app: APP, band_slug: band.slug, kind: "onboarding" },
      });
      onboardingId = onboarding.id;
      console.log(`   • onboarding  ${onboarding.id}`);
    }

    console.log(`   • monthly     ${monthly.id}`);
    console.log(`   • annual      ${annual.id}`);

    // Write back only when changed.
    const patch: Record<string, string> = {};
    if (band.stripe_price_id_monthly !== monthly.id) patch.stripe_price_id_monthly = monthly.id;
    if (band.stripe_price_id_yearly !== annual.id) patch.stripe_price_id_yearly = annual.id;
    if (onboardingId && band.stripe_price_id_onboarding !== onboardingId)
      patch.stripe_price_id_onboarding = onboardingId;

    if (Object.keys(patch).length > 0) {
      await directusFetch(`/items/subscription_plans/${band.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      console.log(`   ↳ updated Directus row (${Object.keys(patch).join(", ")})`);
    } else {
      console.log("   ↳ Directus row already up to date");
    }
    console.log();
  }

  // Sanity: report AI credit packs presence (the credits/checkout flow uses them).
  console.log("🔎 AI credit packs (small/medium/large) — checking existing prices...");
  const packs = await stripe.prices.search({
    query: `metadata['kind']:'ai_credits' AND active:'true'`,
    limit: 10,
  });
  if (packs.data.length === 0) {
    console.log(
      "   ⚠️  No prices tagged metadata.kind=ai_credits found. The AI top-up flow may create" +
        " ad-hoc prices at checkout — verify server/api/ai/credits/checkout.post.ts."
    );
  } else {
    for (const p of packs.data) console.log(`   • ${p.id} (${p.nickname ?? p.lookup_key ?? ""})`);
  }

  console.log(`\n✨ Done (${MODE} mode).`);
}

main().catch((err) => {
  console.error("\n💥 Failed:", err);
  process.exit(1);
});
