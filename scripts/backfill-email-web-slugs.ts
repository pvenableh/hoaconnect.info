/**
 * Backfill `hoa_emails.web_slug` so public email URLs read as words, not uuids.
 *
 * The public route takes `web_slug-or-id`, so this is cosmetic and never breaks
 * an existing link: rows that already have a slug are left alone, and the id
 * keeps working afterwards. 1033 Lenox's 106 migrated emails all landed with a
 * null slug, which is what prompted this.
 *
 *   pnpm run backfill:email-slugs                    # dry run, prints the plan
 *   pnpm run backfill:email-slugs -- --apply         # write
 *   pnpm run backfill:email-slugs -- --org <uuid>    # limit to one org
 *
 * Slugs are unique PER ORG, not globally — two associations may both send a
 * "Pool Closure" notice. Uniqueness is seeded from the slugs an org already
 * holds, so a re-run is idempotent.
 */

import { buildUniqueWebSlug } from "../core/server/utils/email-branding";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const ORG_ARG = process.argv.indexOf("--org");
const ONLY_ORG = ORG_ARG !== -1 ? process.argv[ORG_ARG + 1] : null;

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${endpoint}`);
  return res.status === 204 ? null : res.json();
}

interface EmailRow {
  id: string;
  subject: string | null;
  web_slug: string | null;
  organization: string | null;
  date_created: string | null;
}

async function main() {
  const orgs = (await df("/items/hoa_organizations?fields=id,slug,name&limit=200")).data as {
    id: string;
    slug: string;
    name: string;
  }[];

  let totalPlanned = 0;
  let totalWritten = 0;

  for (const org of orgs) {
    if (ONLY_ORG && org.id !== ONLY_ORG) continue;

    const emails = (await df(
      `/items/hoa_emails?filter%5Borganization%5D%5B_eq%5D=${org.id}` +
        `&fields=id,subject,web_slug,organization,date_created&sort=date_created,id&limit=-1`
    )).data as EmailRow[];
    if (!emails.length) continue;

    // Seed uniqueness from what this org already holds, so re-runs are stable.
    const taken = new Set(emails.map((e) => e.web_slug).filter((s): s is string => !!s));
    const needed = emails.filter((e) => !e.web_slug);

    console.log(
      `\n${org.name} (${org.slug}) — ${emails.length} email(s), ${taken.size} slugged, ${needed.length} to fill`
    );
    if (!needed.length) continue;

    for (const email of needed) {
      const slug = buildUniqueWebSlug(email.subject || "", taken);
      taken.add(slug);
      totalPlanned++;
      const label = `  ${email.id.slice(0, 8)}  ${JSON.stringify(email.subject || "").slice(0, 46).padEnd(48)} -> ${slug}`;
      if (!APPLY) {
        console.log(label);
        continue;
      }
      await df(`/items/hoa_emails/${email.id}`, {
        method: "PATCH",
        body: JSON.stringify({ web_slug: slug }),
      });
      totalWritten++;
      console.log(`${label}  ✓`);
    }
  }

  console.log("");
  if (APPLY) console.log(`✅ Wrote ${totalWritten} web_slug value(s)`);
  else console.log(`Dry run — ${totalPlanned} row(s) would be updated. Re-run with --apply to write.`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
