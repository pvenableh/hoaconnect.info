<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UnitRecordsResponse, UnitRecordMember } from "#core/app/composables/useUnitRecords";

definePageMeta({
  middleware: ["admin-or-board", "subscription"],
  layout: "auth",
});

const route = useRoute();
const unitId = computed(() => route.params.id as string);

const { selectedOrgId } = await useSelectedOrg();
const { getUrl } = useDirectusFiles();
const {
  fetchRecords,
  split,
  createPet,
  updatePet,
  createVehicle,
  updateVehicle,
  createLease,
  updateLease,
  endRecord,
} = useUnitRecords(unitId);

const { data, pending, refresh, error } = await useAsyncData(
  () => `unit-records-${unitId.value}`,
  () => fetchRecords(),
  { watch: [unitId], server: false }
);

const records = computed<UnitRecordsResponse | null>(() => data.value || null);
const canManage = computed(() => !!records.value?.canManage);

// Members for the form pickers (admins only — they have Directus read access).
const { list: listMembers } = useDirectusItems("hoa_members");
const { data: members } = await useAsyncData(
  () => `unit-members-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return [] as UnitRecordMember[];
    const rows = await listMembers({
      fields: ["id", "first_name", "last_name", "member_type"],
      filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "active" } },
      sort: ["first_name", "last_name"],
      limit: -1,
    });
    return (rows || []) as UnitRecordMember[];
  },
  { watch: [selectedOrgId], server: false, default: () => [] as UnitRecordMember[] }
);

const occupants = computed(() => split(records.value?.occupants));
const pets = computed(() => split(records.value?.pets));
const vehicles = computed(() => split(records.value?.vehicles));
const leases = computed(() => split(records.value?.leases));

// ── Modal state ───────────────────────────────────────────────────────────────
type FormKind = "pet" | "vehicle" | "lease";
const showModal = ref(false);
const formKind = ref<FormKind>("pet");
const editing = ref<any | null>(null);

const openAdd = (kind: FormKind) => {
  formKind.value = kind;
  editing.value = null;
  showModal.value = true;
};
const openEdit = (kind: FormKind, item: any) => {
  formKind.value = kind;
  editing.value = item;
  showModal.value = true;
};

const modalTitle = computed(() => {
  const verb = editing.value ? "Edit" : "Add";
  return `${verb} ${formKind.value}`;
});

const onSubmit = async (payload: Record<string, any>) => {
  try {
    if (formKind.value === "pet") {
      editing.value ? await updatePet(editing.value.id, payload) : await createPet(payload as any);
    } else if (formKind.value === "vehicle") {
      editing.value ? await updateVehicle(editing.value.id, payload) : await createVehicle(payload as any);
    } else {
      editing.value ? await updateLease(editing.value.id, payload) : await createLease(payload as any);
    }
    toast.success(editing.value ? "Record updated" : "Record added");
    showModal.value = false;
    editing.value = null;
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Failed to save record");
  }
};

const onEnd = async (kind: FormKind, item: any) => {
  const label = kind === "lease" ? "Mark this lease ended?" : `Move out / end this ${kind}?`;
  if (!confirm(`${label} It will be archived (kept in history), not deleted.`)) return;
  try {
    await endRecord(kind, item.id);
    toast.success("Record ended and archived");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Failed to end record");
  }
};

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
const range = (s?: string | null, e?: string | null) => {
  if (!s && !e) return "";
  return `${fmtDate(s) || "—"} → ${e ? fmtDate(e) : "present"}`;
};
const money = (v?: number | null) =>
  v == null ? "" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
const memberName = (m?: UnitRecordMember | null) =>
  m ? `${m.first_name || ""} ${m.last_name || ""}`.trim() || "—" : "—";

const { buildOrgPath } = useOrgNavigation();
</script>

<template>
  <div class="ui-kit accent-violet min-h-screen t-bg">
    <PageContainer class="space-y-6">
      <!-- Back -->
      <BackLink :to="buildOrgPath('/admin/units')" label="All units" />

      <div v-if="pending" class="py-20 flex justify-center"><div class="spinner-ios" /></div>

      <div v-else-if="error" class="ios-card p-6 text-center">
        <Icon name="lucide:alert-circle" class="w-6 h-6 mx-auto mb-2 text-red-500" />
        <p class="t-text-secondary">{{ (error as any)?.data?.message || "You don’t have access to this unit." }}</p>
      </div>

      <template v-else-if="records">
        <!-- Header -->
        <header class="flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-3xl font-bold t-text">Unit {{ records.unit.unit_number }}</h1>
              <span class="text-xs px-2 py-0.5 rounded-full t-bg-subtle t-text-secondary capitalize">{{ records.unit.status }}</span>
            </div>
            <p class="text-sm t-text-muted mt-1">Resident records — current occupants and full history.</p>
          </div>
          <span v-if="records.access !== 'admin'" class="text-xs px-2.5 py-1 rounded-full t-bg-subtle t-text-muted inline-flex items-center gap-1">
            <Icon name="lucide:eye" class="w-3.5 h-3.5" /> View only
          </span>
        </header>

        <!-- Occupants -->
        <UnitsUnitRecordList title="Occupants" icon="users" :current="occupants.current" :history="occupants.history" :can-manage="false" hide-end>
          <template #item="{ item }">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium t-text truncate">
                  {{ memberName(item.member_id) }}
                  <span v-if="item.is_primary_unit" class="ml-1 text-[10px] uppercase tracking-wide text-violet-600">primary</span>
                </p>
                <p class="text-xs t-text-muted">
                  <span class="capitalize">{{ item.member_id?.member_type || "resident" }}</span>
                  <span v-if="item.ownership_percentage"> · {{ item.ownership_percentage }}% owner</span>
                  · {{ range(item.start_date, item.end_date) }}
                </p>
              </div>
            </div>
          </template>
        </UnitsUnitRecordList>

        <!-- Pets -->
        <UnitsUnitRecordList
          title="Pets" icon="paw-print" add-label="Pet"
          :current="pets.current" :history="pets.history" :can-manage="canManage"
          @add="openAdd('pet')" @edit="(i) => openEdit('pet', i)" @end="(i) => onEnd('pet', i)"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg overflow-hidden t-bg flex items-center justify-center shrink-0">
                <img v-if="item.image" :src="getUrl(item.image, { width: 72, height: 72, fit: 'cover' }) || ''" alt="" class="w-full h-full object-cover" />
                <Icon v-else name="lucide:paw-print" class="w-4 h-4 t-text-muted" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium t-text truncate">{{ item.name }} <span class="t-text-muted font-normal capitalize">· {{ item.type }}</span></p>
                <p class="text-xs t-text-muted truncate">
                  <span v-if="item.breed">{{ item.breed }} · </span>
                  <span v-if="item.weight">{{ item.weight }} · </span>
                  {{ memberName(item.member_id) }} · {{ range(item.start_date, item.end_date) }}
                </p>
              </div>
            </div>
          </template>
        </UnitsUnitRecordList>

        <!-- Vehicles -->
        <UnitsUnitRecordList
          title="Vehicles" icon="car" add-label="Vehicle"
          :current="vehicles.current" :history="vehicles.history" :can-manage="canManage"
          @add="openAdd('vehicle')" @edit="(i) => openEdit('vehicle', i)" @end="(i) => onEnd('vehicle', i)"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg overflow-hidden t-bg flex items-center justify-center shrink-0">
                <img v-if="item.image" :src="getUrl(item.image, { width: 72, height: 72, fit: 'cover' }) || ''" alt="" class="w-full h-full object-cover" />
                <Icon v-else name="lucide:car" class="w-4 h-4 t-text-muted" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium t-text truncate">{{ [item.year, item.make, item.model].filter(Boolean).join(" ") }}</p>
                <p class="text-xs t-text-muted truncate">
                  <span v-if="item.license_plate">{{ item.license_plate }} · </span>
                  <span v-if="item.parking_spot">Spot {{ item.parking_spot }} · </span>
                  {{ memberName(item.member_id) }} · {{ range(item.start_date, item.end_date) }}
                </p>
              </div>
            </div>
          </template>
        </UnitsUnitRecordList>

        <!-- Leases -->
        <UnitsUnitRecordList
          title="Leases" icon="file-text" add-label="Lease"
          :current="leases.current" :history="leases.history" :can-manage="canManage"
          @add="openAdd('lease')" @edit="(i) => openEdit('lease', i)" @end="(i) => onEnd('lease', i)"
        >
          <template #item="{ item }">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium t-text truncate">
                  {{ memberName(item.tenant) }}
                  <span v-if="item.owner" class="t-text-muted font-normal">· owner {{ memberName(item.owner) }}</span>
                </p>
                <p class="text-xs t-text-muted truncate">
                  <span class="capitalize">{{ item.status }}</span> · {{ range(item.start_date, item.end_date) }}
                  <span v-if="item.rent_amount"> · {{ money(item.rent_amount) }}/mo</span>
                </p>
              </div>
              <a v-if="item.document" :href="getUrl(item.document) || ''" target="_blank" class="text-xs text-blue-600 hover:underline shrink-0 inline-flex items-center gap-1">
                <Icon name="lucide:paperclip" class="w-3.5 h-3.5" /> Doc
              </a>
            </div>
          </template>
        </UnitsUnitRecordList>
      </template>

      <!-- Add/Edit modal -->
      <Dialog v-model:open="showModal">
        <DialogContent class="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle class="capitalize">{{ modalTitle }}</DialogTitle>
          </DialogHeader>
          <UnitsPetForm v-if="formKind === 'pet'" :members="members" :record="editing" @submit="onSubmit" @cancel="showModal = false" />
          <UnitsVehicleForm v-else-if="formKind === 'vehicle'" :members="members" :record="editing" @submit="onSubmit" @cancel="showModal = false" />
          <UnitsLeaseForm v-else :members="members" :record="editing" @submit="onSubmit" @cancel="showModal = false" />
        </DialogContent>
      </Dialog>
    </PageContainer>
  </div>
</template>
