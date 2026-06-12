/**
 * Panel registry — type → async component map for `<AppSlideOverStack>`.
 *
 * Each panel is a single-file Vue component under this directory that takes
 * `{ id: string }` as its prop and fetches its own data. Panels are
 * dynamically imported so unused ones stay out of the bundle.
 *
 * Adding a new panel:
 *   1. Create `panels/<Entity>Panel.vue` with `defineProps<{ id: string }>()`.
 *   2. Wrap its content in `<AppSlideOverShell :title="…">`.
 *   3. Add an entry below mapping a stack-type string → loader.
 *   4. From the page that triggers it:
 *        const slide = useAppSlideOver("<type>");
 *        slide.open(entityId, { flipFrom: flipPayloadFrom(rowEl) });
 */
import type { Component } from "vue";
import { defineAsyncComponent } from "vue";

type PanelLoader = () => Promise<{ default: Component }>;

const REGISTRY: Record<string, PanelLoader> = {
  request: () => import("./RequestPanel.vue"),
  task: () => import("./TaskPanel.vue"),
};

const componentCache = new Map<string, Component>();

export function getPanelComponent(type: string): Component | null {
  const loader = REGISTRY[type];
  if (!loader) return null;
  let comp = componentCache.get(type);
  if (!comp) {
    comp = defineAsyncComponent({
      loader,
      loadingComponent: undefined,
      delay: 60,
    });
    componentCache.set(type, comp);
  }
  return comp;
}

export function hasPanel(type: string): boolean {
  return type in REGISTRY;
}
