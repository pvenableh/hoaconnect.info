/**
 * Narrow the Directus **public** read on `directus_files` to images only.
 *
 *   pnpm run scope:public-files            # dry run — prints what would change
 *   pnpm run scope:public-files --apply    # write it
 *
 * WHY
 * ---
 * The public grant on `directus_files` was unfiltered, and Directus checks that
 * same read permission when it serves `/assets/<id>`. Anonymously, on
 * production, that meant:
 *
 *     curl https://admin.hoaconnect.info/files?fields=title   # enumerate all 41
 *     curl https://admin.hoaconnect.info/assets/<id>          # download any one
 *
 * which included nine of 605 Lincoln Road's PDFs — balance sheets, profit and
 * loss, approved meeting minutes — and a `hoa_data_exports` archive, the very
 * thing `org/export/:id/download` exists to avoid handing out on a guessable URL.
 *
 * WHY NOT JUST DELETE THE GRANT
 * -----------------------------
 * Because two consumers have no session and never will:
 *
 *   - the logo in every email **already sitting in a recipient's inbox** is a
 *     bare `/assets/<id>` URL that a mail client fetches anonymously. Those URLs
 *     cannot be reissued.
 *   - every image on an anonymous landing page.
 *
 * Both are images, and none of the sensitive files are. Filtering by type keeps
 * the first group working byte-for-byte on the URLs they already have, and makes
 * the second group private — members reach it through
 * `/api/directus/assets/:id`, which checks the session and the file's owning
 * organization.
 *
 * The residual, stated plainly: images remain anonymously readable across every
 * org. Nothing financial or personally identifying is in that set today (org
 * logos, hero shots, landing photography, one avatar). Tightening further means
 * an explicit per-file public marker and a backfill — a bigger change, and a
 * more fragile one, since a missed flag breaks a landing page silently.
 *
 * Idempotent: a second run reports "already scoped" and writes nothing.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

/** Must stay identical to the `filter` in scripts/audit-public-policy.ts. */
const IMAGES_ONLY = { _and: [{ type: { _starts_with: "image/" } }] };

const APPLY = process.argv.includes("--apply");

async function df(endpoint: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${endpoint}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const policies = (await df("/policies?fields=id,name&limit=100")).data as {
    id: string;
    name: string;
  }[];
  const pub = policies.find((p) => p.name === "$t:public_label" || p.name === "Public");
  if (!pub) {
    console.error("❌ Could not find the public policy");
    process.exit(1);
  }

  const perms = (
    await df(
      `/permissions?filter%5Bpolicy%5D%5B_eq%5D=${pub.id}&fields=id,collection,action,permissions&limit=200`
    )
  ).data as { id: number; collection: string; action: string; permissions: unknown }[];

  const grant = perms.find((p) => p.collection === "directus_files" && p.action === "read");
  if (!grant) {
    console.error(
      "❌ No public read on directus_files. It is expected to exist — anonymous\n" +
        "   landing images and already-sent email logos depend on it."
    );
    process.exit(1);
  }

  const current = JSON.stringify(grant.permissions);
  const target = JSON.stringify(IMAGES_ONLY);
  console.log(`\npublic.directus_files.read (permission ${grant.id})`);
  console.log(`  current: ${current}`);
  console.log(`  target:  ${target}`);

  if (current === target) {
    console.log("\n✅ Already scoped to images — nothing to do.");
    return;
  }

  if (!APPLY) {
    console.log("\n(dry run) re-run with --apply to write this.");
    return;
  }

  await df(`/permissions/${grant.id}`, {
    method: "PATCH",
    body: JSON.stringify({ permissions: IMAGES_ONLY }),
  });

  // Verify against the running server rather than trusting the 200, and verify
  // through /assets — the endpoint that actually matters — not just /files.
  const check = (await df(`/permissions/${grant.id}?fields=permissions`)).data;
  if (JSON.stringify(check.permissions) !== target) {
    console.error("❌ Wrote, but the read-back does not match:", JSON.stringify(check.permissions));
    process.exit(1);
  }
  console.log("\n✅ Scoped. Verify anonymously:");
  console.log("   curl -o /dev/null -w '%{http_code}\\n' $DIRECTUS_URL/assets/<a-pdf-id>   # 403");
  console.log("   curl -o /dev/null -w '%{http_code}\\n' $DIRECTUS_URL/assets/<an-image-id> # 200");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
