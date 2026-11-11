/**
 * A small, STATEFUL Directus for runtime tests: rows live in memory per
 * collection, `readItems` evaluates the filter operators the server code uses,
 * writes mutate the rows, and a collection can declare UNIQUE fields (an insert
 * that collides throws Directus's RECORD_NOT_UNIQUE, as the real one does).
 *
 * Pair it with `sdkDescriptors` from ./email-queue-memory (the @directus/sdk
 * builders as plain `{ op, collection, … }` objects) via `vi.mock`.
 *
 * Unlike a per-test `vi.fn` returning canned rows, a replayed webhook here sees
 * what the first delivery wrote — which is the only honest way to test that a
 * replay is a no-op.
 */

type Row = Record<string, any>;

export const recordNotUnique = (collection: string, field: string) =>
  Object.assign(new Error(`Value for field "${field}" in collection "${collection}" has to be unique.`), {
    errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }],
  });

const idOf = (v: any) => (v && typeof v === "object" ? v.id : v);

function matchOp(value: any, op: string, arg: any): boolean {
  const v = idOf(value);
  switch (op) {
    case "_eq":
      return v === arg || (v != null && arg != null && String(v) === String(arg));
    case "_neq":
      return !(v === arg || (v != null && arg != null && String(v) === String(arg)));
    case "_in":
      return (arg as any[]).some((a) => String(a) === String(v));
    case "_nin":
      return !(arg as any[]).some((a) => String(a) === String(v));
    case "_gt":
      return v != null && v > arg;
    case "_gte":
      return v != null && v >= arg;
    case "_lt":
      return v != null && v < arg;
    case "_lte":
      return v != null && v <= arg;
    case "_null":
      return arg ? v == null : v != null;
    case "_starts_with":
      return typeof v === "string" && v.startsWith(String(arg));
    case "_nstarts_with":
      // As in Directus (SQL NOT LIKE): a null is left out, not kept.
      return typeof v === "string" && !v.startsWith(String(arg));
    case "_nnull":
      return arg ? v != null : v == null;
    case "_empty":
      return arg ? v == null || v === "" : v != null && v !== "";
    default:
      throw new Error(`memory-directus: unsupported filter operator ${op}`);
  }
}

export function matches(row: Row, filter: Record<string, any> | undefined): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "_and") return (cond as any[]).every((f) => matches(row, f));
    if (key === "_or") return (cond as any[]).some((f) => matches(row, f));
    const value = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      const ops = Object.keys(cond).filter((k) => k.startsWith("_"));
      if (ops.length) return ops.every((op) => matchOp(value, op, cond[op]));
      // A relation: `{ member: { user: { _eq } } }` → match against the related row.
      return value && typeof value === "object" ? matches(value, cond) : false;
    }
    return matchOp(value, "_eq", cond);
  });
}

export class MemoryDirectus {
  rows = new Map<string, Row[]>();
  ops: any[] = [];
  private seq = 0;
  constructor(private unique: Record<string, string[]> = {}) {}

  seed(collection: string, rows: Row[]) {
    const list = this.table(collection);
    for (const r of rows) list.push({ ...r, id: r.id ?? this.nextId(collection) });
    return this;
  }
  table(collection: string): Row[] {
    if (!this.rows.has(collection)) this.rows.set(collection, []);
    return this.rows.get(collection)!;
  }
  all(collection: string, filter?: Record<string, any>): Row[] {
    return this.table(collection).filter((r) => matches(r, filter));
  }
  one(collection: string, id: string): Row | undefined {
    return this.table(collection).find((r) => String(r.id) === String(id));
  }
  private nextId(collection: string) {
    return `${collection}-${++this.seq}`;
  }
  private insert(collection: string, data: Row): Row {
    const list = this.table(collection);
    for (const field of this.unique[collection] ?? []) {
      if (data[field] != null && list.some((r) => r[field] === data[field])) throw recordNotUnique(collection, field);
    }
    const row = { ...data, id: data.id ?? this.nextId(collection) };
    list.push(row);
    return row;
  }

  async request(op: any): Promise<any> {
    this.ops.push(op);
    const c = op.collection;
    switch (op.op) {
      case "readItems": {
        const q = op.query ?? {};
        let rows = this.all(c, q.filter);
        if (typeof q.limit === "number" && q.limit >= 0) rows = rows.slice(0, q.limit);
        return rows.map((r) => ({ ...r }));
      }
      case "readItem": {
        const r = this.one(c, op.id);
        return r ? { ...r } : null;
      }
      case "createItem":
        return { ...this.insert(c, op.data) };
      case "createItems": {
        // One transaction: validate every row first, so a collision writes none.
        const snapshot = [...this.table(c)];
        try {
          return (op.data as Row[]).map((d) => ({ ...this.insert(c, d) }));
        } catch (e) {
          this.rows.set(c, snapshot);
          throw e;
        }
      }
      case "updateItem": {
        const r = this.one(c, op.id);
        if (!r) throw Object.assign(new Error(`memory-directus: no ${c} ${op.id}`), { response: { status: 403 } });
        Object.assign(r, op.data);
        return { ...r };
      }
      case "updateItems": {
        const k = op.keysOrQuery;
        const targets = Array.isArray(k) ? k.map((id: string) => this.one(c, id)).filter(Boolean) : this.all(c, k?.filter);
        for (const r of targets as Row[]) Object.assign(r, op.data);
        return (targets as Row[]).map((r) => ({ ...r }));
      }
      case "updateItemsBatch": {
        for (const p of op.data as Row[]) Object.assign(this.one(c, p.id) ?? {}, p);
        return op.data;
      }
      case "deleteItem": {
        this.rows.set(c, this.table(c).filter((r) => String(r.id) !== String(op.id)));
        return {};
      }
      default:
        throw new Error(`memory-directus: unsupported op ${op.op} on ${c}`);
    }
  }
}
