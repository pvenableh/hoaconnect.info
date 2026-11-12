/**
 * Realtime by polling (core/app/composables/useWebSocketManager.ts). Each poll
 * returns a subscription's rows; `diffRows` turns two polls into the events a
 * Directus subscription used to send: `create` and `update` carry rows,
 * `delete` carries bare primary keys, as Directus sends them.
 *
 * A poll is capped (POLL_ROW_LIMIT). When it comes back full, a row that is
 * missing may only have moved out of the window, so no delete is reported for
 * it and it is kept in the snapshot, which also stops it from reading as new
 * if it comes back.
 */
export const POLL_ROW_LIMIT = 200;

export type RowSnapshot = Map<string, { id: unknown; json: string }>;

export interface PollDiff {
  create: any[];
  update: any[];
  delete: unknown[];
  next: RowSnapshot;
}

export function diffRows(previous: RowSnapshot, rows: readonly any[], complete: boolean): PollDiff {
  const next: RowSnapshot = new Map();
  const create: any[] = [];
  const update: any[] = [];
  for (const row of rows) {
    if (row == null || row.id == null) continue;
    const key = String(row.id);
    const json = JSON.stringify(row);
    next.set(key, { id: row.id, json });
    const before = previous.get(key);
    if (!before) create.push(row);
    else if (before.json !== json) update.push(row);
  }
  const removed: unknown[] = [];
  for (const [key, before] of previous) {
    if (next.has(key)) continue;
    if (complete) removed.push(before.id);
    else next.set(key, before);
  }
  return { create, update, delete: removed, next };
}

/** The query a poll runs for one subscription: its fields (plus `id`), filter and sort, capped at POLL_ROW_LIMIT rows. */
export function pollQuery(raw: any): Record<string, unknown> {
  const fields: string[] = Array.isArray(raw?.fields) && raw.fields.length ? raw.fields.map(String) : ["*"];
  // Rows are told apart by id, whatever the subscriber asked for.
  if (!fields.includes("*") && !fields.includes("id")) fields.push("id");
  const query: Record<string, unknown> = { fields, limit: POLL_ROW_LIMIT };
  if (raw?.filter && typeof raw.filter === "object" && !Array.isArray(raw.filter)) query.filter = raw.filter;
  if (Array.isArray(raw?.sort) && raw.sort.length) query.sort = raw.sort.map(String);
  return query;
}
