/**
 * Backfill hoa_organizations.member_count from the actual number of active
 * members. The field is denormalized and had no trigger keeping it current, so
 * counts were stale/null. Going forward the app recomputes it on member
 * create/delete/status (server/utils/member-count.ts); this one-time pass fixes
 * existing data.
 *
 * Idempotent. Run with: pnpm run recompute:member-counts
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
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

async function main(): Promise<void> {
  console.log("🔢 Recomputing member_count for all organizations...\n");
  const orgs = (await df(`/items/hoa_organizations?fields=id,slug,member_count&limit=-1`))?.data || [];
  let updated = 0;
  for (const org of orgs) {
    const agg = await df(
      `/items/hoa_members?aggregate[count]=*&filter[organization][_eq]=${org.id}&filter[status][_eq]=active`
    );
    const count = Number(agg?.data?.[0]?.count ?? 0) || 0;
    if (count !== (org.member_count ?? 0)) {
      await df(`/items/hoa_organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ member_count: count }),
      });
      console.log(`   ✅ ${org.slug || org.id}: ${org.member_count ?? "null"} → ${count}`);
      updated++;
    } else {
      console.log(`   ⏭️  ${org.slug || org.id}: ${count} (unchanged)`);
    }
  }
  console.log(`\nDone. Updated ${updated}/${orgs.length} organizations.`);
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
