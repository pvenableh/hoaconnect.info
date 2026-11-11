/**
 * Acceptance criterion 8 (spec §9): no code path rewrites provision text except
 * an explicit, audited admin edit.
 *
 * This is a guard on the source tree. Provision text can be written from the
 * app in only two ways: a Directus write naming the provisions collection, or
 * the generic items proxy (which runs with the caller's own token, and no role
 * holds any permission on the collection). So:
 *
 *  - only the files in WRITERS may mention the collection next to a write call;
 *  - the read layer contains no write call at all;
 *  - the schema script grants no permissions;
 *  - nothing that handles provision text passes it through a transforming call.
 *
 * Session 3A added the proposer (create only). Session 3B added the reviewer, the one file that changes text: an
 * edit, a split or a merge, each with an audit row. tests/server/governing-review.test.ts proves the rows through the
 * routes; here the file is held to never transforming text and to auditing wherever it writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const COLLECTION = "hoa_governing_provisions";

/**
 * Files allowed to write provisions. The import lib creates rows and never updates `text` (CREATE_ONLY).
 * The upload flow's proposer creates `ocr_draft` rows for a document that has none, and has no update call.
 */
const PROPOSER = "core/server/utils/governing-propose.ts";
/** The audited edit, split, merge, reorder, review state, publish and draft delete (Session 3B). */
const REVIEWER = "core/server/utils/governing-review.ts";
const WRITERS = ["scripts/lib/governing-import.ts", "scripts/create-governing-docs.ts", PROPOSER, REVIEWER];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|vue|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

const files = ["app", "core", "server", "shared", "scripts"].flatMap((d) => walk(join(ROOT, d)));
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const WRITE_CALL = /\b(createItems?|updateItems?|updateItemsBatch|deleteItems?|upsert)\b|method:\s*["'](POST|PATCH|DELETE)["']/;

describe("provision text has one way in (criterion 8)", () => {
  it("only the listed files both name the provisions collection and write to Directus", () => {
    const writers = files
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (text.includes(COLLECTION) || text.includes("C.provisions")) && WRITE_CALL.test(text);
      })
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== "core/types/directus.ts");
    expect(writers.sort()).toEqual([...WRITERS].sort());
  });

  it("the read layer and the read routes contain no write call", () => {
    const readers = files.map((f) => relative(ROOT, f)).filter((f) => f.startsWith("core/server/api/governing/") && f.endsWith(".get.ts"));
    expect(readers.length).toBeGreaterThanOrEqual(5);
    for (const f of [...readers, "core/server/utils/governing-data.ts", "core/shared/governing/search.ts", "core/shared/governing/visibility.ts"]) {
      expect(WRITE_CALL.test(source(f)), f).toBe(false);
    }
  });

  it("the import writes text on create only", () => {
    const lib = source("scripts/lib/governing-import.ts");
    expect(lib).toMatch(/\[C\.provisions\]: \["text", "review_state"\]/);
  });

  it("the upload flow only creates provisions: no update, no delete, and only as ocr_draft", () => {
    const proposer = source(PROPOSER);
    expect(proposer).not.toMatch(/\b(updateItems?|updateItemsBatch|deleteItems?|upsert)\b/);
    expect(proposer).toMatch(/review_state: "ocr_draft"/);
    expect(proposer).not.toMatch(/review_state: "(reviewed|verified)"/);
    // The rest of the upload flow never names the provisions collection.
    for (const f of ["core/server/utils/governing-upload.ts", "core/server/utils/governing-pages.ts", "core/server/utils/governing-sources.ts"]) {
      expect(source(f).includes(COLLECTION), f).toBe(false);
    }
  });

  it("the reviewer audits every function that writes, and never transforms text", () => {
    const reviewer = source(REVIEWER);
    // Each exported function that writes to Directus also writes an audit row.
    const functions = reviewer.split(/\nexport async function /).slice(1);
    const writing = functions.filter((f) => /\bwrite\(|renumber\(/.test(f));
    expect(writing.map((f) => f.slice(0, f.indexOf("("))).sort()).toEqual([
      "deleteGoverningDraft",
      "editGoverningProvision",
      "mergeGoverningProvision",
      "publishGoverningDocument",
      "reorderGoverningProvisions",
      "setGoverningReviewState",
      "splitGoverningProvision",
    ]);
    for (const f of writing) expect(f, f.slice(0, 40)).toMatch(/writeGoverningAudit\(/);
    // Text goes in as it is given.
    for (const f of [REVIEWER, "core/shared/governing/review.ts", "core/server/api/governing/provisions/[id].patch.ts"]) {
      expect(source(f), f).not.toMatch(/text[\w.?\][]*\.(trim|trimEnd|trimStart|replace|replaceAll|normalize|toLowerCase|toUpperCase)\(/);
    }
    // The only pieces of text it builds are a cut and a join.
    const shared = source("core/shared/governing/review.ts");
    expect(shared).toMatch(/return \[text\.slice\(0, at\), text\.slice\(at\)\];/);
    expect(shared).toMatch(/mergeText = \(first: string, second: string\) => first \+ second;/);
  });

  it("the schema script creates no role permissions", () => {
    const script = source("scripts/create-governing-docs.ts");
    expect(script).not.toMatch(/["'`]\/permissions["'`]\s*,\s*\{/);
    expect(script).not.toMatch(/\/policies|\/access/);
    expect(script).not.toMatch(/\btrim:\s*true/);
  });

  it("nothing on the path from the seed to the page transforms text", () => {
    const transforming = /\.text\s*(\?\.)?\.(trim|replace|replaceAll|normalize|toLowerCase|toUpperCase)\(|text:\s*[a-zA-Z_.]+\.(trim|replace|replaceAll|normalize)\(/;
    for (const f of ["scripts/lib/governing-import.ts", "scripts/seed-governing-docs-1033.ts", "core/server/utils/governing-data.ts"]) {
      expect(transforming.test(source(f)), f).toBe(false);
    }
  });
});
