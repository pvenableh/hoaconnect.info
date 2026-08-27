<template>
  <div>
    <NuxtLayout>
      <NuxtPage :transition="pageTransition" />
    </NuxtLayout>
    <Toaster />
  </div>
</template>

<script setup>
import { Toaster } from "@/components/ui/sonner";

// Direction-aware page transition. `page-transition.global.ts` sets the name
// (page-forward / page-back / page) before each navigation; one reactive name
// keeps the leave + enter phases agreeing on direction under mode:out-in.
const pageTransitionName = useState("page-transition-name", () => "page");
const pageTransition = computed(() => ({
  name: pageTransitionName.value,
  mode: "out-in",
}));

// Apply dynamic branding based on active organization
// Falls back to HOA Connect defaults on main domain or when no custom branding
useOrgBranding();
</script>
