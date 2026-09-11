/**
 * Seed the demo org (slug `demo`) with units, member↔unit links and one dues
 * schedule so the billing worker has something to generate. Idempotent: skips
 * when the org already has units. Run: pnpm exec dotenv -- tsx scripts/seed-demo-billing.ts
 */
import { createDirectus, rest, staticToken, readItems, createItem } from "@directus/sdk";

const d = createDirectus(process.env.DIRECTUS_URL!).with(staticToken(process.env.DIRECTUS_STATIC_TOKEN!)).with(rest());
const q = (c: string, query: any) => d.request(readItems(c as any, { limit: -1, ...query })) as Promise<any[]>;
const add = (c: string, data: any) => d.request(createItem(c as any, data)) as Promise<any>;

async function main() {
  const [org] = await q("hoa_organizations", { filter: { slug: { _eq: "demo" } }, fields: ["id", "slug"] });
  if (!org) throw new Error("demo org not found");
  const existing = await q("hoa_units", { filter: { organization: { _eq: org.id } }, fields: ["id"] });
  if (existing.length) {
    console.log(`demo already has ${existing.length} units — nothing to do`);
    return;
  }
  const members = await q("hoa_members", { filter: { organization: { _eq: org.id } }, fields: ["id", "first_name", "last_name"] });
  const byName = (first: string) => members.find((m) => m.first_name === first)?.id;
  const ava = byName("Ava"), marcus = byName("Marcus"), priya = byName("Priya"), sofia = byName("Sofia"), daniel = byName("Daniel");
  if (!ava || !marcus || !priya || !sofia || !daniel) throw new Error(`missing demo members: ${JSON.stringify(members)}`);

  const unit = async (n: string, occupancy: string) => (await add("hoa_units", { organization: org.id, unit_number: n, status: "active", occupancy })).id;
  const u101 = await unit("101", "tenant");
  const u102 = await unit("102", "owner");
  const u201 = await unit("201", "owner");
  const u202 = await unit("202", "owner");

  const link = (member_id: string, unit_id: string, extra: any = {}) =>
    add("hoa_member_units", { status: "published", member_id, unit_id, is_primary_unit: true, start_date: "2025-01-01", ...extra });
  await link(ava, u101, { member_type: "owner", ownership_percentage: 100 });
  await link(daniel, u101, { member_type: "tenant" });
  await link(marcus, u102, { member_type: "owner", ownership_percentage: 100 });
  await link(priya, u201, { member_type: "owner", ownership_percentage: 60 });
  await link(sofia, u201, { member_type: "owner", ownership_percentage: 40, is_primary_unit: false });
  await link(sofia, u202, { member_type: "owner", ownership_percentage: 100 });

  const s = await add("payment_schedules", {
    status: "active",
    organization: org.id,
    title: "Monthly dues",
    amount: 250,
    frequency: "monthly",
    cadence: "monthly",
    amount_source: "ownership_pct",
    audience: { all: true },
    generate_days_ahead: 14,
    start_date: "2026-09-01",
    next_payment_date: "2026-09-01",
  });
  console.log(`seeded demo: 4 units, 6 links, schedule ${s.id}`);
}
main().catch((e) => { console.error(e?.errors ?? e); process.exit(1); });
