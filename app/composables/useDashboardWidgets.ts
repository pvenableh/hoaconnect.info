// useDashboardWidgets — the editable, iOS-home-screen-style widget model for the
// admin dashboard. A registry of available widgets + a per-browser saved layout
// (order + which are visible) persisted to localStorage, plus an "edit mode" with
// reorder / hide / add operations. Mirrors the localStorage convention used by
// useAppNav for the dock appearance prefs.
//
// Forward-compatible: widgets added to WIDGETS later are merged into an existing
// saved layout (appended, using their default visibility); saved entries for
// removed widgets are dropped. So shipping a new widget never strands a layout.

export type WidgetSpan = "sm" | "lg" | "full";
export type WidgetRole = "admin" | "board";

export interface WidgetDef {
  key: string;
  title: string;
  description: string;
  icon: string; // lucide icon name (without the i-lucide- prefix)
  span: WidgetSpan;
  /** Roles that may see this widget. Empty/undefined = everyone on the page. */
  roles?: WidgetRole[];
  /** Whether it's shown by default in a fresh layout. */
  defaultVisible: boolean;
}

interface LayoutEntry {
  key: string;
  visible: boolean;
}

// The admin dashboard catalog. `span` drives the grid column span; the matching
// content is rendered by DashboardPage via a switch on `key`.
export const DASHBOARD_WIDGETS: WidgetDef[] = [
  { key: "quick-actions", title: "Quick Actions", description: "Shortcuts to the things admins do most.", icon: "zap", span: "full", defaultVisible: true },
  { key: "stats", title: "Key Stats", description: "Documents, units, members, and emails at a glance.", icon: "layout-dashboard", span: "full", defaultVisible: true },
  { key: "members-donut", title: "Owners vs Tenants", description: "Membership split for your community.", icon: "pie-chart", span: "sm", defaultVisible: true },
  { key: "activity-timeline", title: "Activity Timeline", description: "Recent community activity over time.", icon: "activity", span: "sm", defaultVisible: true },
  { key: "email-activity", title: "Email Activity", description: "Sends, deliveries, and opens over the last week.", icon: "line-chart", span: "sm", defaultVisible: true },
  { key: "recent-documents", title: "Recent Documents", description: "The latest published documents.", icon: "file-text", span: "sm", defaultVisible: true },
  { key: "recent-emails", title: "Recent Emails", description: "Your latest communications and their status.", icon: "mail", span: "sm", defaultVisible: true },
  { key: "email-engagement", title: "Email Engagement", description: "Open and click rates from delivered mail.", icon: "bar-chart-3", span: "full", defaultVisible: false },
  { key: "channels", title: "Channels", description: "Jump into your internal board/admin chat.", icon: "messages-square", span: "full", defaultVisible: false },
];

const STORAGE_KEY = "dashboard-widgets-admin-v1";

const layout = ref<LayoutEntry[]>([]);
const isEditing = ref(false);
let initialized = false;

const defaultLayout = (): LayoutEntry[] =>
  DASHBOARD_WIDGETS.map((w) => ({ key: w.key, visible: w.defaultVisible }));

// Merge a saved layout with the live registry: keep saved order/visibility for
// known widgets, append any new widgets at their default visibility, drop unknown.
const reconcile = (saved: LayoutEntry[]): LayoutEntry[] => {
  const known = new Set(DASHBOARD_WIDGETS.map((w) => w.key));
  const out: LayoutEntry[] = saved.filter((e) => known.has(e.key));
  const present = new Set(out.map((e) => e.key));
  for (const w of DASHBOARD_WIDGETS) {
    if (!present.has(w.key)) out.push({ key: w.key, visible: w.defaultVisible });
  }
  return out;
};

const loadLayout = () => {
  if (!import.meta.client || initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutEntry[];
      if (Array.isArray(parsed)) {
        layout.value = reconcile(parsed);
        return;
      }
    }
  } catch {
    /* ignore corrupt prefs */
  }
  layout.value = defaultLayout();
};

const persist = () => {
  if (!import.meta.client) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.value));
};

export function useDashboardWidgets(opts?: { roles?: WidgetRole[] }) {
  // SSR renders the default layout; the client loads any saved layout on first
  // call. Callers should render the grid client-only to avoid a hydration diff.
  if (layout.value.length === 0) layout.value = defaultLayout();
  loadLayout();

  const userRoles = opts?.roles ?? ["admin"];
  const defByKey = (key: string) => DASHBOARD_WIDGETS.find((w) => w.key === key);
  const roleOk = (w: WidgetDef) =>
    !w.roles || w.roles.length === 0 || w.roles.some((r) => userRoles.includes(r));

  const visible = computed<WidgetDef[]>(() =>
    layout.value
      .filter((e) => e.visible)
      .map((e) => defByKey(e.key))
      .filter((w): w is WidgetDef => !!w && roleOk(w))
  );

  const hidden = computed<WidgetDef[]>(() =>
    layout.value
      .filter((e) => !e.visible)
      .map((e) => defByKey(e.key))
      .filter((w): w is WidgetDef => !!w && roleOk(w))
  );

  const toggleEdit = () => {
    isEditing.value = !isEditing.value;
  };

  const hide = (key: string) => {
    const e = layout.value.find((x) => x.key === key);
    if (e) {
      e.visible = false;
      persist();
    }
  };

  const show = (key: string) => {
    const e = layout.value.find((x) => x.key === key);
    if (e) {
      // Make it visible and move it to the end of the visible run.
      e.visible = true;
      layout.value = [...layout.value.filter((x) => x.key !== key), e];
      persist();
    }
  };

  // Move a visible widget left/right among its visible siblings.
  const move = (key: string, dir: -1 | 1) => {
    const order = visible.value.map((w) => w.key);
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    applyVisibleOrder(order);
  };

  // Drop `fromKey` onto the slot occupied by `toKey` (drag reorder).
  const reorder = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const order = visible.value.map((w) => w.key);
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    applyVisibleOrder(order);
  };

  // Rewrite the layout so the visible entries follow `order`; hidden entries keep
  // their relative positions appended after.
  const applyVisibleOrder = (order: string[]) => {
    const hiddenEntries = layout.value.filter((e) => !e.visible);
    const visibleEntries = order
      .map((k) => layout.value.find((e) => e.key === k))
      .filter((e): e is LayoutEntry => !!e);
    layout.value = [...visibleEntries, ...hiddenEntries];
    persist();
  };

  const reset = () => {
    layout.value = defaultLayout();
    persist();
  };

  return {
    DASHBOARD_WIDGETS,
    layout,
    visible,
    hidden,
    isEditing,
    toggleEdit,
    hide,
    show,
    move,
    reorder,
    reset,
  };
}
