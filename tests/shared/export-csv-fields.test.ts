/**
 * The CSV columns in the export map name real fields.
 *
 * `export-collections.test.ts` guards the *collections* — adding one to the
 * schema without deciding whether it is exported fails the suite. Nothing
 * guarded the *fields*, and the first live run of the worker died on it:
 * `units.csv` asked for `name`, `bedrooms`, `square_feet` and friends, none of
 * which exist on `hoa_units`, and Directus rejects the whole query rather than
 * the unknown columns. A board's export failed on a spreadsheet nobody had
 * checked.
 *
 * So this reads the generated Directus types — the file that IS the live
 * schema, regenerated with `pnpm generate:types` — and asserts every CSV column
 * path resolves against it, one relation deep. A renamed column now fails here
 * instead of at 3am inside a worker.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPORT_MAP } from "#core/shared/export/collections";

// The suite runs from the repo root (vitest's `root`), and the DOM-ish test
// environment leaves `import.meta.url` non-file, so resolve from cwd.
const TYPES = readFileSync(join(process.cwd(), "core/types/directus.ts"), "utf8");

/** collection name → the interface the generator gave it, from `interface Schema`. */
function collectionInterfaces(): Map<string, string> {
  const block = TYPES.match(/export interface Schema \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("Could not find `interface Schema` in the generated types");
  const map = new Map<string, string>();
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*(\w+)(\[\])?;/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

/** interface name → its property names, and the interface each property points at. */
function interfaceFields(name: string): Map<string, string | null> {
  const block = TYPES.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`No interface ${name} in the generated types`);
  const fields = new Map<string, string | null>();
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+)\??:\s*(.+);$/);
    if (!m) continue;
    // "HoaUnit | string | null" → HoaUnit; "string | null" → not a relation.
    const related = m[2].match(/\b([A-Z]\w+)\b/);
    fields.set(m[1], related ? related[1] : null);
  }
  return fields;
}

const SCHEMA = collectionInterfaces();

describe("every CSV column names a field that exists", () => {
  const withCsv = EXPORT_MAP.filter((e) => e.csv);

  it("has CSVs to check", () => {
    expect(withCsv.length).toBeGreaterThan(0);
  });

  for (const entry of withCsv) {
    it(`${entry.csv!.file} matches ${entry.collection}`, () => {
      const iface = SCHEMA.get(entry.collection);
      expect(iface, `${entry.collection} is missing from the generated types`).toBeTruthy();

      for (const column of entry.csv!.columns) {
        const [root, ...rest] = column.path.split(".");
        const fields = interfaceFields(iface!);
        expect(
          fields.has(root),
          `${entry.collection} has no field "${root}" (column "${column.header}")`
        ).toBe(true);

        // One relation deep is all the export writes — "unit.unit_number".
        if (rest.length) {
          const relatedIface = fields.get(root);
          expect(
            relatedIface,
            `${entry.collection}.${root} is not a relation, so "${column.path}" cannot resolve`
          ).toBeTruthy();
          const relatedFields = interfaceFields(relatedIface!);
          expect(
            relatedFields.has(rest[0]),
            `${relatedIface} has no field "${rest[0]}" (column "${column.header}")`
          ).toBe(true);
        }
      }
    });
  }
});
