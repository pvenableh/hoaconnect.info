<script setup lang="ts">
import type { PetRecord, UnitRecordMember } from "#core/app/composables/useUnitRecords";

const props = defineProps<{
  members: UnitRecordMember[];
  record?: PetRecord | null;
}>();
const emit = defineEmits<{ (e: "submit", payload: Record<string, any>): void; (e: "cancel"): void }>();

const { upload, getUrl } = useDirectusFiles();

const memberId = ref<string>(props.record?.member_id?.id || props.members[0]?.id || "");
const name = ref(props.record?.name || "");
const type = ref(props.record?.type || "dog");
const breed = ref(props.record?.breed || "");
const weight = ref(props.record?.weight || "");
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
    const res: any = await upload(file, { title: name.value || "Pet photo" });
    imageId.value = res?.id || res?.data?.id || null;
  } catch (err) {
    console.error("Pet image upload failed:", err);
  } finally {
    uploading.value = false;
  }
};

const canSubmit = computed(() => name.value.trim() && memberId.value);

const submit = () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  emit("submit", {
    member_id: memberId.value,
    name: name.value.trim(),
    type: type.value,
    breed: breed.value || null,
    weight: weight.value || null,
    image: imageId.value,
    start_date: startDate.value ? new Date(startDate.value).toISOString() : undefined,
  });
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-16 h-16 rounded-xl overflow-hidden t-bg-subtle flex items-center justify-center shrink-0 border t-border">
        <img v-if="imageUrl" :src="imageUrl" alt="" class="w-full h-full object-cover" />
        <Icon v-else name="lucide:paw-print" class="w-6 h-6 t-text-muted" />
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
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Name *</label>
        <Input v-model="name" placeholder="e.g. Bella" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Type</label>
        <select v-model="type" class="w-full px-3 py-2 border rounded-md bg-background text-sm capitalize">
          <option value="dog">Dog</option>
          <option value="cat">Cat</option>
          <option value="bird">Bird</option>
          <option value="reptile">Reptile</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Breed</label>
        <Input v-model="breed" placeholder="e.g. Labrador" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Weight</label>
        <Input v-model="weight" placeholder="e.g. 45 lbs" />
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
        {{ record ? "Save" : "Add pet" }}
      </Button>
    </div>
  </div>
</template>
