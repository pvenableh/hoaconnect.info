<script setup lang="ts">
import { toast } from "vue-sonner";
import type { LeaseRecord, UnitRecordMember } from "#core/app/composables/useUnitRecords";
import { dateInputToTimestamp, timestampToDateInput } from "#core/shared/units/record-dates";
import { LEASE_DOCUMENT_MAX_BYTES, LEASE_DOCUMENT_TYPE } from "#core/shared/units/lease-requests";

const props = defineProps<{
  members: UnitRecordMember[];
  record?: LeaseRecord | null;
  /** Stores the signed lease and returns its id (useUnitRecords().uploadLeaseDocument). */
  upload: (file: File) => Promise<{ id: string; filename: string }>;
}>();
const emit = defineEmits<{ (e: "submit", payload: Record<string, any>): void; (e: "cancel"): void }>();

const { getAuthUrl } = useDirectusFiles();

const tenant = ref<string>(props.record?.tenant?.id || "");
const owner = ref<string>(props.record?.owner?.id || "");
const startDate = ref(timestampToDateInput(props.record?.start_date));
const endDate = ref(timestampToDateInput(props.record?.end_date));
const rent = ref<string>(props.record?.rent_amount != null ? String(props.record.rent_amount) : "");
const deposit = ref<string>(props.record?.deposit_amount != null ? String(props.record.deposit_amount) : "");
const status = ref(props.record?.status || "active");
const notes = ref(props.record?.notes || "");
const documentId = ref<string | null>(props.record?.document || null);
const documentName = ref<string>(props.record?.document ? "Current document" : "");
const uploading = ref(false);
const submitting = ref(false);

// Only the saved document opens: a new upload is a record's file that no
// record names yet, and the app serves it once a lease does (lease-documents.ts).
const documentUrl = computed(() =>
  documentId.value && documentId.value === props.record?.document ? getAuthUrl(documentId.value) : null
);

const fileInput = ref<HTMLInputElement | null>(null);
const onFile = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.type !== LEASE_DOCUMENT_TYPE) {
    toast.error("The signed lease has to be a PDF.");
    return;
  }
  if (file.size > LEASE_DOCUMENT_MAX_BYTES) {
    toast.error("That PDF is over 4 MB. Save a smaller copy and try again.");
    return;
  }
  uploading.value = true;
  try {
    const res = await props.upload(file);
    documentId.value = res.id;
    documentName.value = res.filename;
  } catch (err: any) {
    toast.error(err?.data?.message || "Couldn't upload the lease");
  } finally {
    uploading.value = false;
  }
};

const canSubmit = computed(() => !!tenant.value && !uploading.value);

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
    start_date: dateInputToTimestamp(startDate.value) ?? undefined,
    end_date: dateInputToTimestamp(endDate.value),
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
        <DateInput v-model="startDate" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">End date</label>
        <DateInput v-model="endDate" />
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
        <div class="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" class="shrink-0" :disabled="uploading" @click="fileInput?.click()">
            <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:paperclip'" class="w-4 h-4" :class="{ 'animate-spin': uploading }" />
            {{ documentId ? "Replace" : "Choose the PDF" }}
          </Button>
          <span class="text-sm t-text-muted truncate">{{ uploading ? "Uploading…" : documentName || "No file chosen" }}</span>
          <input ref="fileInput" type="file" accept="application/pdf" class="hidden" @change="onFile" />
        </div>
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
