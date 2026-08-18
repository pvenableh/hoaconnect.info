<script setup lang="ts">
/**
 * Property manager portal home. Shows only the capabilities the admin granted
 * this manager (admins see everything and keep the full admin UI — the nav
 * branches on admin ∪ grants). Each card links into a scoped area.
 *
 * NOTE: a dedicated agency multi-property switcher is deferred — there's no
 * cross-org PM mechanism yet; a PM works within one community via its slug.
 */
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { managerCan, isPropertyManagerOfCurrentDomain } = useCurrentDomainAccess();
const { currentOrg } = await useSelectedOrg();

const orgName = computed(() => currentOrg.value?.organization?.name || "this community");

const cards = computed(() =>
  [
    managerCan("inquiries") && {
      key: "inquiries",
      label: "Inquiries",
      desc: "View and respond to community inquiries.",
      icon: "lucide:inbox",
      to: buildOrgPath("/manage/inquiries"),
    },
    managerCan("directory") && {
      key: "directory",
      label: "Directory",
      desc: "Browse the member directory.",
      icon: "lucide:users",
      to: buildOrgPath("/manage/directory"),
    },
    managerCan("documents") && {
      key: "documents",
      label: "Documents",
      desc: "Access community documents.",
      icon: "lucide:file-text",
      to: buildOrgPath("/documents"),
    },
    managerCan("communications") && {
      key: "communications",
      label: "Communications",
      desc: "Send emails to members.",
      icon: "lucide:mail",
      to: buildOrgPath("/manage/communications"),
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    desc: string;
    icon: string;
    to: string;
  }[],
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <WidgetGlass strong>
        <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Property management</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">{{ orgName }}</h1>
        <p class="t-text-secondary mt-1">
          Your management tools for this community.
        </p>
      </WidgetGlass>

      <StaggerList
        v-if="cards.length"
        :items="cards"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        v-slot="{ item: c }"
      >
        <NuxtLink
          :to="c.to"
          class="group ios-card p-5 flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 transition-all tappable"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-xl t-bg-accent/15 t-text-accent mb-3">
            <Icon :name="c.icon" class="h-5 w-5" />
          </span>
          <div class="flex items-center gap-2">
            <span class="font-medium t-text">{{ c.label }}</span>
            <Icon
              name="lucide:arrow-right"
              class="h-4 w-4 ml-auto t-text-muted transition-transform group-hover:translate-x-0.5"
            />
          </div>
          <p class="text-sm t-text-muted mt-1">{{ c.desc }}</p>
        </NuxtLink>
      </StaggerList>

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
