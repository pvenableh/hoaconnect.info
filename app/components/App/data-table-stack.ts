/**
 * Stacked rows for AppDataTable: each record is two lines instead of one cell
 * per column. Line one is the primary column (left) and, optionally, one more
 * (right, a status). Line two is the meta columns, in order, as inline items.
 *
 * Plain TypeScript so the resolution is table-tested; the component only draws
 * what this returns. A stack that names no real primary column is no stack, so
 * a typo in a page falls back to the plain table instead of an empty one.
 */
export interface DataTableStack {
  /** The column drawn on the first line, left. */
  primary: string;
  /** The column drawn on the first line, right (a status chip). */
  end?: string;
  /** The columns drawn on the second line, in this order. */
  meta: string[];
  /** Meta columns drawn without their label: a holder chip says what it is. */
  bare?: string[];
}

export interface StackedView<C extends { key: string }> {
  primary: C;
  end: C | null;
  meta: C[];
  bare: Set<string>;
}

export function resolveStack<C extends { key: string }>(
  columns: readonly C[],
  stack: DataTableStack | null | undefined,
): StackedView<C> | null {
  if (!stack) return null;
  const by = new Map(columns.map((c) => [c.key, c]));
  const primary = by.get(stack.primary);
  if (!primary) return null;
  const end = stack.end ? (by.get(stack.end) ?? null) : null;
  // A column drawn once: the primary and the end never repeat on line two.
  const taken = new Set([primary.key, end?.key]);
  const meta = stack.meta.flatMap((k) => {
    const c = by.get(k);
    return c && !taken.has(c.key) ? [c] : [];
  });
  return { primary, end, meta, bare: new Set(stack.bare ?? []) };
}
