/**
 * Clears the responsibilities register out of a DEMO community, for the
 * sessions that seed it to look at the register's pages (docs/plan-role-first-ux.md
 * §7, Sessions 7 and 9). Refuses any community whose `is_demo` is not true, so
 * it cannot touch a real one.
 *
 * Deletes, in that community only: its jobs (their holder rows and file links
 * cascade), its board terms, and the activity rows the register wrote
 * (`event_type` responsibility or board_term); turns both publishing switches
 * off. Reports the counts first; deletes only with --apply.
 *
 *   pnpm exec dotenv -- tsx scripts/clean-demo-responsibilities.ts demo            # report
 *   pnpm exec dotenv -- tsx scripts/clean-demo-responsibilities.ts demo --apply    # delete
 *
 * Requires DIRECTUS_URL and DIRECTUS_STATIC_TOKEN (admin token).
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");

if (!DIRECTUS_URL || !TOKEN) throw new Error("DIRECTUS_URL and DIRECTUS_STATIC_TOKEN are required.");
if (!slug) throw new Error("Name the demo community's slug, e.g. `demo`.");

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as { data: T }).data;
}

const q = (o: Record<string, unknown>) => `filter=${encodeURIComponent(JSON.stringify(o))}`;
const ids = async (collection: string, filter: Record<string, unknown>) =>
  (await api<{ id: string }[]>(`/items/${collection}?${q(filter)}&fields=id&limit=-1`)).map((r) => r.id);

async function main() {
  const [org] = await api<{ id: string; name: string; is_demo: boolean }[]>(
    `/items/hoa_organizations?${q({ slug: { _eq: slug } })}&fields=id,name,is_demo&limit=1`,
  );
  if (!org) throw new Error(`No community with slug "${slug}".`);
  if (org.is_demo !== true) throw new Error(`${org.name} is not a demo community (is_demo is not true). Nothing done.`);

  const jobs = await ids("hoa_responsibilities", { organization: { _eq: org.id } });
  const holders = await ids("hoa_responsibility_assignees", { organization: { _eq: org.id } });
  // A term belongs to a community through its member.
  const terms = await ids("hoa_board_members", { hoa_member: { organization: { _eq: org.id } } });
  const activity = await ids("hoa_activity", { organization: { _eq: org.id }, event_type: { _in: ["responsibility", "board_term"] } });

  console.log(`${org.name} (is_demo): ${jobs.length} jobs, ${holders.length} holder rows, ${terms.length} board terms, ${activity.length} activity rows.`);
  if (!APPLY) {
    console.log("Report only. Run again with --apply to delete them and turn both publishing switches off.");
    return;
  }

  const del = async (collection: string, list: string[]) => {
    for (let i = 0; i < list.length; i += 100) {
      await api(`/items/${collection}`, { method: "DELETE", body: JSON.stringify(list.slice(i, i + 100)) });
    }
  };
  await del("hoa_responsibility_assignees", holders);
  await del("hoa_responsibilities", jobs);
  await del("hoa_board_members", terms);
  await del("hoa_activity", activity);
  await api(`/items/hoa_organizations/${org.id}`, {
    method: "PATCH",
    body: JSON.stringify({ responsibilities_published: false, responsibilities_show_unassigned: false }),
  });
  console.log("Deleted. Both publishing switches are off.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
