<script setup lang="ts">
import {
  requestTypeList,
  getWorkflow,
  type RequestType,
} from "~/config/requestWorkflows";

const props = withDefaults(
  defineProps<{
    organizationId: string | null;
    /** restrict the type picker (members can't file violations) */
    allowedTypes?: RequestType[];
  }>(),
  { allowedTypes: () => ["maintenance", "arc", "complaint", "task", "violation"] }
);

const emit = defineEmits<{ (e: "created", id: string): void; (e: "cancel"): void }>();

const { createRequest } = useRequests();

const types = computed(() =>
  requestTypeList.filter((t) => props.allowedTypes.includes(t.type))
);

const form = ref({
  type: (types.value[0]?.type || "maintenance") as RequestType,
  title: "",
  description: "",
  priority: "normal",
  category: "",
  due_date: "",
});

const attachments = ref<string[]>([]);
const metadata = ref<Record<string, any>>({});
const isSubmitting = ref(false);

const workflow = computed(() => getWorkflow(form.value.type));
// Members fill non-internal metadata fields only.
const visibleFields = computed(() => workflow.value.metadata.filter((f) => !f.internal));

watch(
  () => form.value.type,
  () => {
    metadata.value = {};
  }
);

const canSubmit = computed(() => form.value.title.trim().length > 0);

const submit = async () => {
  if (!canSubmit.value || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    const created = await createRequest({
      type: form.value.type,
      title: form.value.title.trim(),
      description: form.value.description,
      priority: form.value.priority,
      category: form.value.category || undefined,
      due_date: form.value.due_date || null,
      attachments: attachments.value,
      metadata: metadata.value,
    });
    const id = (created as any)?.id;
    if (id) emit("created", id);
  } catch (e) {
    console.error("Failed to create request:", e);
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="space-y-5">
    <!-- Type picker -->
    <div>
      <label class="block text-sm font-medium text-stone-700 mb-2">Type</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in types"
          :key="t.type"
          type="button"
          @click="form.type = t.type"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors"
          :class="
            form.type === t.type
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
          "
        >
          <Icon :name="t.icon" class="w-4 h-4" />
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- Title -->
    <div>
      <label class="block text-sm font-medium text-stone-700 mb-1.5">Title</label>
      <Input v-model="form.title" placeholder="Brief summary" />
    </div>

    <!-- Description -->
    <div>
      <label class="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
      <ChannelsChannelEditor
        v-model="form.description"
        v-model:attachments="attachments"
        :organization-id="organizationId"
        :show-toolbar="true"
        allow-file-attachments
        placeholder="Describe the request, add photos or documents…"
      />
      <div v-if="attachments.length" class="flex flex-wrap gap-1.5 mt-2">
        <span
          v-for="id in attachments"
          :key="id"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-xs text-stone-600"
        >
          <Icon name="lucide:paperclip" class="w-3 h-3" /> Attachment
        </span>
      </div>
    </div>

    <!-- Priority + due date -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-stone-700 mb-1.5">Priority</label>
        <select
          v-model="form.priority"
          class="w-full px-3 py-2 border rounded-md bg-background text-sm"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-stone-700 mb-1.5">Due date</label>
        <Input v-model="form.due_date" type="date" />
      </div>
    </div>

    <!-- Type-specific metadata fields -->
    <div v-if="visibleFields.length" class="grid grid-cols-2 gap-4">
      <div v-for="field in visibleFields" :key="field.key">
        <label class="block text-sm font-medium text-stone-700 mb-1.5">{{ field.label }}</label>
        <textarea
          v-if="field.type === 'textarea'"
          v-model="metadata[field.key]"
          rows="2"
          class="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
        />
        <Input
          v-else
          v-model="metadata[field.key]"
          :type="
            field.type === 'date'
              ? 'date'
              : field.type === 'number' || field.type === 'currency'
              ? 'number'
              : 'text'
          "
        />
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" class="rounded-full" @click="emit('cancel')">Cancel</Button>
      <Button class="rounded-full" :disabled="!canSubmit || isSubmitting" @click="submit">
        <Icon v-if="isSubmitting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        Submit request
      </Button>
    </div>
  </div>
</template>
