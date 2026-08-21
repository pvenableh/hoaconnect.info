// Keep a segmented control's selection in the URL — without breaking Back.
//
// Part of the workspace's navigation contract. The four patterns each own a
// different piece of history, and the rules are what make Back predictable:
//
//   push/pop (route change)  → a history entry. Back returns to the last PAGE.
//   slide-over (`?slide=`)   → a history entry. Back closes the panel.
//   segmented control (`?tab=`) → NO history entry (router.replace). Back leaves
//                                 the page rather than stepping through its tabs.
//   bottom sheet             → no URL at all; it is ephemeral by nature.
//
// The reason `?tab=` replaces rather than pushes: a user who opens a page,
// glances at three tabs, and hits Back expects to leave the page — not to walk
// backwards through tabs they only looked at. The tab still lives in the URL so
// the view is linkable and survives a refresh, which is the part worth keeping.

export interface TabQueryOptions {
  /** Query key. Override when a page hosts more than one control. */
  key?: string;
  /** Allowed values. Anything else in the URL falls back to `fallback`. */
  values: readonly string[];
  /** Value used when the query is absent or unrecognised. */
  fallback: string;
}

export function useTabQuery(options: TabQueryOptions) {
  const { key = "tab", values, fallback } = options;
  const route = useRoute();
  const router = useRouter();

  const read = (): string => {
    const raw = route.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === "string" && values.includes(v) ? v : fallback;
  };

  const tab = ref(read());

  // URL → state, so Back/Forward across PAGES and a pasted link both land right.
  watch(
    () => route.query[key],
    () => {
      const next = read();
      if (next !== tab.value) tab.value = next;
    },
  );

  // State → URL, without adding history.
  watch(tab, (next) => {
    const current = route.query[key];
    const currentStr = Array.isArray(current) ? current[0] : current;
    if (currentStr === next) return;

    const query = { ...route.query };
    if (next === fallback) {
      // Keep the default tab's URL clean rather than pinning `?tab=overview`.
      delete query[key];
    } else {
      query[key] = next;
    }
    router.replace({ query });
  });

  return tab;
}
