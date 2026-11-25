/**
 * Several `readItems` reads as ONE Directus request (GraphQL), with rows shaped
 * as the REST reads return them: the same values (checked against live data),
 * though a row's keys may come in another order.
 *
 * Why: Directus spends ~40ms of CPU on every authenticated request (token,
 * permissions) in a single Node process, so concurrent REST reads queue behind
 * each other: four reads ≈ 230ms, the same four as one GraphQL query ≈ 105ms.
 * A route that needs several independent reads gets them in one request here.
 *
 * Callers write ordinary REST specs (dotted `fields`, `filter`, `deep`, `sort`,
 * `limit`). GraphQL needs to know which fields are relations: a bare m2o field
 * is selected as `field { id }` and flattened back to its id, a filter on an
 * m2o compares `{ id: ... }`, and `deep` becomes arguments on the nested field.
 * GraphQL also sends a decimal as a number (100) where REST sends text
 * ("100.00"), so decimals go back to text at their column's scale. The
 * relations and the decimal scales come from one `/graphql/system` read, made
 * in the background and kept for ten minutes;
 * until it is ready, or if GraphQL refuses a query, the specs run as parallel
 * REST reads (today's behaviour), so the batch is never slower or wronger
 * than the reads it replaces. Related primary keys are assumed to be `id`.
 */
import { readItems } from "@directus/sdk";

export interface ReadSpec {
  collection: string;
  fields: readonly string[];
  filter?: Record<string, unknown>;
  deep?: Record<string, unknown>;
  sort?: readonly string[];
  limit?: number;
}

/** `collection.field` → the collection it points at (m2o fields, o2m aliases), or a decimal's scale. */
export interface RelationMap {
  m2o: Map<string, string>;
  o2m: Map<string, string>;
  decimals: Map<string, number>;
}

const RELATIONS_TTL_MS = 10 * 60_000;
let relations: { map: RelationMap; at: number } | null = null;
let loading: Promise<void> | null = null;

/** Build the map from Directus relation rows and field rows (`type`, `schema.numeric_scale`). */
export function relationMapOf(rows: readonly any[], fields: readonly any[] = []): RelationMap {
  const m2o = new Map<string, string>();
  const o2m = new Map<string, string>();
  const decimals = new Map<string, number>();
  for (const f of fields) {
    if (f?.type === "decimal" && f.collection && f.field) decimals.set(`${f.collection}.${f.field}`, Number(f.schema?.numeric_scale ?? 0));
  }
  for (const r of rows) {
    if (!r?.collection || !r?.field || !r?.related_collection) continue; // m2a and the like: not handled
    m2o.set(`${r.collection}.${r.field}`, r.related_collection);
    if (r.meta?.one_field) o2m.set(`${r.related_collection}.${r.meta.one_field}`, r.collection);
  }
  return { m2o, o2m, decimals };
}

function loadRelations(): void {
  if (loading) return;
  const config = useRuntimeConfig();
  loading = fetch(`${config.directus.url}/graphql/system`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.directus.staticToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: "{ relations { collection field related_collection meta { one_field } } fields { collection field type schema { numeric_scale } } }",
    }),
  })
    .then(async (r) => {
      const body = (await r.json()) as any;
      if (!r.ok || body?.errors?.length || !body?.data?.relations) throw new Error(`schema read ${r.status}`);
      relations = { map: relationMapOf(body.data.relations, body.data.fields ?? []), at: Date.now() };
    })
    .catch((e) => console.warn("[directus-graphql] schema read failed; using REST:", e?.message ?? e))
    .finally(() => (loading = null));
}

/** The schema map if it is loaded (refreshing it in the background when stale), else null. */
function currentRelations(): RelationMap | null {
  if (!relations || Date.now() - relations.at > RELATIONS_TTL_MS) loadRelations();
  return relations?.map ?? null;
}

// ── Query building (pure; exported for tests) ────────────────────────────────

/** A field tree: name → subtree (empty for a leaf). */
type Tree = Map<string, Tree>;

function treeOf(fields: readonly string[]): Tree {
  const root: Tree = new Map();
  for (const f of fields) {
    if (f.includes("*")) throw new Error(`wildcard field ${f} is not supported`);
    let node = root;
    for (const part of f.split(".")) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part)!;
    }
  }
  return root;
}

/** A JS value as a GraphQL input literal. */
export function gqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(gqlLiteral).join(", ")}]`;
  if (typeof v === "object") {
    return `{${Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k}: ${gqlLiteral(x)}`)
      .join(", ")}}`;
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new Error(`cannot write ${typeof v} into a GraphQL query`);
}

const isOperatorObject = (v: unknown) =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).some((k) => k.startsWith("_"));

/** A REST filter rewritten for GraphQL: an operator on an m2o field compares the related `id`. */
export function gqlFilter(collection: string, filter: unknown, rel: RelationMap): unknown {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return filter;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter as Record<string, unknown>)) {
    if (k === "_and" || k === "_or") {
      out[k] = (v as unknown[]).map((f) => gqlFilter(collection, f, rel));
    } else if (k.startsWith("_")) {
      out[k] = v;
    } else if (rel.m2o.has(`${collection}.${k}`)) {
      const related = rel.m2o.get(`${collection}.${k}`)!;
      // `{ user: { _eq: x } }` compares the id; `{ user: { status: ... } }` or `_and`/`_or` reach into the related row.
      const keys = Object.keys((v ?? {}) as object);
      const comparesId = isOperatorObject(v) && keys.every((op) => op.startsWith("_") && op !== "_and" && op !== "_or");
      out[k] = comparesId ? { id: v } : gqlFilter(related, v, rel);
    } else if (rel.o2m.has(`${collection}.${k}`)) {
      out[k] = gqlFilter(rel.o2m.get(`${collection}.${k}`)!, v, rel);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function argsOf(collection: string, a: { filter?: unknown; sort?: unknown; limit?: unknown }, rel: RelationMap): string {
  const parts: string[] = [];
  if (a.filter) parts.push(`filter: ${gqlLiteral(gqlFilter(collection, a.filter, rel))}`);
  if (a.sort) parts.push(`sort: ${gqlLiteral(a.sort)}`);
  if (a.limit !== undefined) parts.push(`limit: ${gqlLiteral(a.limit)}`);
  return parts.length ? `(${parts.join(", ")})` : "";
}

function selection(collection: string, tree: Tree, deep: Record<string, any> | undefined, rel: RelationMap): string {
  const parts: string[] = [];
  for (const [name, sub] of tree) {
    const m2o = rel.m2o.get(`${collection}.${name}`);
    const o2m = rel.o2m.get(`${collection}.${name}`);
    const related = m2o ?? o2m;
    if (!related) {
      if (sub.size) throw new Error(`${collection}.${name} is not a relation`);
      parts.push(name);
      continue;
    }
    const d = deep?.[name] as Record<string, any> | undefined;
    const args = d ? argsOf(related, { filter: d._filter, sort: d._sort, limit: d._limit }, rel) : "";
    parts.push(`${name}${args} { ${sub.size ? selection(related, sub, d, rel) : "id"} }`);
  }
  return parts.join(" ");
}

/** The GraphQL query for a batch of specs, one aliased root field per key. */
export function buildBatchQuery(specs: Record<string, ReadSpec>, rel: RelationMap): string {
  const roots = Object.entries(specs).map(([key, s]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`batch key ${key} is not a GraphQL name`);
    return `${key}: ${s.collection}${argsOf(s.collection, s, rel)} { ${selection(s.collection, treeOf(s.fields), s.deep as any, rel)} }`;
  });
  return `query {\n  ${roots.join("\n  ")}\n}`;
}

/**
 * GraphQL rows back to REST's shape: a relation selected only for its id
 * becomes that id, and a decimal becomes text at its scale ("100.00").
 */
export function restShaped(collection: string, fields: readonly string[], rows: readonly any[], rel: RelationMap): any[] {
  const flatten = (c: string, tree: Tree, row: any): any => {
    if (!row || typeof row !== "object") return row;
    const out: Record<string, unknown> = { ...row };
    for (const [name, sub] of tree) {
      if (!(name in out)) continue;
      const scale = rel.decimals.get(`${c}.${name}`);
      if (scale !== undefined) {
        if (typeof out[name] === "number") out[name] = (out[name] as number).toFixed(scale);
        continue;
      }
      const related = rel.m2o.get(`${c}.${name}`) ?? rel.o2m.get(`${c}.${name}`);
      if (!related) continue;
      const v = out[name];
      const one = (x: any) => (sub.size ? flatten(related, sub, x) : x && typeof x === "object" ? x.id ?? null : x);
      out[name] = Array.isArray(v) ? v.map(one) : v == null ? v : one(v);
    }
    return out;
  };
  const tree = treeOf(fields);
  return rows.map((r) => flatten(collection, tree, r));
}

// ── The batch ────────────────────────────────────────────────────────────────

function restRead(s: ReadSpec): Promise<any[]> {
  return getTypedDirectus()
    .request(
      readItems(s.collection as any, {
        fields: [...s.fields] as any,
        ...(s.filter ? { filter: s.filter as any } : {}),
        ...(s.deep ? { deep: s.deep as any } : {}),
        ...(s.sort ? { sort: [...s.sort] as any } : {}),
        ...(s.limit !== undefined ? { limit: s.limit } : {}),
      })
    )
    .then((r) => ((r ?? []) as any[]));
}

/** The same specs as parallel REST reads: the fallback, and what tests run against a fake Directus. */
export async function readItemsBatchRest<K extends string>(specs: Record<K, ReadSpec>): Promise<Record<K, any[]>> {
  const keys = Object.keys(specs) as K[];
  const rows = await Promise.all(keys.map((k) => restRead(specs[k])));
  return Object.fromEntries(keys.map((k, i) => [k, rows[i]])) as Record<K, any[]>;
}

/**
 * The rows for each spec, as `readItems` would return them, read in one
 * GraphQL request when the relation map is loaded, else as parallel REST reads.
 */
export async function readItemsBatch<K extends string>(specs: Record<K, ReadSpec>): Promise<Record<K, any[]>> {
  const rel = currentRelations();
  if (!rel) return readItemsBatchRest(specs);
  let query: string;
  try {
    query = buildBatchQuery(specs, rel);
  } catch (e: any) {
    console.warn("[directus-graphql] cannot batch; using REST:", e?.message ?? e);
    return readItemsBatchRest(specs);
  }
  const config = useRuntimeConfig();
  const res = await fetch(`${config.directus.url}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.directus.staticToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json().catch(() => null)) as { data?: Record<string, any[]>; errors?: any[] } | null;
  if (!res.ok || !body?.data || body.errors?.length) {
    // A query GraphQL refuses (a field type it reads differently, a schema
    // change) must not break the page: the REST reads give the same answer.
    console.warn("[directus-graphql] query refused; using REST:", JSON.stringify(body?.errors ?? res.status).slice(0, 500));
    return readItemsBatchRest(specs);
  }
  const out = {} as Record<K, any[]>;
  for (const k of Object.keys(specs) as K[]) out[k] = restShaped(specs[k].collection, specs[k].fields, body.data[k] ?? [], rel);
  return out;
}
