/**
 * One-off repair for the first 1033 Lenox import (2026-11-10).
 *
 * The import split `760.29(4) (fair housing; not ch. 718)` on the semicolon
 * inside its parentheses and stored two references that are not citations:
 * `760.29(4) (fair housing` and `not ch. 718)`. The split rule is fixed in
 * scripts/lib/governing-import.ts; a re-run of `seed:governing-docs-1033`
 * creates the right reference (`760.29(4)`) and links the flag to it.
 *
 * This script removes what the bad split left behind: every statute reference
 * whose code has unbalanced parentheses (a real citation never does), and the
 * flag↔reference rows that point at one. It touches nothing else: no flag, no
 * provision, no document.
 *
 * Read-only by default:
 *   pnpm exec dotenv -- tsx scripts/fix-governing-reference-split.ts            # look
 *   pnpm exec dotenv -- tsx scripts/fix-governing-reference-split.ts --apply    # write (Peter's yes first)
 * Run the seed import with --apply first, so the flag is never left without a reference.
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint.split("?")[0]}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function hasUnbalancedParens(code: string): boolean {
  let depth = 0;
  for (const ch of code) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return true;
  }
  return depth !== 0;
}

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to write)"}`);
  const references = ((await directusFetch("/items/hoa_statute_references?limit=-1&fields=id,code"))?.data ?? []) as Array<{ id: string; code: string | null }>;
  const broken = references.filter((r) => hasUnbalancedParens(r.code ?? ""));
  console.log(`Statute references: ${references.length}; with unbalanced parentheses: ${broken.length}`);
  for (const r of broken) console.log(`  ${JSON.stringify(r.code)}`);
  if (!broken.length) return console.log("Nothing to remove.");

  const filter = encodeURIComponent(JSON.stringify({ reference: { _in: broken.map((r) => r.id) } }));
  const junctions = ((await directusFetch(`/items/hoa_statute_flags_references?limit=-1&fields=id,flag&filter=${filter}`))?.data ?? []) as Array<{ id: string; flag: string }>;
  console.log(`Flag links pointing at them: ${junctions.length} (on ${new Set(junctions.map((j) => j.flag)).size} flag(s))`);

  // Never leave a flag with no reference because of this script.
  for (const flag of new Set(junctions.map((j) => j.flag))) {
    const f = encodeURIComponent(JSON.stringify({ flag: { _eq: flag }, reference: { _nin: broken.map((r) => r.id) } }));
    const kept = (await directusFetch(`/items/hoa_statute_flags_references?limit=1&fields=id&filter=${f}`))?.data ?? [];
    if (!kept.length) throw new Error("A flag would be left with no reference. Run `pnpm run seed:governing-docs-1033 -- --apply` first.");
  }

  if (!APPLY) return console.log(`\nWould delete ${junctions.length} flag link(s) and ${broken.length} reference(s). Nothing written.`);
  if (junctions.length) await directusFetch("/items/hoa_statute_flags_references", { method: "DELETE", body: JSON.stringify(junctions.map((j) => j.id)) });
  await directusFetch("/items/hoa_statute_references", { method: "DELETE", body: JSON.stringify(broken.map((r) => r.id)) });
  console.log(`\nDeleted ${junctions.length} flag link(s) and ${broken.length} reference(s).`);
}

main().catch((err) => {
  console.error("Failed:", err?.message ?? err);
  process.exit(1);
});
