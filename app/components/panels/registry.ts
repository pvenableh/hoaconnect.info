/**
 * Panel registry — type → panel entry for `<AppSlideOverStack>`
 * (docs/spec-resource-scaffold.md).
 *
 * Each panel is a single-file Vue component under this directory that takes
 * `{ id, mode?, flipFrom?, page? }` and fetches its own data. Panels are
 * dynamically imported so unused ones stay out of the bundle.
 *
 * A RESOURCE's panel (the detail moment of plan §2.3) also names the
 * `useResource` key whose rows it shows, its index, and its full-page route.
 * One component, two presentations: a slide-over from the index
 * (`?slide=<type>:<id>`; full width on phones), and a full page for deep links
 * (`recordPath()`), where `AppResourceRecordPage` renders it with `page` set so
 * `AppSlideOverShell` draws `AppPageHeader` instead of its slide-over header.
 *
 * Adding a resource panel:
 *   1. Create `panels/<Entity>Panel.vue` with
 *      `defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null; page?: string | null }>()`.
 *   2. Wrap its content in `<AppSlideOverShell :title="…" :page="page">`.
 *   3. Add an entry below: `load`, and for a resource `resource`, `index`, `page`.
 *   4. For `page`, add the route file with the index's middleware
 *      (tests/components/panel-registry.test.ts checks the nav registry gates
 *      it as it gates the index).
 *   5. The index opens it through `useResource({ panel: "<type>" }).open(row)`.
 */
import type { Component } from "vue";
import { defineAsyncComponent } from "vue";

type PanelLoader = () => Promise<{ default: Component }>;

export interface PanelEntry {
  load: PanelLoader;
  /** The `useResource` key whose rows this panel shows. */
  resource?: string;
  /** Org-relative path of the resource's index ("/admin/payments"). */
  index?: string;
  /** Org-relative full-page route, with `:id` ("/admin/payments/charges/:id"). */
  page?: string;
}

export const PANELS: Record<string, PanelEntry> = {
  request: { load: () => import("./RequestPanel.vue") },
  task: { load: () => import("./TaskPanel.vue") },
  charge: {
    load: () => import("./ChargePanel.vue"),
    resource: "charges",
    index: "/admin/payments",
    page: "/admin/payments/charges/:id",
  },
  responsibility: {
    load: () => import("./ResponsibilityPanel.vue"),
    resource: "responsibilities",
    index: "/admin/responsibilities",
    page: "/admin/responsibilities/:id",
  },
};

const componentCache = new Map<string, Component>();

export function getPanelEntry(type: string): PanelEntry | null {
  return PANELS[type] ?? null;
}

export function getPanelComponent(type: string): Component | null {
  const entry = PANELS[type];
  if (!entry) return null;
  let comp = componentCache.get(type);
  if (!comp) {
    comp = defineAsyncComponent({
      loader: entry.load,
      loadingComponent: undefined,
      delay: 60,
    });
    componentCache.set(type, comp);
  }
  return comp;
}

export function hasPanel(type: string): boolean {
  return type in PANELS;
}

/** Org-relative full-page path of one record, or null when the panel has no page. */
export function recordPath(type: string, id: string): string | null {
  const page = PANELS[type]?.page;
  return page ? page.replace(":id", encodeURIComponent(id)) : null;
}
