<template>
  <div>
    <NuxtLayout>
      <NuxtPage :transition="pageTransition" />
    </NuxtLayout>
    <Toaster />
    <!-- The one host for useConfirm(): every confirm/alert in the app renders here. -->
    <AppConfirmDialog />
  </div>
</template>

<script setup>
import { Toaster } from "@/components/ui/sonner";
import { settleTransition } from "#core/shared/motion";
import { PAGE_CUT } from "#core/shared/nav/page-transition";

// Direction-aware page transition. `page-transition.global.ts` sets the name
// (page-forward / page-back / page) before each navigation; one reactive name
// keeps the leave + enter phases agreeing on direction under mode:out-in.
// The settle hooks end each phase on transitionend OR a timeout, so a tab that
// never delivers transitionend (throttled, hidden, headless) cannot strand the
// out-in swap with the old page still leaving (core/shared/motion).
//
// `page-cut` (leaving a page that is still loading — see PAGE_CUT) swaps in
// default mode and ends both phases at once. The name is read when a phase
// RUNS, not when its hooks were made: the page on screen leaves through the
// hooks it entered with, which carry an older name.
const pageTransitionName = useState("page-transition-name", () => "page");
const settle = settleTransition();
const phase = (el, done) => (pageTransitionName.value === PAGE_CUT ? done() : settle(el, done));
const pageTransition = computed(() => ({
  name: pageTransitionName.value,
  // Explicit: an absent mode is filled with out-in from app.pageTransition.
  mode: pageTransitionName.value === PAGE_CUT ? "default" : "out-in",
  onLeave: phase,
  onEnter: phase,
}));

// Whether the page on screen is still loading, for the middleware's cut.
if (import.meta.client) {
  const nuxtApp = useNuxtApp();
  const pending = useState("page-transition-pending", () => false);
  nuxtApp.hook("page:start", () => {
    pending.value = true;
  });
  nuxtApp.hook("page:finish", () => {
    pending.value = false;
  });
}

// Apply dynamic branding based on active organization
// Falls back to HOA Connect defaults on main domain or when no custom branding
useOrgBranding();
</script>
