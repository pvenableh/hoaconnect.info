<script setup lang="ts">
/**
 * HomeFormTracking — the admin's and board's tracking list for forms to sign:
 * per open form, who has signed (with a signed-copy PDF) and who has not. The
 * server route checks the admin or board hat for this organization
 * (`/api/org/forms/pending`); a refusal renders nothing.
 */
const props = defineProps<{ organizationId: string | null | undefined; upgradePrompt?: boolean }>();

interface Tracked {
  id: string;
  title: string;
  dueDate: string | null;
  reached: number;
  signed: Array<{ memberId: string; name: string; signedAt: string; signedName: string }>;
  pending: Array<{ memberId: string; name: string; residency: string }>;
}
const { data } = await useAsyncData(
  () => `home-form-tracking-${props.organizationId}`,
  async () =>
    props.organizationId
      ? await $fetch<{ forms: Tracked[] }>("/api/org/forms/pending", { query: { orgId: props.organizationId } }).catch(() => ({ forms: [] }))
      : { forms: [] },
  { watch: [() => props.organizationId], server: false, default: () => ({ forms: [] as Tracked[] }) }
);
// Admin home only: a plan without forms to sign sees one quiet upgrade line.
const { data: access } = await useAsyncData(
  () => `home-form-access-${props.organizationId}`,
  async () =>
    props.upgradePrompt && props.organizationId
      ? await $fetch<{ allowed: boolean; message: string | null }>("/api/org/forms/access", { query: { orgId: props.organizationId } }).catch(() => null)
      : null,
  { watch: [() => props.organizationId], server: false, default: () => null }
);
const forms = computed(() => data.value?.forms ?? []);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const copyHref = (f: Tracked, memberId: string) => `/api/org/forms/${f.id}/signed-copy?orgId=${props.organizationId}&memberId=${memberId}`;
</script>

<template>
  <AppCard v-if="access && !access.allowed" class="mb-4 p-4" data-testid="home-form-upgrade">
    <h2 class="t-eyebrow">Forms to sign</h2>
    <p class="text-sm t-text-muted">{{ access.message }}</p>
    <NuxtLink to="/settings/subscription" class="text-sm font-medium underline underline-offset-4">See plans</NuxtLink>
  </AppCard>
  <div v-if="forms.length" class="space-y-3" data-testid="home-form-tracking">
    <h2 class="t-eyebrow">Forms to sign</h2>
    <AppCard v-for="f in forms" :key="f.id" class="p-4" data-testid="home-form-tracking-form">
      <p class="text-sm font-medium t-text">{{ f.title }}</p>
      <p class="text-sm t-text-muted">{{ f.signed.length }} of {{ f.reached }} signed<span v-if="f.dueDate"> · due {{ day(f.dueDate) }}</span></p>
      <p v-if="!f.pending.length" class="text-sm t-text-muted">Everyone has signed.</p>
      <ul v-else class="mt-2 flex flex-wrap gap-1.5" aria-label="Not signed yet">
        <li v-for="p in f.pending" :key="p.memberId" class="rounded-full border px-2.5 py-0.5 text-xs t-text">{{ p.name }}</li>
      </ul>
      <ul v-if="f.signed.length" class="mt-3 divide-y text-sm" aria-label="Signed">
        <li v-for="s in f.signed" :key="s.memberId" class="flex items-center justify-between gap-3 py-1.5">
          <span class="min-w-0 truncate t-text">{{ s.name }} <span class="t-text-muted">· {{ day(s.signedAt) }}</span></span>
          <a :href="copyHref(f, s.memberId)" class="shrink-0 text-xs font-medium underline underline-offset-4" :aria-label="`Download signed copy for ${s.name}`" download>Signed copy</a>
        </li>
      </ul>
    </AppCard>
  </div>
</template>
