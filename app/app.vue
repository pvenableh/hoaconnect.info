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

// Direction-aware page transition. `page-transition.global.ts` sets the name
// (page-forward / page-back / page) before each navigation; one reactive name
// keeps the leave + enter phases agreeing on direction under mode:out-in.
// The settle hooks end each phase on transitionend OR a timeout, so a tab that
// never delivers transitionend (throttled, hidden, headless) cannot strand the
// out-in swap with the old page still leaving (core/shared/motion).
const pageTransitionName = useState("page-transition-name", () => "page");
const settle = settleTransition();
const pageTransition = computed(() => ({
  name: pageTransitionName.value,
  mode: "out-in",
  onLeave: settle,
  onEnter: settle,
}));

// Apply dynamic branding based on active organization
// Falls back to HOA Connect defaults on main domain or when no custom branding
useOrgBranding();
</script>
