<script setup lang="ts">
/** HomeTeamQueue — items waiting in the helper areas a team member works. */
import type { RoleContext } from "#core/shared/roles/role-context";
import { overdueProjectCount, teamQueueRows, unassignedJobCount } from "#core/shared/home/team-queue";

const props = defineProps<{ roleContext: RoleContext | null | undefined }>();
const orgId = useState<string | null>("selectedOrgId", () => null);
const { buildOrgPath } = useOrgNavigation();

const docsApi = useDirectusItems("hoa_documents");
const pollsApi = useDirectusItems("hoa_polls");
const { data: counts } = useAsyncData(
  () => `team-home-queue-${orgId.value}`,
  async () => {
    const helps = props.roleContext?.helps ?? [];
    const out: Record<string, number> = {};
    if (!orgId.value) return out;
    const count = async (api: { list: (o: any) => Promise<any[]> }, status: string) =>
      (await api.list({ fields: ["id"], filter: { organization: { _eq: orgId.value }, status: { _eq: status } }, limit: 200 }).catch(() => [])).length;
    if (helps.includes("documents")) out.documents = await count(docsApi, "draft");
    if (helps.includes("feedback")) out.feedback = await count(pollsApi, "open");
    // Projects and the register go through their routes, which check the helper grant.
    const today = new Date().toISOString().slice(0, 10);
    const [projects, register] = await Promise.all([
      helps.includes("projects")
        ? $fetch<any[]>("/api/org/projects", { query: { orgId: orgId.value, parent: "none" } }).catch(() => [])
        : Promise.resolve(null),
      helps.includes("responsibilities")
        ? $fetch<{ responsibilities: any[] }>("/api/org/responsibilities", { query: { orgId: orgId.value } }).catch(() => ({ responsibilities: [] }))
        : Promise.resolve(null),
    ]);
    if (projects) out.projects = overdueProjectCount(projects, today);
    if (register) out.responsibilities = unassignedJobCount(register.responsibilities);
    return out;
  },
  { watch: [orgId], server: false, default: () => ({}) as Record<string, number> },
);
const rows = computed(() => teamQueueRows(props.roleContext?.helps ?? [], counts.value ?? {}));
</script>

<template>
  <AppCard v-if="rows.length" class="overflow-hidden py-0" data-testid="home-team-queue">
    <ul class="divide-y">
      <li v-for="r in rows" :key="r.area">
        <NuxtLink :to="buildOrgPath(r.path)" class="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/50" data-testid="home-queue-area">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium t-text">{{ r.label }}</span>
            <span class="block truncate text-sm t-text-muted">{{ r.text }}</span>
          </span>
          <Icon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 t-text-muted" />
        </NuxtLink>
      </li>
    </ul>
  </AppCard>
</template>
