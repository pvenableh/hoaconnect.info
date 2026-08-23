<script setup lang="ts">
/**
 * Property manager portal root. Not a screen — it sends the manager straight
 * into the first area their admin granted them.
 *
 * It used to be a grid of cards, one per granted capability. For the common
 * case that is a click to choose from a list of one: most managers hold a
 * single grant, and the nav already carries the rest for those who hold more.
 * So the root resolves instead of asking. The only thing it still renders is
 * the two dead ends — no grants, or not a manager here at all — which are the
 * one case where there is genuinely nowhere to send anyone.
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

// Order is the landing priority: inquiries is the manager's actual inbox, so a
// manager who holds it lands there whatever else they were granted.
const MANAGER_AREAS = [
  { key: "inquiries", path: "/manage/inquiries" },
  { key: "directory", path: "/manage/directory" },
  { key: "communications", path: "/manage/communications" },
  { key: "documents", path: "/documents" },
] as const;

const home = computed(
  () => MANAGER_AREAS.find((a) => managerCan(a.key))?.path ?? null
);

// `replace` so Back leaves the portal rather than bouncing through this root.
if (home.value) await navigateTo(buildOrgPath(home.value), { replace: true });
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer>
      <div class="ios-card p-10 text-center t-text-muted">
        <Icon name="lucide:lock" class="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p v-if="isPropertyManagerOfCurrentDomain">
          You don't have any permissions yet. Ask the community admin to grant you access.
        </p>
        <p v-else>You don't have manager access to this community.</p>
      </div>
    </PageContainer>
  </div>
</template>
