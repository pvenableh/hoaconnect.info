<script setup lang="ts">
/**
 * Property manager portal home. Shows only the capabilities the admin granted
 * this manager (admins see everything). Each card links into a scoped area.
 */
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { managerCan, isPropertyManagerOfCurrentDomain } = useCurrentDomainAccess();

const cards = computed(() =>
  [
    managerCan("inquiries") && {
      label: "Inquiries",
      desc: "View and respond to community inquiries.",
      icon: "lucide:inbox",
      to: buildOrgPath("/manage/inquiries"),
    },
    managerCan("directory") && {
      label: "Directory",
      desc: "Browse the member directory.",
      icon: "lucide:users",
      to: buildOrgPath("/manage/directory"),
    },
    managerCan("documents") && {
      label: "Documents",
      desc: "Access community documents.",
      icon: "lucide:file-text",
      to: buildOrgPath("/documents"),
    },
    managerCan("communications") && {
      label: "Communications",
      desc: "Send emails to members.",
      icon: "lucide:mail",
      to: buildOrgPath("/manage/communications"),
    },
  ].filter(Boolean) as { label: string; desc: string; icon: string; to: string }[]
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold t-text">Property management</h1>
        <p class="t-text-muted mt-1">Your tools for this community.</p>
      </div>

      <div v-if="cards.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink v-for="c in cards" :key="c.to" :to="c.to" class="ios-card p-5 hover:shadow-md transition-shadow">
          <Icon :name="c.icon" class="h-6 w-6 t-text-accent mb-3" />
          <div class="font-medium t-text">{{ c.label }}</div>
          <p class="text-sm t-text-muted mt-1">{{ c.desc }}</p>
        </NuxtLink>
      </div>

      <div v-else class="ios-card p-10 text-center t-text-muted">
        <Icon name="lucide:lock" class="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p v-if="isPropertyManagerOfCurrentDomain">
          You don't have any permissions yet. Ask the community admin to grant you access.
        </p>
        <p v-else>You don't have manager access to this community.</p>
      </div>
    </PageContainer>
  </div>
</template>
