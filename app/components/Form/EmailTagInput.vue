<script setup lang="ts">
/**
 * EmailTagInput - A tag-style input for multiple email addresses
 *
 * Features:
 * - Enter key adds email as a tag
 * - Click tag to remove it
 * - Validates email format before adding
 * - Shows error for invalid emails
 * - Supports default email (e.g., logged-in user)
 */

const props = defineProps<{
  modelValue: string[];
  defaultEmail?: string;
  placeholder?: string;
  maxEmails?: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const inputValue = ref('');
const inputError = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const emails = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Add default email on mount if provided and not already in list
onMounted(() => {
  if (props.defaultEmail && emailRegex.test(props.defaultEmail) && !emails.value.includes(props.defaultEmail)) {
    emails.value = [props.defaultEmail, ...emails.value];
  }
});

function addEmail() {
  const email = inputValue.value.trim().toLowerCase();
  inputError.value = '';

  if (!email) return;

  // Validate email format
  if (!emailRegex.test(email)) {
    inputError.value = 'Please enter a valid email address';
    return;
  }

  // Check for duplicates
  if (emails.value.includes(email)) {
    inputError.value = 'This email is already added';
    return;
  }

  // Check max limit
  const maxLimit = props.maxEmails ?? 5;
  if (emails.value.length >= maxLimit) {
    inputError.value = `Maximum ${maxLimit} emails allowed`;
    return;
  }

  emails.value = [...emails.value, email];
  inputValue.value = '';
}

function removeEmail(emailToRemove: string) {
  emails.value = emails.value.filter(e => e !== emailToRemove);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addEmail();
  } else if (event.key === 'Backspace' && !inputValue.value && emails.value.length > 0) {
    // Remove last email when backspace is pressed on empty input
    emails.value = emails.value.slice(0, -1);
  }
}

function handlePaste(event: ClipboardEvent) {
  const pastedText = event.clipboardData?.getData('text');
  if (!pastedText) return;

  // Check if pasted content contains multiple emails (comma or newline separated)
  const potentialEmails = pastedText.split(/[,\n\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);

  if (potentialEmails.length > 1) {
    event.preventDefault();
    const maxLimit = props.maxEmails ?? 5;
    const validEmails = potentialEmails
      .filter(e => emailRegex.test(e) && !emails.value.includes(e))
      .slice(0, maxLimit - emails.value.length);

    if (validEmails.length > 0) {
      emails.value = [...emails.value, ...validEmails];
    }
  }
}
</script>

<template>
  <div class="space-y-2">
    <div
      class="flex flex-wrap gap-2 p-2 border rounded-md bg-background min-h-[42px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      :class="{ 'opacity-50 cursor-not-allowed': disabled }"
      @click="inputRef?.focus()"
    >
      <!-- Email Tags -->
      <TransitionGroup name="tag">
        <button
          v-for="email in emails"
          :key="email"
          type="button"
          :disabled="disabled"
          class="inline-flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors group"
          @click.stop="removeEmail(email)"
        >
          <span>{{ email }}</span>
          <Icon
            name="heroicons:x-mark"
            class="w-3.5 h-3.5 opacity-60 group-hover:opacity-100"
          />
        </button>
      </TransitionGroup>

      <!-- Input -->
      <input
        ref="inputRef"
        v-model="inputValue"
        type="email"
        :placeholder="emails.length === 0 ? (placeholder ?? 'Enter email and press Enter') : 'Add another...'"
        :disabled="disabled"
        class="flex-1 min-w-[200px] outline-none bg-transparent text-sm placeholder:text-muted-foreground"
        @keydown="handleKeydown"
        @paste="handlePaste"
        @blur="addEmail"
      />
    </div>

    <!-- Error Message -->
    <p v-if="inputError" class="text-sm text-destructive">
      {{ inputError }}
    </p>

    <!-- Helper Text -->
    <p v-else class="text-xs text-muted-foreground">
      Press Enter to add an email. Click a tag to remove it. Max {{ maxEmails ?? 5 }} addresses.
    </p>
  </div>
</template>

<style scoped>
.tag-enter-active,
.tag-leave-active {
  transition: all 0.2s ease;
}

.tag-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.tag-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.tag-move {
  transition: transform 0.2s ease;
}
</style>
