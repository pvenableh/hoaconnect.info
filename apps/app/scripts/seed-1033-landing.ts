/**
 * Seed 1033 Lenox as an HOA Connect tenant with a landing page that mirrors the
 * bespoke 1033lenox.com index page, using the dynamic block system
 * (block_settings.landing.blocks).
 *
 * Idempotent — safe to re-run:
 *  - images: imported from admin.1033lenox.com by URL, deduped by tag `1033:<srcId>`
 *  - org / hero / settings / admin membership: upserted on natural keys
 *  - blocks: the landing config is rewritten each run (source of truth = this file)
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Run:    pnpm run seed:1033-landing          (writes)
 *         pnpm run seed:1033-landing -- --dry  (no writes; reports)
 */

const URL_BASE = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!URL_BASE || !TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const SRC_ASSETS = "https://admin.1033lenox.com/assets";

// Peter (peter@huestudios.com) + HOA Admin role (org-level admin).
const PETER_USER_ID = "58968fbb-5a20-4142-b1a7-9b2730300fea";
const HOA_ADMIN_ROLE = "38494e81-9b49-4c64-a197-fcb8097cd433";
// 1033 logo already present in HOA Connect Directus (white, for the dark hero).
const LOGO_FILE_ID = "ee3f6b8e-af07-4d37-af65-ae7aa2d72807";

const ORG_SLUG = "1033-lenox";
const ORG_NAME = "1033 Lenox";

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

async function findOne(collection: string, filter: any, fields = "id"): Promise<any | null> {
  const res = await dx(`/items/${collection}${qs({ filter, fields, limit: 1 })}`);
  return res?.data?.[0] ?? null;
}

// ── Image import (deduped by tag 1033:<srcId>) ──────────────────────────────
async function importImage(srcId: string, label: string): Promise<string> {
  // Dedup key lives in the (string) title so re-runs reuse the same file.
  const title = `1033:${srcId}`;
  const existing = await dx(`/files${qs({ filter: { title: { _eq: title } }, fields: "id", limit: 1 })}`);
  if (existing?.data?.[0]?.id) {
    console.log(`   ↻ reuse ${srcId} → ${existing.data[0].id} (${label})`);
    return existing.data[0].id;
  }
  if (DRY) {
    console.log(`   + would import image ${srcId} (${label})`);
    return `dry-${srcId}`;
  }
  const res = await dx(`/files/import`, {
    method: "POST",
    body: JSON.stringify({
      url: `${SRC_ASSETS}/${srcId}?key=xlarge`,
      data: { title, tags: ["1033-import"] },
    }),
  });
  const id = res?.data?.id;
  console.log(`   + imported ${srcId} → ${id} (${label})`);
  return id;
}

// ── Source image ids (admin.1033lenox.com) ─────────────────────────────────
const IMG = {
  heroBg: "42b3290e-063e-4412-bf1c-a083498d1887",
  introCourtyard: "e5733a3c-3572-40f3-8142-5bc0bc1d11f2",
  introBalcony: "96694a83-b515-429c-83f5-98ed197f79de",
  philosophy: "d4c23c5a-f15f-4d76-9afc-4cddd20eecca",
  location: "41765099-b2fa-4ddd-abe7-8f328f43e085",
  galBeach: "2713f5c4-2799-41b5-bf4c-fac49c1e002c",
  galPark: "5a4cdbe6-01e9-4aff-b4ef-fb109012ce95",
  galLincoln: "ac56a2bd-27ca-4621-a262-2685fca8b88f",
  galBay: "29f0d3b2-9120-4db8-877f-8406b26cb43e",
  galWholeFoods: "fcefe508-24ed-45c7-92ed-9d3fae9f9d75",
  galOceanDrive: "4278842d-e6ac-4ab2-b5fa-d4706632c0bc",
  designExterior: "09f44cd5-f438-4d71-a546-7541c5fdad99",
  designInterior: "a1a81a1b-cc26-46cf-a09b-c58438498731",
  security: "6f5f0c1f-1b7f-45ea-9f79-f4c763a7bbbd",
  amenities: "59989d04-a7ec-4621-9f83-6343a6d42057",
};

const bullets = (lines: string[]) => lines.map((l) => `• ${l}`).join("\n");

async function main() {
  console.log(`🌴 Seeding 1033 Lenox landing ${DRY ? "(DRY RUN)" : ""} → ${URL_BASE}`);

  // 1) Images ----------------------------------------------------------------
  console.log("\n🖼  Images…");
  const f: Record<keyof typeof IMG, string> = {} as any;
  for (const [k, srcId] of Object.entries(IMG)) {
    f[k as keyof typeof IMG] = await importImage(srcId, k);
  }

  // 2) Hero ------------------------------------------------------------------
  console.log("\n🎬 Hero…");
  let heroId = (await findOne("block_hero", { title: { _eq: ORG_NAME } }))?.id || null;
  const heroData = {
    title: ORG_NAME,
    subtitle: "The Smart Life in South Beach",
    background_image: f.heroBg,
    foreground_image: LOGO_FILE_ID,
  };
  if (!DRY) {
    if (heroId) await dx(`/items/block_hero/${heroId}`, { method: "PATCH", body: JSON.stringify(heroData) });
    else heroId = (await dx(`/items/block_hero`, { method: "POST", body: JSON.stringify(heroData) }))?.data?.id;
  }
  console.log(`   ${heroId ? "✓" : "+"} hero ${heroId || "(dry)"}`);

  // 3) Landing blocks --------------------------------------------------------
  const img = (id: string, caption_title?: string, caption_body?: string, fit: "cover" | "contain" = "cover") => ({
    file: id,
    caption_title,
    caption_body,
    fit,
  });
  const blocks: any[] = [
    {
      id: "c_intro", type: "content", enabled: true, layout: "image-grid",
      title: "Boutique Living",
      body: "1033 Lenox is a 28-unit boutique residence in the heart of Miami Beach's Flamingo Park neighborhood. One-bedrooms only. Oversized balconies. No crowded hallways, no lobby lines — just smart, private living for those who know the difference.",
      images: [
        img(f.introCourtyard, "Courtyard View", "Central courtyard with mature palm trees, dappled sunlight, and open-air breezeways. Intimate community feel."),
        img(f.introBalcony, "Balcony Lifestyle", "5' x 20' balcony for outdoor furniture, plants, and morning coffee. Generous depth and livable outdoor space.", "contain"),
      ],
    },
    {
      id: "c_philosophy", type: "content", enabled: true, layout: "text-image",
      number_label: "01", category: "Philosophy", title: "The Anti-High-Rise",
      body: "Skip the elevator lines, the endless hallways, and the anonymous lobby. 1033 Lenox offers what the towers can't — an intimate, design-forward residence in the heart of South Beach where you actually know your neighbors.",
      tagline: "Boutique scale. Big beach lifestyle.",
      images: [img(f.philosophy, "Immediate Access to Air", "Open-air breezeway, bright white against clear blue sky. Light, air, and simplicity.", "contain")],
    },
    {
      id: "c_location", type: "content", enabled: true, layout: "text-image",
      number_label: "02", category: "Location", title: "Coveted Location",
      body: "Nestled on a tree-lined street in one of South Beach's most desirable residential pockets — walkable to everything, removed from nothing.",
      images: [img(f.location, "Neighborhood Meets Beach", "Historic neighborhood charm meets coastal living. Tree-lined residential streets just blocks from the beach, bay, Lincoln Road and Ocean Drive.")],
    },
    {
      id: "c_walk", type: "content", enabled: true, layout: "stats",
      title: "Everything, Minutes Away",
      stats: [
        { value: "6", unit: "min", label: "to the Ocean" },
        { value: "2", unit: "min", label: "to the Bay" },
        { value: "1", unit: "min", label: "to Whole Foods" },
        { value: "1", unit: "min", label: "to Flamingo Park" },
        { value: "7", unit: "min", label: "to Lincoln Road" },
        { value: "5", unit: "min", label: "to Ocean Drive" },
      ],
    },
    {
      id: "c_gallery", type: "content", enabled: true, layout: "gallery",
      eyebrow: "The Flamingo Park Lifestyle", title: "Active Living, Steps Away",
      tagline: "Leave the car. Live the neighborhood.",
      images: [
        img(f.galBeach, "Beach Morning", "Sunrise run on the sand"),
        img(f.galPark, "Flamingo Park", "Tennis, track, outdoor gyms"),
        img(f.galLincoln, "Lincoln Road", "Weekend brunch & shopping"),
        img(f.galBay, "Bay Sunset", "Evening walks on the bay"),
        img(f.galWholeFoods, "Whole Foods", "Daily groceries, 1 block"),
        img(f.galOceanDrive, "Ocean Drive", "Restaurants & nightlife"),
      ],
    },
    {
      id: "c_design", type: "content", enabled: true, layout: "image-grid",
      number_label: "03", category: "Design", title: "Thoughtfully Designed",
      body: bullets([
        "28 residences — an exclusive, owner-focused community",
        "Spacious 1BR / 1–2 BA floorplans",
        "Expansive private balconies with modern black steel railings",
        "Open-air breezeways framed by crisp white stucco and blue sky",
        "Subtropical modernist design with a Mediterranean sensibility — clean lines, courtyard-centered layout, light, air, and community",
      ]),
      tagline: "Boutique scale. Architectural edge.",
      images: [img(f.designExterior), img(f.designInterior)],
    },
    {
      id: "c_turnkey", type: "content", enabled: true, layout: "image-grid",
      number_label: "04", category: "Investment", eyebrow: "Fully Renovated — Turnkey", title: "All New",
      body:
        "40-year recertification complete. No looming assessments. No deferred maintenance. Just move in.\n\nRecent capital improvements:\n" +
        bullets([
          "Complete concrete restoration",
          "Complete electrical infrastructure",
          "Hurricane-impact windows & doors",
          "New roof",
          "New elevator cab",
          "Modern railings & exterior finishes",
          "New garage and asphalt",
          "New security systems",
          "New access control",
          "New laundry facilities",
          "New gates (early 2026)",
        ]),
      tagline: "This is rare: a boutique SoBe building with the hard work behind it.",
      images: [],
    },
    {
      id: "c_security", type: "content", enabled: true, layout: "text-image",
      number_label: "05", category: "Security", title: "Secure & Connected",
      body: bullets([
        "Facial recognition entry system",
        "Building-wide camera coverage including the elevator",
        "Well-lit walkways and a secured garage",
        "Doorbell cameras on 98% of residences",
        "Owner/resident portal for real-time documents, financials, and communications",
      ]),
      tagline: "Peace of mind, built in.",
      images: [img(f.security, "Entry System", "Sleek Swiftlane facial-recognition entry panel at the main gate. Modern, unobtrusive, and secure.")],
    },
    {
      id: "c_value", type: "content", enabled: true, layout: "image-grid",
      number_label: "06", category: "Value", title: "Smart Investment",
      body: bullets([
        "Competitively priced insurance",
        "Flood insurance coverage",
        "Fully hurricane-certified",
        "Reasonably priced HOA for Miami Beach",
        "Transparent financials via the owner portal",
      ]),
      tagline: "The numbers make sense. So does the lifestyle.",
      images: [],
    },
    {
      id: "c_amenities", type: "content", enabled: true, layout: "text-image",
      number_label: "07", category: "Amenities", title: "Amenities With Intention",
      body: bullets([
        "Sunlit central courtyard with palm trees",
        "Upgraded elevator",
        "Clubhouse",
        "On-site laundry",
        "Storage room",
        "Bike rack",
        "Deeded garage parking (1 space per residence)",
        "Beautiful front yards",
      ]),
      tagline: "Everything you need. Nothing you don't.",
      images: [img(f.amenities, "Courtyard & Grounds", "Sunlit central courtyard with palm trees, an upgraded elevator, and plenty of outdoor space.")],
    },
    {
      id: "c_community", type: "content", enabled: true, layout: "image-grid",
      number_label: "08", category: "Community", title: "Shape What's Next",
      body:
        "Our shared spaces are ready for reimagining. For the right residents — those with vision, expertise, and the desire to leave their mark — this is an opportunity to help craft something exceptional.\n\n" +
        bullets([
          "The Clubhouse — a blank canvas: envision a modern fitness studio paired with a focused co-working space.",
          "Storage Evolution — climate-controlled personal storage with premium lockers.",
          "Adventure Room — secure storage for bikes, paddle boards, and beach gear.",
          "Courtyard Revival — curated seating, lush vegetation, and perhaps a fountain.",
        ]),
      tagline: "The canvas is ready. The community awaits.",
      images: [],
    },
    { id: "b_faq", type: "faq", enabled: true },
    { id: "b_contact", type: "contact", enabled: true },
  ];

  const faq = [
    { question: "How many units are in the building?", answer: "1033 Lenox is a boutique 28-unit condominium. All residences are one-bedroom apartments with oversized balconies." },
    { question: "Is parking included?", answer: "Yes. Every residence comes with one deeded garage parking space in the secured parking garage." },
    { question: "Are pets allowed at 1033 Lenox?", answer: "Yes, 1033 Lenox is pet-friendly. One approved pet is allowed per residence." },
    { question: "Has the building passed its 40-year recertification?", answer: "Almost — the 40-year recertification is nearly complete with no pending assessments or deferred maintenance. The building is turnkey-ready." },
    { question: "What security features does the building have?", answer: "Facial-recognition entry via Swiftlane, building-wide camera coverage including the elevator, secured and well-lit walkways, and doorbell cameras on 98% of residences." },
    { question: "How far is 1033 Lenox from the beach?", answer: "A 6-minute walk to the ocean and a 2-minute walk to the bay. Whole Foods is one block away, and Flamingo Park is one block in the other direction." },
    { question: "Is the building hurricane certified?", answer: "Yes. 1033 Lenox is fully hurricane-certified with impact windows and doors throughout every unit and in all common areas." },
    { question: "What renovations have been completed?", answer: "Complete concrete restoration, full electrical infrastructure upgrade, hurricane-impact windows and doors, new roof, new elevator cab, modern railings, new garage and asphalt, new security systems, new access control, and new laundry facilities." },
  ];

  const landing = {
    widgets: [
      { key: "greeting", enabled: true },
      { key: "weather", enabled: true },
      { key: "location", enabled: true },
      { key: "building", enabled: true },
      { key: "board", enabled: false },
      { key: "amenities", enabled: false },
    ],
    places: {
      neighborhood: "Flamingo Park",
      walk_score: 95,
      bike_score: 90,
      items: [
        { name: "The Ocean", walk_time: "6 min" },
        { name: "The Bay", walk_time: "2 min" },
        { name: "Whole Foods", walk_time: "1 min" },
        { name: "Flamingo Park", walk_time: "1 min" },
        { name: "Lincoln Road", walk_time: "7 min" },
        { name: "Ocean Drive", walk_time: "5 min" },
      ],
    },
    listings: [],
    faq,
    blocks,
    inquiry: { enabled: true, recipient_type: "email", email: null, user: null },
    geo: { lat: 25.7826, lon: -80.1341 },
    show_announcements: false,
  };

  // 4) Settings --------------------------------------------------------------
  console.log("\n⚙️  Settings…");
  // block_settings is referenced FROM the org; reuse the org's settings if it exists.
  const existingOrg = await findOne("hoa_organizations", { slug: { _eq: ORG_SLUG } }, "id,settings,hero");
  let settingsId = existingOrg?.settings || null;
  const settingsData = {
    theme: "classic",
    description:
      "1033 Lenox is a 28-unit boutique residence in the heart of Miami Beach's Flamingo Park neighborhood — smart, private living steps from the ocean, the bay, and Lincoln Road.",
    logo: LOGO_FILE_ID,
    landing,
  };
  if (!DRY) {
    if (settingsId) await dx(`/items/block_settings/${settingsId}`, { method: "PATCH", body: JSON.stringify(settingsData) });
    else settingsId = (await dx(`/items/block_settings`, { method: "POST", body: JSON.stringify(settingsData) }))?.data?.id;
  }
  console.log(`   ${settingsId ? "✓" : "+"} settings ${settingsId || "(dry)"} — ${blocks.length} blocks, ${faq.length} FAQs`);

  // 5) Organization ----------------------------------------------------------
  console.log("\n🏢 Organization…");
  const orgData: any = {
    name: ORG_NAME,
    slug: ORG_SLUG,
    legal_name: "1033 Lenox Condominium Association, Inc.",
    type: "residential",
    street_address: "1033 Lenox Ave",
    city: "Miami Beach",
    state: "FL",
    zip: "33139",
    status: "active",
    is_free_account: true,
    show_board: false,
    settings: settingsId,
    hero: heroId,
  };
  let orgId = existingOrg?.id || null;
  if (!DRY) {
    if (orgId) await dx(`/items/hoa_organizations/${orgId}`, { method: "PATCH", body: JSON.stringify(orgData) });
    else orgId = (await dx(`/items/hoa_organizations`, { method: "POST", body: JSON.stringify(orgData) }))?.data?.id;
  }
  console.log(`   ${orgId ? "✓" : "+"} org ${orgId || "(dry)"} — /${ORG_SLUG}`);

  // 6) Admin membership (Peter) ---------------------------------------------
  console.log("\n👤 Admin membership…");
  if (!DRY && orgId) {
    const existingMember = await findOne("hoa_members", {
      _and: [{ user: { _eq: PETER_USER_ID } }, { organization: { _eq: orgId } }],
    });
    const memberData = {
      user: PETER_USER_ID,
      organization: orgId,
      role: HOA_ADMIN_ROLE,
      member_type: "owner",
      status: "active",
      first_name: "Peter",
      last_name: "Hoffman",
      email: "peter@huestudios.com",
    };
    if (existingMember) {
      await dx(`/items/hoa_members/${existingMember.id}`, { method: "PATCH", body: JSON.stringify(memberData) });
      console.log(`   ✓ Peter already admin (${existingMember.id})`);
    } else {
      const m = await dx(`/items/hoa_members`, { method: "POST", body: JSON.stringify(memberData) });
      console.log(`   + Peter added as HOA Admin (${m?.data?.id})`);
    }
  } else {
    console.log("   (dry) would upsert Peter as HOA Admin");
  }

  console.log(`\n✅ Done. Visit /${ORG_SLUG} (classic theme).`);
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
