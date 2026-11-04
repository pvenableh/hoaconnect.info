<script setup lang="ts">
/**
 * InstallCard — invites the member to put HOA Connect on their Home Screen
 * (Phase 6). Shown on the resident portal and the admin dashboard.
 *
 *  - Android / desktop Chrome: one button fires the browser's own install dialog.
 *  - iOS Safari: there is no prompt API, so the Share → Add to Home Screen steps.
 *  - Already installed, other browsers, or dismissed on this build: renders nothing.
 *
 * Dismissal is per build (see useInstallPrompt) — a deploy is a fair moment to
 * ask again, and a member who dismissed isn't nagged between deploys.
 */
const { mode, visible, dismiss, install } = useInstallPrompt();
const busy = ref(false);

async function onInstall() {
  busy.value = true;
  try {
    await install();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <WidgetGlass
    v-if="visible"
    accent="blue"
    class="relative"
    data-testid="install-card"
    role="region"
    aria-label="Install HOA Connect"
  >
    <button
      type="button"
      class="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full t-text-secondary hover:t-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Dismiss"
      data-testid="install-card-dismiss"
      @click="dismiss"
    >
      <Icon name="i-lucide-x" class="h-4 w-4" />
    </button>

    <div class="flex items-start gap-4 pr-8">
      <span class="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl t-bg-subtle">
        <Icon name="i-lucide-smartphone" class="h-5 w-5 t-text-accent" />
      </span>
      <div class="min-w-0 space-y-2">
        <h2 class="t-heading text-base font-medium t-text">Add HOA Connect to your {{ mode === 'ios' ? 'Home Screen' : 'device' }}</h2>
        <p class="text-sm t-text-secondary">
          Open it like any other app, and get reminders and notices on your phone even when it isn't open.
        </p>

        <ol v-if="mode === 'ios'" class="list-decimal space-y-1 pl-5 text-sm t-text-secondary" data-testid="install-card-ios-steps">
          <li>Tap the <strong class="t-text">Share</strong> button in Safari's toolbar.</li>
          <li>Choose <strong class="t-text">Add to Home Screen</strong>.</li>
          <li>Tap <strong class="t-text">Add</strong>, then open HOA Connect from your Home Screen.</li>
        </ol>

        <div v-else class="pt-1">
          <Button size="sm" :disabled="busy" data-testid="install-card-install" @click="onInstall">
            <Icon name="i-lucide-download" class="h-4 w-4" />
            Install app
          </Button>
        </div>
      </div>
    </div>
  </WidgetGlass>
</template>
