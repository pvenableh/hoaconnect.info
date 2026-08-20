/**
 * The continuity guarantee doesn't quietly stop being true.
 *
 * `docs/data-continuity-policy.md` and the public page at `app/pages/your-data.vue`
 * are promises about the export, written in prose. Prose does not fail a build,
 * so the two ways they can rot are guarded here:
 *
 *   1. **A new exclusion appears in the export map** and nobody adds it to the
 *      page's "what isn't yours" section. The page would then show a shorter
 *      list than the software actually withholds — the exact shape of the
 *      dishonesty the page exists to rule out.
 *   2. **Something the prose asserts changes underneath it** — the download
 *      window, the ledger CSV, or the route the promise points at.
 *
 * Sibling of `export-collections.test.ts` (the collection-level guard) and
 * `export-csv-fields.test.ts` (the field-level one). This is the promise-level
 * one.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPORT_MAP, PLATFORM_COLLECTIONS } from "#core/shared/export/collections";
import { EXPORT_TTL_DAYS } from "#core/shared/export/manifest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const POLICY = read("docs/data-continuity-policy.md");
const PAGE = read("app/pages/your-data.vue");
const WORKER = read("scripts/data-export-worker.ts");
const SUBSCRIPTION_MIDDLEWARE = read("core/app/middleware/subscription.ts");

/** The `collections: [...]` arrays inside the page's `excludedBuckets`. */
function bucketedCollections(): string[] {
  const out: string[] = [];
  const arrays = PAGE.matchAll(/collections:\s*\[([^\]]*)\]/g);
  for (const [, body] of arrays) {
    for (const m of body.matchAll(/"([a-z0-9_]+)"/g)) out.push(m[1]);
  }
  return out;
}

describe("the public page accounts for everything the export withholds", () => {
  it("buckets every excluded collection", () => {
    const bucketed = new Set(bucketedCollections());
    const missing = Object.keys(PLATFORM_COLLECTIONS).filter((c) => !bucketed.has(c));
    // A new exclusion in the map without a home on the page: the page would
    // keep claiming a complete list while quietly holding one more thing back.
    expect(missing).toEqual([]);
  });

  it("buckets nothing that is actually exported", () => {
    const exported = new Set(EXPORT_MAP.map((e) => e.collection));
    const wrong = bucketedCollections().filter((c) => exported.has(c));
    expect(wrong).toEqual([]);
  });

  it("names each excluded collection exactly once", () => {
    const seen = bucketedCollections();
    const dupes = seen.filter((c, i) => seen.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it("buckets only collections the map knows about", () => {
    const known = new Set([
      ...Object.keys(PLATFORM_COLLECTIONS),
      ...EXPORT_MAP.map((e) => e.collection),
    ]);
    const unknown = bucketedCollections().filter((c) => !known.has(c));
    expect(unknown).toEqual([]);
  });
});

describe("the prose matches the software", () => {
  it("states the real download window", () => {
    // Both documents say "7 days" in words; EXPORT_TTL_DAYS is what the worker
    // and the download route actually enforce.
    expect(POLICY).toContain(`Downloads last ${EXPORT_TTL_DAYS} days`);
    // The page renders the number, so only the fact that it reads the constant
    // is worth asserting.
    expect(PAGE).toContain("EXPORT_TTL_DAYS");
  });

  it("only names the ledger CSV while the worker still writes it", () => {
    // Every other CSV on the page is derived from the export map. `ledger.csv`
    // is computed by the worker from the payment collections, so the page names
    // it by hand — which is only honest while this line survives.
    expect(PAGE).toContain('"ledger.csv"');
    expect(WORKER).toContain('csv/ledger.csv');
  });

  it("says when a collection travels only in part", () => {
    // A chip list of whole collections would let a reader believe everything
    // NOT listed came over complete. The moment the map filters a collection by
    // row, the page has to say so — and it derives that from the map rather
    // than from copy someone remembered to update.
    const filtered = EXPORT_MAP.filter(
      (e) => e.tiers.includes("shareable") && e.shareableRows
    );
    expect(filtered.length).toBeGreaterThan(0);
    for (const entry of filtered) {
      expect(entry.shareableRows!.note.length).toBeGreaterThan(20);
    }
    expect(PAGE).toContain("rowFilterFor");
    expect(PAGE).toContain("partiallyWithheld");
  });

  it("counts record types from the map rather than hard-coding a number", () => {
    expect(PAGE).toContain('entriesForTier("full")');
    expect(PAGE).toContain('entriesForTier("shareable")');
  });

  it("keeps the page off community domains", () => {
    // The platform's policy page has no business rendering on a community's
    // own custom domain.
    expect(PAGE).toContain('middleware: ["marketing-only"]');
  });
});

describe("cancelling does not take the export away", () => {
  it("exempts the export page from the subscription gate", () => {
    // Section 4 of the policy: "you don't need an active subscription to take
    // your own data out". The export API never gated on entitlement; this
    // middleware did, and it is the only thing that could make that sentence a
    // lie. The suffix below has to keep matching the real route.
    expect(SUBSCRIPTION_MIDDLEWARE).toContain("'/admin/settings/data'");
    expect(POLICY).toContain("Export stays available for at least 12 months");
  });

  it("still points at a page that exists", () => {
    const exempted = SUBSCRIPTION_MIDDLEWARE.match(
      /to\.path\.endsWith\('([^']+)'\)/
    )?.[1];
    expect(exempted).toBeTruthy();
    // /{slug}/admin/settings/data → app/pages/[slug]/admin/settings/data.vue.
    // Renaming or moving the page now fails here instead of silently
    // re-gating the export behind the subscription check.
    const page = read(`app/pages/[slug]${exempted}.vue`);
    expect(page).toContain("PagesSettingsDataPage");
  });
});
