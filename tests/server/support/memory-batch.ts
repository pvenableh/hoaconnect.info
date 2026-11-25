/**
 * `readItemsBatch` over a MemoryDirectus, for tests of code that batches.
 *
 * The REST fallback (readItemsBatchRest) hands each spec to the fake as a
 * plain readItems, and MemoryDirectus neither follows a relation in a filter
 * nor selects dotted fields. This does both, from a small relation map the
 * test declares: an m2o is `"collection.field": "related_collection"`, an o2m
 * alias is `"collection.alias": ["child_collection", "child_fk"]`. Enough of
 * Directus for the specs the server builds (filters with `_and`/`_or`,
 * relational filters through m2o fields, dotted fields, `deep` on an o2m,
 * `sort`, `limit`, `offset`); it refuses what it does not know.
 *
 * Each spec is logged in `db.ops` as a readItems, as the REST reads were.
 */
import { matches, type MemoryDirectus } from "./memory-directus";

export interface MemoryRelations {
  m2o?: Record<string, string>;
  o2m?: Record<string, [string, string]>;
}

type Row = Record<string, any>;
type Tree = Map<string, Tree>;

const idOf = (v: any) => (v && typeof v === "object" ? v.id : v);

function treeOf(fields: readonly string[]): Tree {
  const root: Tree = new Map();
  for (const f of fields) {
    let node = root;
    for (const part of f.split(".")) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part)!;
    }
  }
  return root;
}

function compare(sort: readonly string[] | undefined) {
  return (a: Row, b: Row) => {
    for (const s of sort ?? []) {
      const desc = s.startsWith("-");
      const f = desc ? s.slice(1) : s;
      const x = a[f];
      const y = b[f];
      if (x === y) continue;
      // Postgres: nulls last ascending, first descending.
      if (x == null) return desc ? -1 : 1;
      if (y == null) return desc ? 1 : -1;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  };
}

export function memoryBatch(db: MemoryDirectus, rel: MemoryRelations) {
  const m2o = rel.m2o ?? {};
  const o2m = rel.o2m ?? {};

  const children = (collection: string, alias: string, row: Row) => {
    const [child, fk] = o2m[`${collection}.${alias}`]!;
    return db.table(child).filter((c) => String(idOf(c[fk])) === String(row.id));
  };

  const match = (collection: string, row: Row, filter: Record<string, any> | undefined): boolean => {
    if (!filter) return true;
    return Object.entries(filter).every(([key, cond]) => {
      if (key === "_and") return (cond as any[]).every((f) => match(collection, row, f));
      if (key === "_or") return (cond as any[]).some((f) => match(collection, row, f));
      const related = m2o[`${collection}.${key}`];
      const isOps = cond && typeof cond === "object" && !Array.isArray(cond) && Object.keys(cond).every((k) => k.startsWith("_"));
      if (related && cond && typeof cond === "object" && !isOps) {
        const target = db.one(related, idOf(row[key]));
        return !!target && match(related, target, cond);
      }
      if (o2m[`${collection}.${key}`]) throw new Error(`memory-batch: filter through o2m ${collection}.${key} is not supported`);
      return matches(row, { [key]: cond });
    });
  };

  const select = (collection: string, row: Row, tree: Tree, deep: Record<string, any> | undefined): Row => {
    const out: Row = {};
    for (const [name, sub] of tree) {
      if (!(name in row) && !o2m[`${collection}.${name}`]) continue;
      const related = m2o[`${collection}.${name}`];
      if (related) {
        if (!sub.size) {
          out[name] = idOf(row[name]) ?? null;
          continue;
        }
        const target = row[name] == null ? undefined : db.one(related, idOf(row[name]));
        out[name] = target ? select(related, target, sub, deep?.[name]) : null;
        continue;
      }
      if (o2m[`${collection}.${name}`]) {
        const [child] = o2m[`${collection}.${name}`]!;
        const d = deep?.[name] ?? {};
        let list = children(collection, name, row).filter((c) => match(child, c, d._filter));
        list = [...list].sort(compare(d._sort));
        if (typeof d._limit === "number" && d._limit >= 0) list = list.slice(0, d._limit);
        out[name] = sub.size ? list.map((c) => select(child, c, sub, d)) : list.map((c) => c.id);
        continue;
      }
      if (sub.size) throw new Error(`memory-batch: ${collection}.${name} is not a declared relation`);
      out[name] = row[name];
    }
    return out;
  };

  return async function readItemsBatch(specs: Record<string, any>): Promise<Record<string, any[]>> {
    const out: Record<string, any[]> = {};
    for (const [key, s] of Object.entries(specs)) {
      if ("count" in s) throw new Error("memory-batch: counts are not supported");
      db.ops.push({ op: "readItems", collection: s.collection, query: s });
      let rows = db.table(s.collection).filter((r) => match(s.collection, r, s.filter));
      if (s.sort) rows = [...rows].sort(compare(s.sort));
      if (s.offset) rows = rows.slice(s.offset);
      if (typeof s.limit === "number" && s.limit >= 0) rows = rows.slice(0, s.limit);
      const tree = treeOf(s.fields);
      out[key] = rows.map((r) => select(s.collection, r, tree, s.deep));
    }
    return out;
  };
}
