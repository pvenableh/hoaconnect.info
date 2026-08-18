<script setup lang="ts">
// Custom-domain Board of Directors — a WORKSPACE page (auth chrome), matching
// the slug route [slug]/board.vue. Renders inside the sidebar/dock so it's not a
// chromeless public dump when reached from the People section.
definePageMeta({ middleware: ["auth", "subscription"], layout: "auth" });

const { activeHoa } = useActiveHoa();

interface BoardMemberTerm {
  id: string;
  title: string | null;
  term_start: string | null;
  term_end: string | null;
  icon: string | null;
  message: string | null;
  hoa_member: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

const { data: boardData, pending: boardPending } = await useAsyncData(
  `board-members-custom-domain`,
  async () => {
    if (!activeHoa.value?.slug) return null;
    return await $fetch<{ organizationId: string; boardMembers: BoardMemberTerm[] }>(
      `/api/hoa/board-members?slug=${activeHoa.value.slug}`
    );
  },
  { watch: [activeHoa] }
);

const boardMembers = computed(() => boardData.value?.boardMembers || []);

useSeoMeta({
  title: () =>
    activeHoa.value
      ? `Board of Directors - ${activeHoa.value.name}`
      : "Board of Directors",
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer class="space-y-8">
      <header class="pt-2">
        <p class="t-eyebrow mb-3">People</p>
        <h1 class="t-heading text-3xl sm:text-4xl font-medium tracking-tight t-text">
          Board of Directors
        </h1>
        <p class="t-text-secondary mt-2 max-w-2xl">
          Meet the dedicated volunteers who serve on our board and help guide our community.
        </p>
      </header>

      <div v-if="boardPending" class="flex items-center justify-center min-h-[300px]">
        <span class="spinner-ios spinner-ios--lg" role="status">
          <span class="sr-only">Loading…</span>
        </span>
      </div>

      <PagesBoardMembersSection v-else :board-members="boardMembers" :show-email="false" />
    </PageContainer>
  </div>
</template>
