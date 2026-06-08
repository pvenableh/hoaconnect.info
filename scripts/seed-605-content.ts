/**
 * Refresh 605 Lincoln Road landing content:
 *   1. Fix the cached map coordinate (was a zip-centroid ~1.3km off in Biscayne
 *      Bay; corrected to the building on Lincoln Road at Pennsylvania Ave).
 *   2. Replace the placeholder amenities (Wine Cellar / Spa / Private Beach)
 *      with accurate copy for the real building — a 1936 Art Deco office &
 *      retail landmark (the former Sony Music HQ) on the Lincoln Road mall.
 *
 * Idempotent — re-running rewrites geo + the amenity set from this file.
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Run:    pnpm run seed:605-content           (writes)
 *         pnpm run seed:605-content -- --dry   (no writes; reports)
 */

const URL_BASE = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!URL_BASE || !TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const ORG_SLUG = "605-lincoln";

// Precise building location (Mapbox geocode of "605 Lincoln Road, Miami Beach").
const GEO = { lat: 25.791426, lon: -80.134936 };

// Accurate, source-backed amenities for a commercial Art Deco office/retail
// building on the Lincoln Road pedestrian mall. Icons are plain lucide names.
const AMENITIES = [
  {
    title: "Lincoln Road Frontage",
    icon: "store",
    description:
      "Ground-floor retail opening directly onto the historic open-air pedestrian mall — street-level shops and cafés at the front door.",
  },
  {
    title: "Rooftop Terrace",
    icon: "sun",
    description:
      "A landmark rooftop with sweeping views across South Beach and the Atlantic — one of Lincoln Road's most distinctive gathering spaces.",
  },
  {
    title: "Art Deco Landmark",
    icon: "landmark",
    description:
      "A 1936 Streamline Moderne building — the former Sony Music headquarters — in the heart of the Miami Beach Architectural District.",
  },
  {
    title: "Elevator-Served Suites",
    icon: "building-2",
    description:
      "Renovated office floors served by passenger elevators, with prominent Lincoln Road signage frontage.",
  },
  {
    title: "Walk Everywhere",
    icon: "footprints",
    description:
      "Steps from the beach, world-class dining, the New World Center and SoundScape Park, and the Miami Beach Convention Center.",
  },
];

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${URL_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} (${options.method || "GET"} ${endpoint}): ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`)
    .join("&");

async function main() {
  console.log(`\n605 Lincoln content refresh ${DRY ? "(DRY RUN)" : ""}\n`);

  // 1. Org + its settings (block_settings) record.
  const org = await dx(
    `/items/hoa_organizations${qs({
      filter: { slug: { _eq: ORG_SLUG } },
      fields: "id,name,settings",
      limit: 1,
    })}`
  ).then((r) => r?.data?.[0]);
  if (!org) throw new Error(`Org '${ORG_SLUG}' not found`);
  console.log(`✓ org ${org.name} (${org.id}), settings ${org.settings}`);

  // 2. Fix geo on block_settings.landing.
  const settings = await dx(`/items/block_settings/${org.settings}${qs({ fields: "id,landing" })}`).then(
    (r) => r?.data
  );
  const landing = { ...(settings?.landing || {}), geo: GEO };
  console.log(`   geo → ${JSON.stringify(GEO)} (was ${JSON.stringify(settings?.landing?.geo)})`);
  if (!DRY) {
    await dx(`/items/block_settings/${org.settings}`, {
      method: "PATCH",
      body: JSON.stringify({ landing }),
    });
  }

  // 3. Replace amenities.
  const existing = await dx(
    `/items/hoa_amenities${qs({
      filter: { organization: { _eq: org.id } },
      fields: "id,title",
      limit: 100,
    })}`
  ).then((r) => r?.data || []);
  console.log(`   existing amenities: ${existing.map((a: any) => a.title).join(", ") || "(none)"}`);
  if (existing.length && !DRY) {
    await dx(`/items/hoa_amenities`, {
      method: "DELETE",
      body: JSON.stringify(existing.map((a: any) => a.id)),
    });
  }
  for (const [i, a] of AMENITIES.entries()) {
    console.log(`   + ${a.title} (${a.icon})`);
    if (!DRY) {
      await dx(`/items/hoa_amenities`, {
        method: "POST",
        body: JSON.stringify({
          status: "published",
          sort: i + 1,
          organization: org.id,
          title: a.title,
          icon: a.icon,
          description: a.description,
        }),
      });
    }
  }

  console.log(`\n${DRY ? "Dry run complete — no writes." : "✓ Done."}\n`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
