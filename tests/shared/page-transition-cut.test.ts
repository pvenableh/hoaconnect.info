/**
 * Why PAGE_CUT exists (core/shared/nav/page-transition.ts) — Vue's half of the
 * blank-<main> bug, on the tree NuxtPage renders: <Transition> → <Suspense
 * :key> → the keyed page.
 *
 * When a navigation lands while the page on screen is still awaiting its setup,
 * Nuxt re-keys that Suspense (pages/runtime/page.js: `suspenseKey++`). Under
 * out-in the Transition then renders a placeholder until the old Suspense's
 * leave reports back — which it never does — so every later page lands in an
 * empty <main> until a full reload. In default mode (the cut) nothing waits on
 * that hand-off and the next page mounts.
 *
 * If the out-in case starts passing after a Vue upgrade, the stranding is fixed
 * upstream; the cut is then merely conservative, not wrong.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef, Suspense, Transition, type App, type Component } from "vue";

async function flush() {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const page = (label: string) => defineComponent({ name: `Page-${label}`, setup: () => () => h("section", label) });

let mounted: App | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = "";
});

function shell(mode: "out-in" | "default") {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const Loading = defineComponent({
    name: "loading",
    async setup() {
      await gate;
      return () => h("section", "loading");
    },
  });
  const view = shallowRef<{ key: string; page: Component; suspenseKey: number }>({
    key: "a",
    page: page("a"),
    suspenseKey: 0,
  });
  // app.vue's phases end on transitionend or a timeout; here they end at once.
  const phase = (_el: Element, done: () => void) => done();
  const main = document.createElement("main");
  document.body.appendChild(main);
  mounted = createApp({
    render: () =>
      h(Transition, { mode, onLeave: phase, onEnter: phase }, {
        default: () =>
          h(Suspense, { key: view.value.suspenseKey }, {
            default: () => h(view.value.page, { key: view.value.key }),
          }),
      }),
  });
  mounted.mount(main);
  return {
    main,
    Loading,
    release,
    go: async (next: { key: string; page: Component; suspenseKey: number }) => {
      view.value = next;
      await flush();
    },
  };
}

async function navigateMidLoad(mode: "out-in" | "default") {
  const s = shell(mode);
  await flush();
  expect(s.main.textContent).toBe("a");
  await s.go({ key: "b", page: s.Loading, suspenseKey: 0 });
  expect(s.main.textContent).toBe("a"); // b is still awaiting its setup
  await s.go({ key: "c", page: page("c"), suspenseKey: 1 }); // Nuxt re-keys mid-load
  s.release();
  await flush();
  const afterRace = s.main.textContent;
  await s.go({ key: "d", page: page("d"), suspenseKey: 1 }); // any later navigation
  return { afterRace, later: s.main.textContent };
}

describe("navigating while the page on screen is still loading", () => {
  it("out-in strands an empty <main> for good", async () => {
    expect(await navigateMidLoad("out-in")).toEqual({ afterRace: "", later: "" });
  });

  it("the cut (default mode) mounts the next page, and the one after", async () => {
    expect(await navigateMidLoad("default")).toEqual({ afterRace: "c", later: "d" });
  });
});
