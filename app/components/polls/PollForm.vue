<script setup lang="ts">
import type { PollOption } from "~/composables/usePolls";

const emit = defineEmits<{ (e: "created", id: string): void; (e: "cancel"): void }>();

const { createPoll } = usePolls();

const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : `opt-${Math.floor(Math.random() * 1e9).toString(36)}`;

const title = ref("");
const description = ref("");
const options = ref<PollOption[]>([
  { id: genId(), label: "" },
  { id: genId(), label: "" },
]);
const allowMultiple = ref(false);
const isAnonymous = ref(false);
const closesAt = ref("");
const audience = ref("all");
const submitting = ref(false);

const addOption = () => options.value.push({ id: genId(), label: "" });
const removeOption = (idx: number) => {
  if (options.value.length > 2) options.value.splice(idx, 1);
};

const validOptions = computed(() => options.value.filter((o) => o.label.trim()));
const canSubmit = computed(() => title.value.trim() && validOptions.value.length >= 2);

const submit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const created = await createPoll({
      title: title.value.trim(),
      description: description.value || undefined,
      options: validOptions.value.map((o) => ({ id: o.id, label: o.label.trim() })),
      allow_multiple: allowMultiple.value,
      is_anonymous: isAnonymous.value,
      closes_at: closesAt.value || null,
      target_audience: audience.value,
      status: "open",
    });
    const id = (created as any)?.id;
    if (id) emit("created", id);
  } catch (e) {
    console.error("Failed to create poll:", e);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1.5">Question</label>
      <Input v-model="title" placeholder="e.g. Should we repaint the lobby?" />
    </div>

    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1.5">Description (optional)</label>
      <textarea
        v-model="description"
        rows="2"
        class="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none"
        placeholder="Add context for voters…"
      />
    </div>

    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1.5">Options</label>
      <div class="space-y-2">
        <div v-for="(opt, idx) in options" :key="opt.id" class="flex items-center gap-2">
          <Input v-model="opt.label" :placeholder="`Option ${idx + 1}`" class="flex-1" />
          <button
            type="button"
            class="t-text-muted hover:t-danger disabled:opacity-30"
            :disabled="options.length <= 2"
            @click="removeOption(idx)"
          >
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>
      <button type="button" class="mt-2 text-sm t-text-tertiary hover:t-text inline-flex items-center gap-1" @click="addOption">
        <Icon name="lucide:plus" class="w-4 h-4" /> Add option
      </button>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Closes (optional)</label>
        <Input v-model="closesAt" type="date" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1.5">Audience</label>
        <select v-model="audience" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
          <option value="all">Everyone</option>
          <option value="owners">Owners</option>
          <option value="tenants">Tenants</option>
          <option value="board_members">Board members</option>
        </select>
      </div>
    </div>

    <div class="flex flex-wrap gap-4">
      <label class="inline-flex items-center gap-2 text-sm t-text-secondary cursor-pointer">
        <input type="checkbox" v-model="allowMultiple" class="rounded t-border" />
        Allow multiple choices
      </label>
      <label class="inline-flex items-center gap-2 text-sm t-text-secondary cursor-pointer">
        <input type="checkbox" v-model="isAnonymous" class="rounded t-border" />
        Anonymous results
      </label>
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <Button variant="ghost" class="rounded-full" @click="emit('cancel')">Cancel</Button>
      <Button class="rounded-full" :disabled="!canSubmit || submitting" @click="submit">
        <Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        Publish poll
      </Button>
    </div>
  </div>
</template>
