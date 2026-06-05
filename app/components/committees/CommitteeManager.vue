<script setup lang="ts">
import {
  COMMITTEE_LABELS,
  type CommitteeKey,
  type CommitteeMember,
} from "~/composables/useCommittees";

const { listAll, addMember, removeMember } = useCommittees();
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const { list: listMembers } = useDirectusItems("hoa_members");

const rows = ref<CommitteeMember[]>([]);
const loading = ref(true);
const busy = ref(false);

const COMMITTEES = Object.keys(COMMITTEE_LABELS) as CommitteeKey[];
const COMMITTEE_HINT: Record<CommitteeKey, string> = {
  violations: "Manage violation requests",
  arc: "Review architectural requests",
  maintenance: "Handle maintenance requests",
  finance: "Finance domain (payments)",
  general: "Complaints & board tasks",
};

// Add form
const formCommittee = ref<CommitteeKey>("violations");
const formUserId = ref<string>("");

interface OrgMember {
  id: string;
  first_name?: string;
  last_name?: string;
  user?: { id: string } | string | null;
}
const orgMembers = ref<OrgMember[]>([]);

const load = async () => {
  loading.value = true;
  try {
    rows.value = (await listAll()) as CommitteeMember[];
    orgMembers.value = (await listMembers({
      fields: ["id", "first_name", "last_name", "user.id"],
      filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "active" }, user: { _nnull: true } },
      sort: ["first_name"],
      limit: 500,
    })) as OrgMember[];
  } catch (e) {
    console.error("Failed to load committees:", e);
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const membersOf = (key: CommitteeKey) => rows.value.filter((r) => r.committee === key);

const memberUserId = (m: OrgMember) => (typeof m.user === "string" ? m.user : m.user?.id) || "";
const memberName = (m: { first_name?: string; last_name?: string }) =>
  `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Member";

const rowName = (r: CommitteeMember) => {
  const u = typeof r.user === "object" ? r.user : null;
  const m = typeof r.member === "object" ? r.member : null;
  return memberName(u || m || {});
};

const alreadyOn = computed(() =>
  new Set(
    rows.value
      .filter((r) => r.committee === formCommittee.value)
      .map((r) => (typeof r.user === "string" ? r.user : r.user?.id))
  )
);
const availableMembers = computed(() =>
  orgMembers.value.filter((m) => memberUserId(m) && !alreadyOn.value.has(memberUserId(m)))
);

const add = async () => {
  if (!formUserId.value) return;
  busy.value = true;
  try {
    const picked = orgMembers.value.find((m) => memberUserId(m) === formUserId.value);
    await addMember(formCommittee.value, formUserId.value, picked?.id || null);
    formUserId.value = "";
    await load();
  } catch (e) {
    console.error("Failed to add committee member:", e);
  } finally {
    busy.value = false;
  }
};

const onRemove = async (r: CommitteeMember) => {
  busy.value = true;
  try {
    await removeMember(r.id);
    await load();
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <!-- Add form -->
    <div class="ios-card p-5">
      <h3 class="font-semibold text-stone-900 mb-3">Add a committee member</h3>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs font-medium text-stone-500 mb-1">Committee</label>
          <select v-model="formCommittee" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
            <option v-for="key in COMMITTEES" :key="key" :value="key">{{ COMMITTEE_LABELS[key] }}</option>
          </select>
        </div>
        <div class="flex-1 min-w-[180px]">
          <label class="block text-xs font-medium text-stone-500 mb-1">Member</label>
          <select v-model="formUserId" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
            <option value="">Select a member…</option>
            <option v-for="m in availableMembers" :key="m.id" :value="memberUserId(m)">{{ memberName(m) }}</option>
          </select>
        </div>
        <Button class="rounded-full" :disabled="!formUserId || busy" @click="add">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add
        </Button>
      </div>
      <p class="text-xs text-stone-400 mt-2">
        Committee members get board-style controls on their domain's requests
        (status changes, assignment, internal notes) — without full board access.
      </p>
    </div>

    <div v-if="loading" class="py-12 flex justify-center"><div class="spinner-ios" /></div>

    <!-- Committee rosters -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="key in COMMITTEES" :key="key" class="ios-card p-5">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-semibold text-stone-900">{{ COMMITTEE_LABELS[key] }}</h3>
          <span class="text-xs text-stone-400">{{ membersOf(key).length }}</span>
        </div>
        <p class="text-xs text-stone-400 mb-3">{{ COMMITTEE_HINT[key] }}</p>

        <ul v-if="membersOf(key).length" class="space-y-1.5">
          <li
            v-for="r in membersOf(key)"
            :key="r.id"
            class="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50"
          >
            <span class="text-sm text-stone-700">
              {{ rowName(r) }}
              <span v-if="r.role === 'chair'" class="ml-1 text-[10px] font-medium text-amber-600 uppercase">Chair</span>
            </span>
            <button
              type="button"
              class="text-stone-400 hover:text-red-600"
              :disabled="busy"
              @click="onRemove(r)"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-stone-400 italic">No members yet.</p>
      </div>
    </div>
  </div>
</template>
