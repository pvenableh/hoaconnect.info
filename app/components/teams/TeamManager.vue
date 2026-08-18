<script setup lang="ts">
import {
  DOMAIN_LABELS,
  type Team,
  type TeamMember,
  type TeamDomain,
} from "#core/app/composables/useTeams";

const {
  listAllTeams,
  listAllMembers,
  addTeam,
  setTeamDomain,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  teamId,
  memberUserId,
} = useTeams();
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const { buildOrgPath } = useOrgNavigation();
const { list: listOrgMembers } = useDirectusItems("hoa_members");

const teams = ref<Team[]>([]);
const members = ref<TeamMember[]>([]);
const loading = ref(true);
const busy = ref(false);

const DOMAINS = Object.keys(DOMAIN_LABELS) as TeamDomain[];

// New team form
const newName = ref("");
const newDomain = ref<TeamDomain>("none");

// Per-team add-member selection
const pickUser = ref<Record<string, string>>({});

interface OrgMember { id: string; first_name?: string; last_name?: string; user?: { id: string } | string | null; }
const orgMembers = ref<OrgMember[]>([]);

const load = async () => {
  loading.value = true;
  try {
    teams.value = (await listAllTeams()) as Team[];
    members.value = (await listAllMembers()) as TeamMember[];
    orgMembers.value = (await listOrgMembers({
      fields: ["id", "first_name", "last_name", "user.id"],
      filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "active" }, user: { _nnull: true } },
      sort: ["first_name"],
      limit: 500,
    })) as OrgMember[];
  } catch (e) {
    console.error("Failed to load teams:", e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const membersOf = (tid: string) => members.value.filter((m) => teamId(m) === tid);
const orgMemberUserId = (m: OrgMember) => (typeof m.user === "string" ? m.user : m.user?.id) || "";
const personName = (m: { first_name?: string; last_name?: string }) =>
  `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Member";
const rowName = (r: TeamMember) => {
  const u = typeof r.user === "object" ? r.user : null;
  const m = typeof r.member === "object" ? r.member : null;
  return personName(u || m || {});
};
const availableFor = (tid: string) => {
  const taken = new Set(membersOf(tid).map((m) => memberUserId(m)));
  return orgMembers.value.filter((m) => orgMemberUserId(m) && !taken.has(orgMemberUserId(m)));
};

const createTeam = async () => {
  if (!newName.value.trim()) return;
  busy.value = true;
  try {
    await addTeam(newName.value.trim(), newDomain.value);
    newName.value = "";
    newDomain.value = "none";
    await load();
  } finally {
    busy.value = false;
  }
};

const onSetDomain = async (t: Team, domain: TeamDomain) => {
  await setTeamDomain(t.id, domain);
  await load();
};

const onAddMember = async (t: Team) => {
  const uid = pickUser.value[t.id];
  if (!uid) return;
  busy.value = true;
  try {
    const picked = orgMembers.value.find((m) => orgMemberUserId(m) === uid);
    await addTeamMember(t.id, uid, picked?.id || null);
    pickUser.value[t.id] = "";
    await load();
  } finally {
    busy.value = false;
  }
};

const onRemoveMember = async (r: TeamMember) => {
  busy.value = true;
  try {
    await removeTeamMember(r.id);
    await load();
  } finally {
    busy.value = false;
  }
};

const onDeleteTeam = async (t: Team) => {
  if (!confirm(`Delete the "${t.name}" team?`)) return;
  busy.value = true;
  try {
    await deleteTeam(t.id);
    await load();
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Create team -->
    <div class="ios-card p-5">
      <h3 class="font-semibold t-text mb-3">Create a team</h3>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[180px]">
          <label class="block text-xs font-medium t-text-muted mb-1">Name</label>
          <Input v-model="newName" placeholder="e.g. Violations Committee" />
        </div>
        <div class="min-w-[160px]">
          <label class="block text-xs font-medium t-text-muted mb-1">Domain (optional)</label>
          <select v-model="newDomain" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
            <option v-for="d in DOMAINS" :key="d" :value="d">{{ DOMAIN_LABELS[d] }}</option>
          </select>
        </div>
        <Button class="rounded-full" :disabled="!newName.trim() || busy" @click="createTeam">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Create
        </Button>
      </div>
      <p class="text-xs t-text-muted mt-2">
        Pick a domain to give this team's members board-style controls on that
        request type (e.g. Violations → manage violation tickets).
      </p>
    </div>

    <div v-if="loading" class="py-12 flex justify-center"><div class="spinner-ios" /></div>

    <div v-else-if="!teams.length" class="py-12 text-center t-text-muted">
      No teams yet — create your first above.
    </div>

    <!-- Team cards -->
    <div v-else class="space-y-4">
      <div v-for="t in teams" :key="t.id" class="ios-card p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <NuxtLink
              :to="buildOrgPath(`/admin/teams/${t.id}`)"
              class="font-semibold t-text hover:underline inline-flex items-center gap-1"
            >
              {{ t.name }}
              <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5 t-text-muted" />
            </NuxtLink>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs t-text-muted">Domain:</span>
              <select
                :value="t.domain || 'none'"
                class="text-xs px-2 py-1 border rounded-md bg-background"
                @change="onSetDomain(t, ($event.target as HTMLSelectElement).value as TeamDomain)"
              >
                <option v-for="d in DOMAINS" :key="d" :value="d">{{ DOMAIN_LABELS[d] }}</option>
              </select>
            </div>
          </div>
          <button type="button" class="t-text-muted hover:text-red-600" :disabled="busy" @click="onDeleteTeam(t)">
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>

        <!-- Members -->
        <ul v-if="membersOf(t.id).length" class="space-y-1.5 mt-3">
          <li v-for="r in membersOf(t.id)" :key="r.id" class="flex items-center justify-between px-3 py-2 rounded-xl t-bg-subtle">
            <span class="text-sm t-text-secondary">
              {{ rowName(r) }}
              <span v-if="r.role === 'lead'" class="ml-1 text-[10px] font-medium text-amber-600 uppercase">Lead</span>
            </span>
            <button type="button" class="t-text-muted hover:text-red-600" :disabled="busy" @click="onRemoveMember(r)">
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </li>
        </ul>
        <p v-else class="text-sm t-text-muted italic mt-3">No members yet.</p>

        <!-- Add member -->
        <div class="flex items-center gap-2 mt-3">
          <select v-model="pickUser[t.id]" class="flex-1 px-3 py-2 border rounded-md bg-background text-sm">
            <option value="">Add a member…</option>
            <option v-for="m in availableFor(t.id)" :key="m.id" :value="orgMemberUserId(m)">{{ personName(m) }}</option>
          </select>
          <Button variant="outline" size="sm" class="rounded-full" :disabled="!pickUser[t.id] || busy" @click="onAddMember(t)">
            Add
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
