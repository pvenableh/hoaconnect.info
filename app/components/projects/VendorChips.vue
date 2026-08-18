<!--
  VendorChips — show + manage the vendors assigned to a project (M2M with a
  per-assignment role note). Reads the org's hoa_vendors directory for the
  picker; writes through useProjects.setVendors (elevated route).
-->
<script setup lang="ts">
import type { ProjectVendor } from "#core/app/composables/useProjects";
import { useProjects } from "#core/app/composables/useProjects";

const props = defineProps<{
  projectId: string;
  vendors: ProjectVendor[] | null | undefined;
  canWrite?: boolean;
}>();
const emit = defineEmits<{ (e: "changed"): void }>();

const { setVendors } = useProjects();
const { buildOrgPath } = useOrgNavigation();
const { list: listVendors } = useDirectusItems("hoa_vendors");
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

const adding = ref(false);
const saving = ref(false);
const pickVendor = ref("");
const pickRole = ref("");
const directory = ref<{ id: string; name: string; category?: string | null }[]>([]);

const current = computed<ProjectVendor[]>(() => props.vendors || []);

function vendorId(v: ProjectVendor): string {
  return typeof v.hoa_vendors_id === "object" ? v.hoa_vendors_id?.id || "" : v.hoa_vendors_id || "";
}
function vendorName(v: ProjectVendor): string {
  return typeof v.hoa_vendors_id === "object" ? v.hoa_vendors_id?.name || "Vendor" : "Vendor";
}

async function loadDirectory() {
  if (directory.value.length || !selectedOrgId.value) return;
  try {
    directory.value = (await listVendors({
      fields: ["id", "name", "category"],
      filter: { organization: { _eq: selectedOrgId.value } },
      sort: ["name"],
      limit: 200,
    })) as any[];
  } catch {
    directory.value = [];
  }
}

const available = computed(() => {
  const assigned = new Set(current.value.map(vendorId));
  return directory.value.filter((d) => !assigned.has(d.id));
});

function startAdd() {
  adding.value = true;
  loadDirectory();
}

/** Serialize current set + a mutation into the replace payload. */
function payload(extra: { vendor: string; role?: string | null }[] = [], dropId?: string) {
  const base = current.value
    .filter((v) => vendorId(v) !== dropId)
    .map((v) => ({ vendor: vendorId(v), role: v.role ?? null }));
  return [...base, ...extra];
}

async function addVendor() {
  if (!pickVendor.value) return;
  saving.value = true;
  try {
    await setVendors(props.projectId, payload([{ vendor: pickVendor.value, role: pickRole.value.trim() || null }]));
    pickVendor.value = "";
    pickRole.value = "";
    adding.value = false;
    emit("changed");
  } finally {
    saving.value = false;
  }
}

async function removeVendor(v: ProjectVendor) {
  saving.value = true;
  try {
    await setVendors(props.projectId, payload([], vendorId(v)));
    emit("changed");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <p class="text-sm font-semibold t-text-secondary">Vendors</p>
      <button
        v-if="canWrite && !adding"
        type="button"
        class="text-xs t-text-accent hover:opacity-80 inline-flex items-center gap-1"
        @click="startAdd"
      >
        <Icon name="lucide:plus" class="w-3.5 h-3.5" />Add
      </button>
    </div>

    <div v-if="!current.length && !adding" class="text-sm t-text-muted">No vendors assigned.</div>

    <div v-else class="flex flex-wrap gap-2">
      <span
        v-for="v in current"
        :key="v.id"
        class="inline-flex items-center gap-1.5 t-bg-subtle rounded-full pl-2.5 pr-1.5 py-1 text-sm"
      >
        <Icon name="lucide:storefront" class="w-3.5 h-3.5 t-text-muted" />
        <span class="t-text">{{ vendorName(v) }}</span>
        <span v-if="v.role" class="text-xs t-text-muted">· {{ v.role }}</span>
        <button
          v-if="canWrite"
          type="button"
          class="p-0.5 rounded-full hover:t-bg-elevated"
          :disabled="saving"
          aria-label="Remove vendor"
          @click="removeVendor(v)"
        >
          <Icon name="lucide:x" class="w-3 h-3 t-text-muted" />
        </button>
      </span>
    </div>

    <!-- Add picker -->
    <div v-if="adding" class="mt-3 flex flex-wrap items-center gap-2">
      <select v-model="pickVendor" class="t-input rounded-lg px-2.5 py-1.5 text-sm">
        <option value="">Select vendor…</option>
        <option v-for="d in available" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <input v-model="pickRole" type="text" placeholder="Role (optional)" class="t-input rounded-lg px-2.5 py-1.5 text-sm" />
      <Button size="sm" class="rounded-full" :disabled="!pickVendor || saving" @click="addVendor">Add</Button>
      <Button size="sm" variant="ghost" class="rounded-full" @click="adding = false">Cancel</Button>
      <NuxtLink
        v-if="!available.length && directory.length === 0"
        :to="buildOrgPath('/vendors')"
        class="text-xs t-text-accent"
      >Manage vendor directory →</NuxtLink>
    </div>
  </div>
</template>
