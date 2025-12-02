<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster />
  </div>
</template>

<script setup>
import { Toaster } from "@/components/ui/sonner";

// Apply dynamic branding based on active organization
// Falls back to Property Flow defaults on main domain or when no custom branding
useOrgBranding();
</script>
