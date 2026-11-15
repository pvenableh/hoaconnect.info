/**
 * useResource — the rows of one resource and what the viewer has done to them
 * (docs/spec-resource-scaffold.md, plan §2.3).
 *
 * An index page builds a definition in setup (where it may call composables,
 * since `load` and `remove.run` close over them) and passes it here. The result
 * is ONE reactive handle: a template reads `charges.visible` and binds
 * `v-model="charges.query"` without `.value`, and `AppResourceIndex` takes the
 * handle as a single prop.
 *
 * Rows live in `useState("resource:<key>")`, tagged with the org they were
 * loaded for, so an index and the panel opened over it share one copy: the
 * panel passes `reuse: true` and makes no second request.
 *
 * Reads go only through `def.load`. A resource whose rows are gated by a
 * server route (charges: `requireMoneyRead`) stays gated — the scaffold adds no
 * read of its own.
 */
import type { ConfirmOptions } from "./useConfirm";
import { useConfirm } from "./useConfirm";
import { useAppSlideOver } from "./useAppSlideOverStack";

export interface ResourceStatus<Row> {
  value: string;
  label: string;
  /** Which rows this status shows. Omitted = every row (the "All" segment). */
  match?: (row: Row) => boolean;
}

export interface ResourceFilter<Row> {
  /** The value that means "off". */
  initial: string;
  match: (row: Row, value: string) => boolean;
}

export interface ResourceRemove<Row> {
  /** Title Case menu label: "Cancel Charge", "Delete Unit". */
  label: string;
  /** Names the record and what goes with it (plan §2.3). */
  confirm: (row: Row) => ConfirmOptions;
  run: (row: Row) => Promise<unknown>;
  /** Toast on success. */
  done: string;
}

export interface ResourceDefinition<Row> {
  /** Cache key, shared by the index and its panel. */
  key: string;
  /** Panel registry type that shows one row. */
  panel?: string;
  rowKey?: (row: Row) => string;
  load: (orgId: string) => Promise<Row[]>;
  search?: (row: Row) => (string | null | undefined)[];
  /** The one segmented status filter. The first entry is the default. */
  statuses?: ResourceStatus<Row>[];
  /** Further filters, drawn by the page in AppResourceIndex's `#filters` slot. */
  filters?: Record<string, ResourceFilter<Row>>;
  remove?: ResourceRemove<Row>;
}

export interface ResourceViewState {
  query: string;
  status: string;
  filters: Record<string, string>;
}

const defaultKey = (row: unknown) => String((row as { id?: unknown })?.id ?? "");

/** Fold case and accents so "jose" finds "José". */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Status, then filters, then search — pure, so it is table-tested. */
export function applyResourceView<Row>(rows: Row[], def: ResourceDefinition<Row>, view: ResourceViewState): Row[] {
  const status = def.statuses?.find((s) => s.value === view.status);
  const filters = Object.entries(def.filters ?? {}).filter(([name, f]) => (view.filters[name] ?? f.initial) !== f.initial);
  const terms = foldText(view.query.trim()).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (status?.match && !status.match(row)) return false;
    for (const [name, f] of filters) if (!f.match(row, view.filters[name]!)) return false;
    if (terms.length && def.search) {
      const hay = foldText(def.search(row).filter(Boolean).join(" "));
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

interface ResourceCache<Row> {
  orgId: string | null;
  rows: Row[];
  loaded: boolean;
  pending: boolean;
  error: string | null;
}

/** One in-flight load per key, so an index and its panel mounting together fetch once. */
const inflight = new Map<string, Promise<void>>();

/**
 * The handle. Typed by hand rather than inferred from `reactive()`, whose
 * unwrapping turns a generic `Row[]` into `UnwrapRefSimple<Row>[]` and breaks
 * every typed `#cell-*` slot downstream.
 */
export interface ResourceHandle<Row> {
  readonly key: string;
  readonly panel: string | null;
  keyOf: (row: Row) => string;
  // List
  readonly rows: Row[];
  readonly visible: Row[];
  readonly total: number;
  readonly count: number;
  readonly pending: boolean;
  readonly error: string | null;
  refresh: () => Promise<void>;
  find: (id: string | null | undefined) => Row | null;
  // Filters
  query: string;
  status: string;
  filters: Record<string, string>;
  readonly statusItems: { value: string; label: string }[];
  readonly isFiltered: boolean;
  reset: () => void;
  // Selection
  readonly selected: string[];
  readonly selectedRows: Row[];
  isSelected: (row: Row) => boolean;
  toggle: (row: Row) => void;
  selectAll: () => void;
  clear: () => void;
  // Open panel
  readonly openId: string | null;
  open: (row: Row) => Promise<void>;
  close: () => Promise<void>;
  // Remove
  readonly canRemove: boolean;
  readonly removeLabel: string | null;
  remove: (row: Row) => Promise<boolean>;
}

export function useResource<Row>(
  def: ResourceDefinition<Row>,
  opts: { orgId: Ref<string | null | undefined>; reuse?: boolean },
): ResourceHandle<Row> {
  const keyOf = def.rowKey ?? (defaultKey as (row: Row) => string);
  const cache = useState<ResourceCache<Row>>(`resource:${def.key}`, () => ({
    orgId: null,
    rows: [],
    loaded: false,
    pending: false,
    error: null,
  }));

  const initialFilters = () =>
    Object.fromEntries(Object.entries(def.filters ?? {}).map(([name, f]) => [name, f.initial]));
  const query = ref("");
  const status = ref(def.statuses?.[0]?.value ?? "");
  const filters = reactive<Record<string, string>>(initialFilters());
  const selected = ref<string[]>([]);

  async function refresh(): Promise<void> {
    const orgId = opts.orgId.value;
    if (!orgId) return;
    const flightKey = `${def.key}:${orgId}`;
    const running = inflight.get(flightKey);
    if (running) return running;
    const run = (async () => {
      cache.value.pending = true;
      cache.value.error = null;
      try {
        const rows = await def.load(orgId);
        // The org changed while this was in flight: its rows are not this org's.
        if (opts.orgId.value !== orgId) return;
        cache.value = { orgId, rows, loaded: true, pending: false, error: null };
      } catch (e) {
        cache.value.pending = false;
        cache.value.error = (e as { message?: string })?.message || "Could not load";
      }
    })().finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, run);
    return run;
  }

  const forThisOrg = computed(() => !!opts.orgId.value && cache.value.orgId === opts.orgId.value);
  const rows = computed<Row[]>(() => (forThisOrg.value ? cache.value.rows : []));

  // Client only, as the pages' `server: false` reads were: org-wide rows never
  // ride the SSR payload.
  if (!import.meta.server) {
    watch(
      () => opts.orgId.value,
      (orgId, prev) => {
        if (!orgId) return;
        if (orgId !== prev) selected.value = [];
        if (opts.reuse && cache.value.loaded && cache.value.orgId === orgId) return;
        void refresh();
      },
      { immediate: true },
    );
  }

  // Selection follows the rows: an id that leaves (cancelled, deleted, another
  // org) is no longer selected.
  watch(rows, (next) => {
    if (!selected.value.length) return;
    const live = new Set(next.map(keyOf));
    const kept = selected.value.filter((id) => live.has(id));
    if (kept.length !== selected.value.length) selected.value = kept;
  });

  const visible = computed(() =>
    applyResourceView(rows.value, def, { query: query.value, status: status.value, filters }),
  );
  const statusItems = computed(() => (def.statuses ?? []).map((s) => ({ value: s.value, label: s.label })));
  const isFiltered = computed(
    () =>
      !!query.value.trim() ||
      Object.entries(def.filters ?? {}).some(([name, f]) => filters[name] !== f.initial),
  );

  /** Clears search and filters. The status segment stays: it is a view, not a filter. */
  function reset() {
    query.value = "";
    Object.assign(filters, initialFilters());
  }

  const find = (id: string | null | undefined) => (id ? rows.value.find((r) => keyOf(r) === id) ?? null : null);

  const selectedSet = computed(() => new Set(selected.value));
  const isSelected = (row: Row) => selectedSet.value.has(keyOf(row));
  function toggle(row: Row) {
    const id = keyOf(row);
    selected.value = isSelected(row) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
  }
  const selectAll = () => {
    selected.value = visible.value.map(keyOf);
  };
  const clear = () => {
    selected.value = [];
  };
  const selectedRows = computed(() => rows.value.filter((r) => selectedSet.value.has(keyOf(r))));

  const slide = def.panel ? useAppSlideOver(def.panel) : null;
  const openId = computed(() => slide?.activeId.value ?? null);
  const open = async (row: Row) => {
    await slide?.open(keyOf(row));
  };
  const close = async () => {
    await slide?.close();
  };

  const { confirm } = useConfirm();
  async function remove(row: Row): Promise<boolean> {
    if (!def.remove) return false;
    if (!(await confirm(def.remove.confirm(row)))) return false;
    const { toast } = await import("vue-sonner");
    try {
      await def.remove.run(row);
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Something went wrong");
      return false;
    }
    toast.success(def.remove.done);
    await refresh();
    return true;
  }

  return reactive({
    key: def.key,
    panel: def.panel ?? null,
    keyOf,
    // List
    rows,
    visible,
    total: computed(() => rows.value.length),
    count: computed(() => visible.value.length),
    pending: computed(() => cache.value.pending || (!!opts.orgId.value && !forThisOrg.value && !cache.value.error)),
    error: computed(() => cache.value.error),
    refresh,
    find,
    // Filters
    query,
    status,
    filters,
    statusItems,
    isFiltered,
    reset,
    // Selection
    selected,
    selectedRows,
    isSelected,
    toggle,
    selectAll,
    clear,
    // Open panel
    openId,
    open,
    close,
    // Remove
    canRemove: !!def.remove,
    removeLabel: def.remove?.label ?? null,
    remove,
  }) as unknown as ResourceHandle<Row>;
}
