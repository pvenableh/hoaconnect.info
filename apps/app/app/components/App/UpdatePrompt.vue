<script setup lang="ts">
// AppUpdatePrompt — "a new version is available" banner.
//
// Driven by useAppVersion() (singleton poller in core). When a newer deployment is
// detected, a glass card springs up bottom-center offering a one-tap refresh. The
// poller is inert in dev/SSR, so this renders nothing there. Reduced-motion users get
// the card without the spring (CSS media query below).
const { updateAvailable, version, dismissed, reloadForUpdate } = useAppVersion();

// Detection lives in the app-update plugin so it runs for the whole session, not
// just while this banner is mounted — a backgrounded PWA has to be able to
// update itself on a screen where the banner never rendered.
//
// `dismissed` is shared state, not local: waving the banner away should stick
// across route changes (this component remounts), and the plugin clears the
// decision by reloading when the user next backgrounds the app.
const show = computed(() => updateAvailable.value && !dismissed.value);
</script>

<template>
  <Teleport to="body">
    <Transition name="update-prompt">
      <div
        v-if="show"
        class="app-update-prompt glass-surface glass-surface--strong"
        role="status"
        aria-live="polite"
      >
        <span class="app-update-prompt__icon" aria-hidden="true">
          <Icon name="i-lucide-sparkles" class="size-4" />
        </span>
        <div class="app-update-prompt__copy">
          <p class="app-update-prompt__title">A new version is available</p>
          <p class="app-update-prompt__sub">Refresh to get the latest — v{{ version }}</p>
        </div>
        <div class="app-update-prompt__actions">
          <button
            type="button"
            class="app-update-prompt__btn app-update-prompt__btn--primary"
            @click="reloadForUpdate()"
          >
            Refresh
          </button>
          <button
            type="button"
            class="app-update-prompt__btn app-update-prompt__btn--ghost"
            aria-label="Dismiss"
            @click="dismissed = true"
          >
            Later
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-update-prompt {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* Sit above the floating dock + iOS home indicator (dock is bottom-center). */
  bottom: calc(env(safe-area-inset-bottom, 0px) + 6rem);
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  width: min(28rem, calc(100vw - 2rem));
  padding: 0.75rem 0.875rem 0.75rem 1rem;
  border-radius: 1rem;
  color: var(--theme-text-primary);
}

.app-update-prompt__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 9999px;
  color: var(--theme-accent-primary);
  background: color-mix(in srgb, var(--theme-accent-primary) 14%, transparent);
}

.app-update-prompt__copy {
  min-width: 0;
  flex: 1;
}

.app-update-prompt__title {
  font-weight: 600;
  font-size: 0.875rem;
  line-height: 1.2;
}

.app-update-prompt__sub {
  font-size: 0.75rem;
  line-height: 1.3;
  color: var(--theme-text-secondary);
  margin-top: 0.0625rem;
}

.app-update-prompt__actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.app-update-prompt__btn {
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.4375rem 0.875rem;
  transition: transform var(--motion-fast, 160ms) var(--spring, ease),
    background-color var(--motion-fast, 160ms) ease, opacity var(--motion-fast, 160ms) ease;
}

.app-update-prompt__btn:active {
  transform: scale(0.96);
}

.app-update-prompt__btn--primary {
  color: #fff;
  background: var(--theme-accent-primary);
}

.app-update-prompt__btn--primary:hover {
  background: var(--theme-accent-hover, var(--theme-accent-primary));
}

.app-update-prompt__btn--ghost {
  color: var(--theme-text-secondary);
  background: transparent;
}

.app-update-prompt__btn--ghost:hover {
  color: var(--theme-text-primary);
  background: color-mix(in srgb, var(--theme-text-primary) 8%, transparent);
}

/* Spring up from below; the slide-over stack uses the same --spring curve. */
.update-prompt-enter-active {
  transition: transform 420ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)),
    opacity 320ms ease;
}
.update-prompt-leave-active {
  transition: transform 240ms var(--spring-out, cubic-bezier(0.32, 0.72, 0, 1)),
    opacity 200ms ease;
}
.update-prompt-enter-from,
.update-prompt-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(1.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .update-prompt-enter-active,
  .update-prompt-leave-active {
    transition: opacity 160ms ease;
  }
  .update-prompt-enter-from,
  .update-prompt-leave-to {
    transform: translateX(-50%);
  }
  .app-update-prompt__btn:active {
    transform: none;
  }
}
</style>
