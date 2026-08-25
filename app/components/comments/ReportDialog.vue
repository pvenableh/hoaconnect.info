<script setup lang="ts">
const emit = defineEmits<{
  (e: "submit", payload: { reason: string; details?: string }): void;
  (e: "cancel"): void;
}>();

const REASONS = [
  { value: "vulgar", label: "Vulgar / offensive" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "off_topic", label: "Off-topic" },
  { value: "other", label: "Other" },
];

const reason = ref("vulgar");
const details = ref("");
const submitting = ref(false);

const submit = () => {
  submitting.value = true;
  emit("submit", { reason: reason.value, details: details.value || undefined });
};
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      @click.self="emit('cancel')"
    >
      <div class="w-full max-w-md rounded-2xl t-bg-elevated shadow-xl ring-1 ring-[var(--theme-border-primary)] p-6 space-y-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:flag" class="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 class="font-semibold t-text">Report comment</h3>
            <p class="text-sm t-text-muted">
              Tell a moderator what's wrong. Reports are private.
            </p>
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium t-text-secondary">Reason</label>
          <div class="grid grid-cols-1 gap-1.5">
            <label
              v-for="r in REASONS"
              :key="r.value"
              class="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors"
              :class="reason === r.value ? 't-border-accent t-bg-subtle' : 't-border hover:t-bg-subtle'"
            >
              <input type="radio" :value="r.value" v-model="reason" class="accent-[var(--theme-accent-primary)]" />
              <span class="text-sm t-text-secondary">{{ r.label }}</span>
            </label>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-sm font-medium t-text-secondary">Details (optional)</label>
          <textarea
            v-model="details"
            rows="3"
            class="glass-field w-full px-3 py-2 rounded-xl text-sm resize-none"
            placeholder="Add any context…"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <Button variant="ghost" class="rounded-full" @click="emit('cancel')">Cancel</Button>
          <Button class="rounded-full" :disabled="submitting" @click="submit">
            <Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Submit report
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
