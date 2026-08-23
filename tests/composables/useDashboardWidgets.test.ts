import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useDashboardWidgets,
  DASHBOARD_WIDGETS,
} from "#core/app/composables/useDashboardWidgets";
import { useModules } from "#core/app/composables/useModules";

let activeHoa: ReturnType<typeof ref<Record<string, unknown> | null>>;

beforeEach(() => {
  localStorage.clear();
  activeHoa = ref<Record<string, unknown> | null>({ id: "org-1" });
  vi.stubGlobal("useActiveHoa", () => ({ activeHoa }));
  // The real module rule, not a fake — "a key that isn't in the map is ON" is
  // the half of it most likely to be got wrong at the gate.
  vi.stubGlobal("useModules", useModules);
  // Each test starts from a fresh default layout.
  useDashboardWidgets().reset();
});

const CHART_WIDGETS = ["collections", "requests-health", "occupancy"];

describe("the chart widgets ship default-off", () => {
  it("every one of them is defaultVisible: false", () => {
    // Shipping a widget default-on rearranges every existing dashboard in the
    // product without being asked — the landing widget registry made exactly
    // this mistake once already.
    for (const key of CHART_WIDGETS) {
      const def = DASHBOARD_WIDGETS.find((w) => w.key === key);
      expect(def, `${key} is missing from the registry`).toBeDefined();
      expect(def!.defaultVisible, `${key} must ship hidden`).toBe(false);
    }
  });

  it("none of them appear in a fresh layout's visible set", () => {
    const { visible } = useDashboardWidgets();
    const keys = visible.value.map((w) => w.key);
    for (const key of CHART_WIDGETS) expect(keys).not.toContain(key);
  });

  it("they are offered in the gallery instead", () => {
    const { hidden } = useDashboardWidgets();
    const keys = hidden.value.map((w) => w.key);
    for (const key of CHART_WIDGETS) expect(keys).toContain(key);
  });

  it("are appended after the widgets that already existed", () => {
    // reconcile() appends unknown-to-the-layout widgets at the end. Inserting
    // one mid-registry would still land it at the end of a SAVED layout while
    // sitting mid-grid for a new one — two different dashboards from one list.
    const order = DASHBOARD_WIDGETS.map((w) => w.key);
    const firstNew = Math.min(...CHART_WIDGETS.map((k) => order.indexOf(k)));
    expect(order.indexOf("channels")).toBeLessThan(firstNew);
  });
});

describe("module gating", () => {
  it("hides a widget whose module the community turned off", () => {
    activeHoa.value = { modules: { payments: false } };
    const { hidden, visible } = useDashboardWidgets();
    const keys = [...hidden.value, ...visible.value].map((w) => w.key);
    expect(keys).not.toContain("collections");
    // The others are untouched by the payments toggle.
    expect(keys).toContain("requests-health");
    expect(keys).toContain("occupancy");
  });

  it("keeps a widget when its module is missing from the map (missing = on)", () => {
    activeHoa.value = { modules: { something_else: false } };
    const { hidden } = useDashboardWidgets();
    expect(hidden.value.map((w) => w.key)).toContain("collections");
  });

  it("leaves ungated widgets alone whatever the module map says", () => {
    activeHoa.value = { modules: { payments: false, requests: false, directory: false } };
    const { visible } = useDashboardWidgets();
    expect(visible.value.map((w) => w.key)).toContain("quick-actions");
  });

  it("a shown-then-gated widget disappears rather than rendering empty", () => {
    const { show } = useDashboardWidgets();
    show("occupancy");
    expect(useDashboardWidgets().visible.value.map((w) => w.key)).toContain("occupancy");

    activeHoa.value = { modules: { directory: false } };
    expect(useDashboardWidgets().visible.value.map((w) => w.key)).not.toContain("occupancy");
  });
});
