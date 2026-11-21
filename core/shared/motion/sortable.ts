// Pure plans for direct manipulation (plan-unified-experience §4). AppSortable,
// AppDropTarget and the order prefs all go through these, so a drag, a keyboard
// move and a "Move to…" menu item can never land an item in different places.

/** A copy of `list` with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item as T);
  return out;
}

/** Keyboard intent: Alt/Option + arrow moves the focused item one place; Home/End (with Alt) to the ends. */
export function keyboardTarget(
  key: string,
  index: number,
  length: number,
  orientation: "vertical" | "horizontal" | "both" = "both"
): number | null {
  const prev = (orientation !== "vertical" && key === "ArrowLeft") || (orientation !== "horizontal" && key === "ArrowUp");
  const next = (orientation !== "vertical" && key === "ArrowRight") || (orientation !== "horizontal" && key === "ArrowDown");
  let to: number | null = null;
  if (prev) to = index - 1;
  else if (next) to = index + 1;
  else if (key === "Home") to = 0;
  else if (key === "End") to = length - 1;
  if (to === null) return null;
  to = Math.max(0, Math.min(length - 1, to));
  return to === index ? null : to;
}

/** The "Move to…" choices for an item: every other slot, 1-based. */
export function moveToOptions(length: number, index: number): { position: number; to: number }[] {
  return Array.from({ length }, (_, i) => ({ position: i + 1, to: i })).filter((o) => o.to !== index);
}

/**
 * Saved order applied to live keys: saved keys first (unknown ones dropped),
 * new keys appended in their default order, so shipping an item never strands
 * a saved order.
 */
export function applyOrder(keys: readonly string[], saved: readonly string[] | null | undefined): string[] {
  if (!saved?.length) return [...keys];
  const live = new Set(keys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of saved) {
    if (live.has(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of keys) if (!seen.has(k)) out.push(k);
  return out;
}

/** Whether a drop with these kinds of data should be accepted. */
export function acceptsDrop(accepts: readonly string[] | undefined, types: readonly string[]): boolean {
  if (!accepts?.length) return true;
  return types.some((t) => accepts.includes(t));
}
