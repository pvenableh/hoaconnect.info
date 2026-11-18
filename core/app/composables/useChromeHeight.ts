// Publishes a piece of sticky chrome's rendered height as a custom property on
// <html>, so whatever sticks BELOW the chrome reads one number instead of
// hardcoding it.
//
// Two writers: the top bar (`--app-nav-h`, Nav.vue) and the section capsule
// (`--app-subnav-h`, SubNav.vue). theme-app.css adds them up as
// `--app-chrome-h`, which grouped table headers, the responsibilities map's
// rail, the dashboard's chart rail and the long-document tables of contents
// stick under. The bar's height is not a constant (an org's logo makes it
// taller) and the capsule comes and goes with the section, so it is measured.
//
// A missing element (the capsule on a page with no section pills) writes 0px,
// and the property is removed on unmount, so the CSS fallback takes over.
//
// Call it before any `await` in setup: it registers lifecycle hooks.

import type { Ref } from "vue";

export function useChromeHeight(el: Ref<HTMLElement | null>, property: string) {
  if (!import.meta.client) return;

  let ro: ResizeObserver | null = null;

  function write() {
    const height = el.value?.offsetHeight ?? 0;
    document.documentElement.style.setProperty(property, `${height}px`);
  }

  onMounted(() => {
    watch(
      el,
      (node) => {
        ro?.disconnect();
        ro = null;
        write();
        if (node && typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(write);
          ro.observe(node);
        }
      },
      { immediate: true, flush: "post" },
    );
  });

  onBeforeUnmount(() => {
    ro?.disconnect();
    ro = null;
    document.documentElement.style.removeProperty(property);
  });
}
