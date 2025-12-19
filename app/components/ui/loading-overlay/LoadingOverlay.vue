<script setup lang="ts">
import { cn } from "@/lib/utils";

interface Props {
  /**
   * Whether to show the overlay
   */
  show?: boolean;
  /**
   * Loading message to display
   */
  message?: string;
  /**
   * Whether to use a full-screen overlay (default) or inline
   */
  fullscreen?: boolean;
  /**
   * Additional CSS classes
   */
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
  message: "Loading...",
  fullscreen: true,
});
</script>

<template>
  <Teleport to="body" :disabled="!fullscreen">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        :class="
          cn(
            'flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm z-50',
            fullscreen ? 'fixed inset-0' : 'absolute inset-0',
            props.class
          )
        "
        role="status"
        aria-live="polite"
      >
        <!-- Spinner -->
        <div
          class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"
        />
        <!-- Message -->
        <p v-if="message" class="text-sm text-muted-foreground font-medium">
          {{ message }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>
