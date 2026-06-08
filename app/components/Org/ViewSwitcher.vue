<!--
  Persistent "View as" switcher for admins of the current org. Lets an admin flip
  between their own workspace, the resident (member) view, and the public landing
  in one click — the discoverable front-end for the ?as=member / ?preview query
  flags that app/pages/[slug]/index.vue reads.

  Admin-only and slug-scoped: renders only when viewing an org on the app domain
  (route has a slug) and the logged-in user is an admin of THAT org. Mounted in
  both the `auth` and `auth-blank` layouts so it rides along every org page —
  workspace, the member preview, and the public landing alike. Anchored
  bottom-right to clear the bottom-center docks and the editorial left rail.
-->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-[60] print:hidden"
    >
      <div
        class="flex items-center gap-1 rounded-full bg-zinc-900/85 px-1.5 py-1 text-xs text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md"
      >
        <span class="flex items-center gap-1 pl-1.5 pr-1 text-[10px] font-medium uppercase tracking-wide text-white/45">
          <Icon name="i-lucide-eye" class="size-3" />
          View
        </span>
        <NuxtLink :to="base" :class="segClass(mode === 'admin')">Admin</NuxtLink>
        <NuxtLink :to="`${base}?as=member`" :class="segClass(mode === 'member')">Member</NuxtLink>
        <NuxtLink :to="`${base}?preview`" :class="segClass(mode === 'public')">Public</NuxtLink>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const route = useRoute();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();

const slug = computed(() => route.params.slug as string | undefined);
const base = computed(() => (slug.value ? `/${slug.value}` : "/"));

// Which view the page is currently rendering, from the query flags index.vue reads.
const mode = computed<"admin" | "member" | "public">(() => {
  if (route.query.preview !== undefined) return "public";
  if (route.query.as === "member") return "member";
  return "admin";
});

// Admin-only tool, scoped to an org context on the app domain.
const visible = computed(() => !!slug.value && isAdminOfCurrentDomain.value);

const segClass = (active: boolean) =>
  [
    "rounded-full px-2.5 py-1 font-medium transition-colors",
    active
      ? "bg-white text-zinc-900"
      : "text-white/70 hover:text-white hover:bg-white/10",
  ].join(" ");
</script>
