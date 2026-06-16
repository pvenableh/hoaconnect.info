<script setup lang="ts">
import type { LeaseRecord, UnitRecordMember } from "~/composables/useUnitRecords";

const props = defineProps<{
  members: UnitRecordMember[];
  record?: LeaseRecord | null;
}>();
const emit = defineEmits<{ (e: "submit", payload: Record<string, any>): void; (e: "cancel"): void }>();

const { upload, getUrl } = useDirectusFiles();

const tenant = ref<string>(props.record?.tenant?.id || "");
const owner = ref<string>(props.record?.owner?.id || "");
const startDate = ref(toDateInput(props.record?.start_date));
const endDate = ref(toDateInput(props.record?.end_date));
const rent = ref<string>(props.record?.rent_amount != null ? String(props.record.rent_amount) : "");
const deposit = ref<string>(props.record?.deposit_amount != null ? String(props.record.deposit_amount) : "");
const status = ref(props.record?.status || "active");
const notes = ref(props.record?.notes || "");
const documentId = ref<string | null>(props.record?.document || null);
const documentName = ref<string>(props.record?.document ? "Current document" : "");
const uploading = ref(false);
const submitting = ref(false);

function toDateInput(v?: string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

const documentUrl = computed(() => (documentId.value ? getUrl(documentId.value) : null));

const onFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const res: any = await upload(file, { title: file.name });
    documentId.value = res?.id || res?.data?.id || null;
    documentName.value = file.name;
  } catch (err) {
    console.error("Lease document upload failed:", err);
  } finally {
    uploading.value = false;
  }
};

const canSubmit = computed(() => !!tenant.value);

const submit = () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  emit("submit", {
    tenant: tenant.value,
    owner: owner.value || null,
    status: status.value,
    rent_amount: rent.value ? Number(rent.value) : null,
    deposit_amount: deposit.value ? Number(deposit.value) : null,
    document: documentId.value,
    notes: notes.value || null,
    start_date: startDate.value ? new Date(startDate.value).toISOString() : undefined,
    end_date: endDate.value ? new Date(endDate.value).toISOString() : null,
  });
};
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Tenant *</label>
        <select v-model="tenant" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
          <option value="" disabled>Select tenant…</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.first_name }} {{ m.last_name }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Owner / landlord</label>
        <select v-model="owner" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
          <option value="">—</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.first_name }} {{ m.last_name }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Start date</label>
        <Input v-model="startDate" type="date" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">End date</label>
        <Input v-model="endDate" type="date" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Rent (monthly)</label>
        <Input v-model="rent" type="number" inputmode="decimal" placeholder="0.00" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Deposit</label>
        <Input v-model="deposit" type="number" inputmode="decimal" placeholder="0.00" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Status</label>
        <select v-model="status" class="w-full px-3 py-2 border rounded-md bg-background text-sm capitalize">
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Signed lease (PDF)</label>
        <label class="w-full px-3 py-2 border rounded-md bg-background text-sm cursor-pointer flex items-center gap-2 t-text-secondary hover:t-text">
          <Icon v-if="uploading" name="lucide:loader-2" class="w-4 h-4 animate-spin shrink-0" />
          <Icon v-else name="lucide:paperclip" class="w-4 h-4 shrink-0" />
          <span class="truncate">{{ documentName || "Upload document…" }}</span>
          <input type="file" accept="application/pdf,image/*" class="hidden" @change="onFile" />
        </label>
        <a v-if="documentUrl" :href="documentUrl" target="_blank" class="text-xs text-blue-600 hover:underline mt-1 inline-block">View current</a>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1.5">Notes</label>
      <textarea v-model="notes" rows="2" class="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none" placeholder="Optional notes…" />
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <Button variant="ghost" class="rounded-full" @click="emit('cancel')">Cancel</Button>
      <Button class="rounded-full" :disabled="!canSubmit || submitting" @click="submit">
        <Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        {{ record ? "Save" : "Add lease" }}
      </Button>
    </div>
  </div>
</template>
