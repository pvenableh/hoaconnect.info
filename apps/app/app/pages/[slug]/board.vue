<script setup lang="ts">
// Board of Directors — a WORKSPACE page (like /rules): renders inside the auth
// layout chrome (sidebar/dock) so members and admins reach it from the People
// section without being dumped onto a chromeless public page. Logged-in only.
definePageMeta({ middleware: ["auth", "subscription"], layout: "auth" });

const route = useRoute();
const slug = computed(() => route.params.slug as string);

interface BoardPageOrganization {
  name: string;
}

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

const { data: organization } = await useAsyncData(
  `organization-${slug.value}`,
  () => $fetch<BoardPageOrganization>(`/api/hoa/find?slug=${slug.value}`)
);

const { data: boardData, pending } = await useAsyncData(
  `board-members-${slug.value}`,
  () =>
    $fetch<{ organizationId: string; boardMembers: BoardMemberTerm[] }>(
      `/api/hoa/board-members?slug=${slug.value}`
    )
);

const boardMembers = computed(() => boardData.value?.boardMembers || []);

useSeoMeta({
  title: () =>
    organization.value
      ? `Board of Directors - ${organization.value.name}`
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

      <div v-if="pending" class="flex items-center justify-center min-h-[300px]">
        <span class="spinner-ios spinner-ios--lg" role="status">
          <span class="sr-only">Loading…</span>
        </span>
      </div>

      <PagesBoardMembersSection v-else :board-members="boardMembers" :show-email="false" />
    </PageContainer>
  </div>
</template>
