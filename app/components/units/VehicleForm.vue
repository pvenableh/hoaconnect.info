<script setup lang="ts">
import type { VehicleRecord, UnitRecordMember } from "#core/app/composables/useUnitRecords";

const props = defineProps<{
  members: UnitRecordMember[];
  record?: VehicleRecord | null;
}>();
const emit = defineEmits<{ (e: "submit", payload: Record<string, any>): void; (e: "cancel"): void }>();

const { upload, getUrl } = useDirectusFiles();

const memberId = ref<string>(props.record?.member_id?.id || props.members[0]?.id || "");
const make = ref(props.record?.make || "");
const model = ref(props.record?.model || "");
const year = ref(props.record?.year || "");
const licensePlate = ref(props.record?.license_plate || "");
const parkingSpot = ref(props.record?.parking_spot || "");
const imageId = ref<string | null>(props.record?.image || null);
const startDate = ref(toDateInput(props.record?.start_date));
const uploading = ref(false);
const submitting = ref(false);

function toDateInput(v?: string | null) {
  if (!v) return "";
  return new Date(v).toISOString().slice(0, 10);
}

const imageUrl = computed(() => (imageId.value ? getUrl(imageId.value, { width: 96, height: 96, fit: "cover" }) : null));

const onFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const res: any = await upload(file, { title: `${make.value} ${model.value}`.trim() || "Vehicle photo" });
    imageId.value = res?.id || res?.data?.id || null;
  } catch (err) {
    console.error("Vehicle image upload failed:", err);
  } finally {
    uploading.value = false;
  }
};

const canSubmit = computed(() => make.value.trim() && memberId.value);

const submit = () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  emit("submit", {
    member_id: memberId.value,
    make: make.value.trim(),
    model: model.value || null,
    year: year.value || null,
    license_plate: licensePlate.value || null,
    parking_spot: parkingSpot.value || null,
    image: imageId.value,
    start_date: startDate.value ? new Date(startDate.value).toISOString() : undefined,
  });
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <!-- allow-hairline-surface — a 64px photo WELL, not a card. The hairline is
           what shows the well is empty before a photo lands in it (the sibling
           empty state next to it is the same box, dashed). Swapping it for the
           refracted rim would put an inner top highlight across the top of the
           uploaded photo, which reads as glare on the image rather than an edge
           around the box. -->
      <div class="w-16 h-16 rounded-xl overflow-hidden t-bg-subtle flex items-center justify-center shrink-0 border t-border">
        <img v-if="imageUrl" :src="imageUrl" alt="" class="w-full h-full object-cover" />
        <Icon v-else name="lucide:car" class="w-6 h-6 t-text-muted" />
      </div>
      <label class="text-sm t-text-secondary cursor-pointer inline-flex items-center gap-1.5 hover:t-text">
        <Icon v-if="uploading" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
        <Icon v-else name="lucide:upload" class="w-4 h-4" />
        {{ imageId ? "Replace photo" : "Add photo" }}
        <input type="file" accept="image/*" class="hidden" @change="onFile" />
      </label>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Make *</label>
        <Input v-model="make" placeholder="e.g. Toyota" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Model</label>
        <Input v-model="model" placeholder="e.g. Camry" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Year</label>
        <Input v-model="year" placeholder="e.g. 2021" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">License plate</label>
        <Input v-model="licensePlate" placeholder="e.g. 7ABC123" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Parking spot</label>
        <Input v-model="parkingSpot" placeholder="e.g. P-14" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Responsible resident *</label>
        <select v-model="memberId" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
          <option v-for="m in members" :key="m.id" :value="m.id">
            {{ m.first_name }} {{ m.last_name }}
          </option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Registered since</label>
        <Input v-model="startDate" type="date" />
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <Button variant="ghost" class="rounded-full" @click="emit('cancel')">Cancel</Button>
      <Button class="rounded-full" :disabled="!canSubmit || submitting" @click="submit">
        <Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        {{ record ? "Save" : "Add vehicle" }}
      </Button>
    </div>
  </div>
</template>
