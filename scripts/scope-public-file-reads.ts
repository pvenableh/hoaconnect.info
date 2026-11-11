/**
 * Narrow the Directus **public** read on `directus_files` to images, governing
 * files excepted (the contract is `PUBLIC_FILES_FILTER` in scripts/lib/public-files.ts).
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
 * GOVERNING FILES (2026-11-11)
 * ---------------------------
 * A governing document's page images (and an original that is an image) were
 * public too, and anonymous `/files` listed them. They now carry a description
 * starting `governing-` (core/shared/governing/files.ts), and the grant leaves
 * those out. Before narrowing, this marks every file a governing source or page
 * points at whose description is empty; one with other text is listed and left
 * alone. Marking comes first, so no moment widens anything.
 *
 * SUPPORT FILES AND FIELDS (2026-11-11, later)
 * --------------------------------------------
 * Support attachments (`support-…`) are left out the same way, and the grant's
 * fields are only `id`: anonymous `/files` had been listing every public image
 * of every community with its title, file name, folder and uploader. After
 * writing, an anonymous request for a public image (plain and resized) must
 * still answer 200, or the grant is put back as it was.
 *
 * Idempotent: a second run reports "already scoped" and writes nothing.
 */

import { GOVERNING_FILE_MARKER, isGoverningFileMarker } from "../core/shared/governing/files";
import { isPublicFile, PUBLIC_FILES_FIELDS, PUBLIC_FILES_FILTER } from "./lib/public-files";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const TARGET = { permissions: PUBLIC_FILES_FILTER, fields: PUBLIC_FILES_FIELDS };

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
      `/permissions?filter%5Bpolicy%5D%5B_eq%5D=${pub.id}&fields=id,collection,action,permissions,fields&limit=200`
    )
  ).data as { id: number; collection: string; action: string; permissions: unknown; fields: unknown }[];

  const grant = perms.find((p) => p.collection === "directus_files" && p.action === "read");
  if (!grant) {
    console.error(
      "❌ No public read on directus_files. It is expected to exist — anonymous\n" +
        "   landing images and already-sent email logos depend on it."
    );
    process.exit(1);
  }

  const governing = await markGoverningFiles();

  const previous = { permissions: grant.permissions, fields: grant.fields };
  const current = JSON.stringify(previous);
  const target = JSON.stringify(TARGET);
  console.log(`\npublic.directus_files.read (permission ${grant.id})`);
  console.log(`  current: ${current}`);
  console.log(`  target:  ${target}`);

  if (current === target) {
    console.log("\n✅ Already scoped — nothing to change in the grant.");
    await checkAnonymously(governing);
    return;
  }

  if (!APPLY) {
    await checkAnonymously(governing);
    console.log("\n(dry run) re-run with --apply to write this.");
    return;
  }

  // An image every sent email may point at, to prove it still serves afterwards.
  const witness = await publicWitness(governing);
  await df(`/permissions/${grant.id}`, { method: "PATCH", body: JSON.stringify(TARGET) });

  // Verify against the running server rather than trusting the 200, and verify
  // through /assets — the endpoint that actually matters — not just /files.
  const check = (await df(`/permissions/${grant.id}?fields=permissions,fields`)).data;
  if (JSON.stringify({ permissions: check.permissions, fields: check.fields }) !== target) {
    console.error("❌ Wrote, but the read-back does not match:", JSON.stringify(check));
    process.exit(1);
  }
  if (witness) {
    const plain = await anonymousStatus(witness);
    const resized = await anonymousStatus(witness, "?width=64");
    if (plain !== 200 || resized !== 200) {
      // Logos in sent emails depend on this: put the grant back as it was.
      await df(`/permissions/${grant.id}`, { method: "PATCH", body: JSON.stringify(previous) });
      console.error(`❌ A public image stopped serving (${plain}, resized ${resized}); the grant is back as it was.`);
      process.exit(1);
    }
    console.log(`\n✅ Scoped. A public image still serves anonymously: ${plain}, resized ${resized}.`);
  } else {
    console.log("\n✅ Scoped. (No public image to check against.)");
  }
  await checkAnonymously(governing);
}

async function anonymousStatus(id: string, query = "") {
  const r = await fetch(`${DIRECTUS_URL}/assets/${id}${query}`);
  await r.body?.cancel();
  return r.status;
}

/** A public image that is not governing and not a support file, if there is one. */
async function publicWitness(governing: string[]): Promise<string | null> {
  const filter = encodeURIComponent(JSON.stringify({ type: { _starts_with: "image/" } }));
  const images = (await df(`/files?limit=-1&fields=id,type,description&filter=${filter}`)).data as FileRow[];
  return images.find((f) => !governing.includes(f.id) && isPublicFile(f))?.id ?? null;
}

type FileRow = { id: string; type: string | null; description: string | null; title?: string | null };
const inList = (ids: string[]) => encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
const byType = (list: FileRow[]) =>
  Object.entries(list.reduce<Record<string, number>>((n, f) => ((n[f.type ?? "?"] = (n[f.type ?? "?"] ?? 0) + 1), n), {}))
    .map(([type, n]) => `${n} ${type}`)
    .join(", ");

/**
 * Mark every file a governing source or page points at whose description is
 * empty. Returns the ids of all governing files, for the anonymous check.
 */
async function markGoverningFiles(): Promise<string[]> {
  let ids: string[];
  try {
    const sources = (await df("/items/hoa_governing_sources?limit=-1&fields=file")).data as { file: string | null }[];
    const pages = (await df("/items/hoa_governing_pages?limit=-1&fields=image")).data as { image: string | null }[];
    ids = [...new Set([...sources.map((s) => s.file), ...pages.map((p) => p.image)].filter((id): id is string => !!id))];
  } catch {
    console.log("\nGoverning files: not in this deployment, nothing to mark.");
    return [];
  }
  const files = ids.length
    ? ((await df(`/files?limit=-1&fields=id,type,description&filter=${inList(ids)}`)).data as FileRow[])
    : [];
  const blank = files.filter((f) => !f.description);
  const other = files.filter((f) => f.description && !isGoverningFileMarker(f.description));
  console.log(`\nGoverning files (originals and page images): ${files.length}${files.length ? ` (${byType(files)})` : ""}`);
  console.log(`  already marked: ${files.length - blank.length - other.length}`);
  console.log(`  to mark "${GOVERNING_FILE_MARKER}": ${blank.length}${blank.length ? ` (${byType(blank)})` : ""}`);
  for (const f of other) console.log(`  ! ${f.id} has a description of its own; left alone${isPublicFile(f) ? ", and still public" : ""}`);

  const images = (await df(`/files?limit=-1&fields=id,type,description&filter=${encodeURIComponent(JSON.stringify({ type: { _starts_with: "image/" } }))}`))
    .data as FileRow[];
  const toMark = new Set(blank.map((f) => f.id));
  const publicAfter = images.filter((f) => isPublicFile(toMark.has(f.id) ? { ...f, description: GOVERNING_FILE_MARKER } : f));
  console.log(
    `  images: ${images.length}; public once marked and scoped: ${publicAfter.length}, governing among them: ${publicAfter.filter((f) => ids.includes(f.id)).length}, ` +
      `support files left out: ${images.filter((f) => (f.description ?? "").startsWith("support-")).length}`
  );

  if (!APPLY || !blank.length) return ids;
  await df("/files", { method: "PATCH", body: JSON.stringify({ keys: [...toMark], data: { description: GOVERNING_FILE_MARKER } }) });
  const back = (await df(`/files?limit=-1&fields=id,description&filter=${inList([...toMark])}`)).data as FileRow[];
  const missed = back.filter((f) => f.description !== GOVERNING_FILE_MARKER);
  if (missed.length !== 0 || back.length !== toMark.size) {
    console.error(`❌ Marked, but the read-back shows ${missed.length} without the mark`);
    process.exit(1);
  }
  console.log(`  ✅ marked ${back.length}`);
  return ids;
}

/** What someone with no session gets, from the endpoints that matter. Reads only. */
async function checkAnonymously(governing: string[]) {
  const filter = encodeURIComponent(JSON.stringify({ type: { _starts_with: "image/" } }));
  // No filter of our own: once the grant is id-only, filtering on `type` is refused.
  const res = await fetch(`${DIRECTUS_URL}/files?limit=-1&fields=*`);
  const rows = res.ok ? ((((await res.json()) as { data: Record<string, unknown>[] }).data ?? []) as Record<string, unknown>[]) : [];
  const listed = rows.map((f) => String(f.id));
  const support = (await df(`/files?limit=-1&fields=id&filter=${encodeURIComponent(JSON.stringify({ description: { _starts_with: "support-" } }))}`)).data as FileRow[];
  console.log(
    `\nAnonymous: /files lists ${listed.length} file(s) (${res.status}); governing among them: ${listed.filter((id) => governing.includes(id)).length}, ` +
      `support files: ${listed.filter((id) => support.some((f) => f.id === id)).length}; fields on a row: ${rows[0] ? Object.keys(rows[0]).join(",") : "none"}`
  );
  const status = async (id: string) => {
    const r = await fetch(`${DIRECTUS_URL}/assets/${id}`);
    await r.body?.cancel();
    return r.status;
  };
  const images = (await df(`/files?limit=-1&fields=id,type&filter=${filter}`)).data as FileRow[];
  const governingImage = images.find((f) => governing.includes(f.id));
  const otherImage = images.find((f) => !governing.includes(f.id) && listed.includes(f.id));
  if (governingImage) console.log(`  /assets of a governing image: ${await status(governingImage.id)} (403 once scoped)`);
  if (otherImage) console.log(`  /assets of another image:     ${await status(otherImage.id)} (stays 200)`);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
