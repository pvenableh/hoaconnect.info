<script setup lang="ts">
import type { Team, TeamMember } from "#core/app/composables/useTeams";
import { DOMAIN_LABELS } from "#core/app/composables/useTeams";
import type { ProjectRow } from "#core/app/composables/useProjects";
import type { TaskRow } from "#core/app/composables/useTasks";
import type { RequestRow } from "#core/app/composables/useRequests";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();
const teamIdParam = computed(() => String(route.params.id));

const {
  getTeam,
  listTeamMembers,
  setLead,
  removeTeamMember,
  teamProjects,
  TYPE_TO_DOMAIN,
} = useTeams();
const { list: listTasks } = useTasks();
const { list: listRequests } = useRequests();

const team = ref<Team | null>(null);
const members = ref<TeamMember[]>([]);
const projects = ref<ProjectRow[]>([]);
const tasks = ref<TaskRow[]>([]);
const requests = ref<RequestRow[]>([]);
const loading = ref(true);
const busy = ref(false);

type Tab = "roster" | "projects" | "requests" | "tasks";
const tab = ref<Tab>("roster");

// Request types that belong to this team's domain.
const domainTypes = computed(() => {
  const d = team.value?.domain;
  if (!d || d === "none") return [] as string[];
  return Object.entries(TYPE_TO_DOMAIN)
    .filter(([, dom]) => dom === d)
    .map(([t]) => t);
});

const personName = (p: { first_name?: string; last_name?: string } | null | undefined) =>
  `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || "Member";
const rowName = (r: TeamMember) => {
  const u = typeof r.user === "object" ? r.user : null;
  const m = typeof r.member === "object" ? r.member : null;
  return personName(u || m || {});
};

const loadRoster = async () => {
  members.value = (await listTeamMembers(teamIdParam.value)) as TeamMember[];
};

const load = async () => {
  loading.value = true;
  try {
    team.value = await getTeam(teamIdParam.value);
    if (!team.value) return;
    await loadRoster();
    const [proj, tsk] = await Promise.all([
      teamProjects(teamIdParam.value),
      listTasks({ team: teamIdParam.value }),
    ]);
    projects.value = (proj as ProjectRow[]) || [];
    tasks.value = (tsk as TaskRow[]) || [];
    if (domainTypes.value.length) {
      requests.value = (await listRequests({ type: { _in: domainTypes.value } })) as RequestRow[];
    } else {
      requests.value = [];
    }
  } catch (e) {
    console.error("Failed to load team:", e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const onToggleLead = async (r: TeamMember) => {
  busy.value = true;
  try {
    await setLead(r.id, r.role !== "lead");
    await loadRoster();
  } finally {
    busy.value = false;
  }
};

const onRemove = async (r: TeamMember) => {
  busy.value = true;
  try {
    await removeTeamMember(r.id);
    await loadRoster();
  } finally {
    busy.value = false;
  }
};

const openProject = (p: ProjectRow) => navigateToOrg(`/admin/projects/${p.id}`);

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "roster", label: "Roster", icon: "lucide:users" },
  { key: "projects", label: "Projects", icon: "lucide:folder-kanban" },
  { key: "requests", label: "Requests", icon: "lucide:inbox" },
  { key: "tasks", label: "Tasks", icon: "lucide:check-square" },
];

const leadCount = computed(() => members.value.filter((m) => m.role === "lead").length);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/admin/teams')" label="Teams" />

      <div v-if="loading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <div v-else-if="!team" class="py-16 text-center t-text-muted">
        Team not found.
      </div>

      <template v-else>
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1">Team</p>
            <h1 class="text-3xl font-semibold tracking-tight t-text flex items-center gap-2">
              <span
                v-if="team.color"
                class="inline-block w-3 h-3 rounded-full"
                :style="{ backgroundColor: team.color }"
              />
              {{ team.name }}
            </h1>
            <p class="text-sm t-text-muted mt-1">
              {{ DOMAIN_LABELS[(team.domain as keyof typeof DOMAIN_LABELS) || "none"] }}
              · {{ members.length }} member{{ members.length === 1 ? "" : "s" }}
              · {{ leadCount }} lead{{ leadCount === 1 ? "" : "s" }}
            </p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="inline-flex rounded-full t-bg-alt p-0.5">
          <button
            v-for="t in tabs"
            :key="t.key"
            type="button"
            class="px-3.5 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5"
            :class="tab === t.key ? 't-bg t-text shadow-sm' : 't-text-muted hover:t-text'"
            @click="tab = t.key"
          >
            <Icon :name="t.icon" class="w-4 h-4" />
            {{ t.label }}
          </button>
        </div>

        <!-- Roster -->
        <div v-show="tab === 'roster'" class="ios-card p-5">
          <p class="text-sm t-text-muted mb-3">
            Leads can manage this team's projects and approve its milestones.
          </p>
          <ul v-if="members.length" class="space-y-1.5">
            <li
              v-for="r in members"
              :key="r.id"
              class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl t-bg-alt"
            >
              <span class="text-sm t-text flex items-center gap-2">
                {{ rowName(r) }}
                <span
                  v-if="r.role === 'lead'"
                  class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                >Lead</span>
              </span>
              <div class="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  class="rounded-full text-xs"
                  :disabled="busy"
                  @click="onToggleLead(r)"
                >
                  {{ r.role === "lead" ? "Remove lead" : "Make lead" }}
                </Button>
                <button
                  type="button"
                  class="t-text-tertiary hover:text-red-600"
                  :disabled="busy"
                  title="Remove from team"
                  @click="onRemove(r)"
                >
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="text-sm t-text-muted italic">
            No members yet — add members from the
            <NuxtLink :to="buildOrgPath('/admin/teams')" class="underline">Teams</NuxtLink> page.
          </p>
        </div>

        <!-- Projects -->
        <div v-show="tab === 'projects'" class="space-y-3">
          <div v-if="projects.length" class="grid gap-3 sm:grid-cols-2">
            <ProjectsProjectCard
              v-for="p in projects"
              :key="p.id"
              :project="p"
              @open="openProject"
            />
          </div>
          <div v-else class="ios-card p-8 text-center t-text-muted">
            No projects owned by this team yet.
          </div>
        </div>

        <!-- Domain requests -->
        <div v-show="tab === 'requests'" class="ios-card p-5">
          <p v-if="!domainTypes.length" class="text-sm t-text-muted italic">
            This team has no request domain. Assign a domain on the Teams page to
            route requests here.
          </p>
          <template v-else>
            <ul v-if="requests.length" class="divide-y divide-[var(--theme-border-light)]">
              <li
                v-for="r in requests"
                :key="r.id"
                class="flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:opacity-80"
                @click="navigateToOrg(`/admin/requests?slide=request:${r.id}`)"
              >
                <span class="text-sm t-text truncate">{{ r.title || "Untitled request" }}</span>
                <span class="text-xs t-text-tertiary capitalize shrink-0">{{ r.status }}</span>
              </li>
            </ul>
            <p v-else class="text-sm t-text-muted italic">
              No open requests in this team's domain.
            </p>
          </template>
        </div>

        <!-- Tasks -->
        <div v-show="tab === 'tasks'" class="ios-card p-5">
          <ul v-if="tasks.length" class="divide-y divide-[var(--theme-border-light)]">
            <li
              v-for="t in tasks"
              :key="t.id"
              class="flex items-center justify-between gap-3 py-2.5"
            >
              <span class="text-sm t-text truncate flex items-center gap-2">
                <Icon
                  :name="t.status === 'completed' ? 'lucide:check-circle-2' : 'lucide:circle'"
                  class="w-4 h-4 shrink-0"
                  :class="t.status === 'completed' ? 'text-emerald-500' : 't-text-tertiary'"
                />
                {{ t.title || "Untitled task" }}
              </span>
              <span class="text-xs t-text-tertiary capitalize shrink-0">
                {{ (t.status || "").replace("_", " ") }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm t-text-muted italic">No tasks assigned to this team.</p>
        </div>
      </template>
    </PageContainer>
  </div>
</template>
