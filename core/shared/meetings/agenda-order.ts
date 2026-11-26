// Agenda order (docs/plan-unified-experience.md §6, Meetings: "drag agenda items
// into order"). A meeting's agenda is one free-text field, so its items are its
// lines: reordering them rewrites the text, and the meeting form saves it
// through the route it already uses. No new collection.
//
// A one-line agenda written as a list ("Budget, gutters, party.") reads as one
// item; the order control only appears once there are two lines to move.

export interface AgendaItem {
  /** Stable while the text is unchanged: the line plus its occurrence count. */
  key: string;
  text: string;
}

/** The agenda's items, one per non-blank line, in order. Leading list marks are kept. */
export function agendaItems(text: string | null | undefined): AgendaItem[] {
  const seen = new Map<string, number>();
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const n = (seen.get(line) ?? 0) + 1;
      seen.set(line, n);
      return { key: `${n}:${line}`, text: line };
    });
}

/** The agenda text for items in this order (blank lines dropped). */
export function agendaText(items: readonly AgendaItem[]): string {
  return items.map((i) => i.text).join("\n");
}
