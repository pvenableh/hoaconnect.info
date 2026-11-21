// useOrderPref — a per-browser saved order for a list of keyed things (dock apps).
// Same localStorage convention as useDashboardWidgets. Order survives reload;
// new keys append, removed keys drop (applyOrder).
import { applyOrder, moveItem } from "#core/shared/motion";

export function useOrderPref(storageKey: string, keys: Ref<string[]> | ComputedRef<string[]>) {
  const saved = useState<string[] | null>(`order-pref:${storageKey}`, () => null);
  const loaded = useState<boolean>(`order-pref-loaded:${storageKey}`, () => false);
  const load = () => {
    if (!import.meta.client || loaded.value) return;
    loaded.value = true;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) saved.value = parsed.filter((k) => typeof k === "string");
    } catch {
      /* corrupt prefs: keep the default order */
    }
  };
  onMounted(load);
  load();

  const ordered = computed(() => applyOrder(keys.value, saved.value));
  const set = (next: string[] | null) => {
    saved.value = next;
    if (!import.meta.client) return;
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      /* storage blocked: the order holds for this visit */
    }
  };
  const move = (from: number, to: number) => set(moveItem(ordered.value, from, to));
  return { ordered, set, move, saved };
}
