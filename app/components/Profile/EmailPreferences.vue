<script setup lang="ts">
/**
 * The Email section of the household page (Earnest parity round 3, Phase 3a):
 * everything a member controls about the mail they get, in one place.
 *
 *   · Community email from THIS community — the opt-out the unsubscribe link
 *     sets (`hoa_members.email_community_opt_out`, per membership).
 *   · A bounced address, said plainly, with what to do about it.
 *   · What is always sent (essential mail can't be unsubscribed).
 *   · The notification matrix — the master switch and the ten categories, email
 *     and in-app — shared with the bell and the account page.
 *
 * The footer's "Preferences" link lands here (`/{slug}/profile#email`).
 * Client-only reads; every switch saves optimistically and reverts on failure.
 */
import { toast } from "vue-sonner";
import { Switch } from "@/components/ui/switch";
import { ESSENTIAL_MAIL_EXAMPLES } from "#core/shared/email/email-class";
import type { NotificationCategory } from "#core/shared/notifications/preferences";

const props = defineProps<{ orgId: string | null | undefined; orgName?: string | null }>();

interface Subscription {
  available: boolean;
  member?: boolean;
  email?: string | null;
  communityOptOut?: boolean;
  communityOptOutAt?: string | null;
  bounced?: boolean;
  bouncedAt?: string | null;
}

const orgRef = computed(() => props.orgId || null);
const { data: sub, refresh } = useAsyncData(
  () => `email-subscription-${orgRef.value || "none"}`,
  async (): Promise<Subscription> => {
    if (!orgRef.value) return { available: false };
    try {
      return await $fetch<Subscription>("/api/user/email-subscription", { query: { organizationId: orgRef.value } });
    } catch {
      return { available: false };
    }
  },
  { server: false, watch: [orgRef] }
);

const prefs = useNotificationPreferences();
onMounted(() => void prefs.load());

const community = computed(() => sub.value?.available && sub.value.member ? !sub.value.communityOptOut : true);
const communityReady = computed(() => sub.value?.available === true && sub.value.member === true);
const savingCommunity = ref(false);

async function setCommunity(on: boolean) {
  if (!orgRef.value || !communityReady.value || savingCommunity.value) return;
  savingCommunity.value = true;
  const previous = sub.value ? { ...sub.value } : null;
  if (sub.value) sub.value = { ...sub.value, communityOptOut: !on, communityOptOutAt: on ? null : new Date().toISOString() };
  try {
    await $fetch("/api/user/email-subscription", {
      method: "PATCH",
      body: { organizationId: orgRef.value, communityOptOut: !on },
    });
    toast.success(on ? "You'll receive community email again" : "Community email turned off");
    void refresh();
  } catch (e: any) {
    if (previous) sub.value = previous;
    toast.error(e?.data?.statusMessage || "Couldn't save that. Try again.");
  } finally {
    savingCommunity.value = false;
  }
}

async function setMaster(on: boolean) {
  if (!(await prefs.setEmailMaster(on))) toast.error("Couldn't save that. Try again.");
}
async function setEmail(key: NotificationCategory, on: boolean) {
  if (!(await prefs.setEmailEnabled(key, on))) toast.error("Couldn't save that. Try again.");
}
async function setBell(key: NotificationCategory, on: boolean) {
  if (!(await prefs.setBellEnabled(key, on))) toast.error("Couldn't save that. Try again.");
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null;
const org = computed(() => props.orgName || "your community");
</script>

<template>
  <section id="email" class="glass-surface rounded-2xl p-5 sm:p-6 space-y-6 scroll-mt-24" data-email-preferences>
    <header class="space-y-1">
      <h2 class="text-base font-semibold t-text">Email</h2>
      <p class="text-sm t-text-muted">What {{ org }} sends you, and what you're notified about.</p>
    </header>

    <!-- Community mail: the unsubscribe link's switch, per community -->
    <div class="flex items-start justify-between gap-4" data-pref="community">
      <div class="min-w-0">
        <p class="text-sm font-medium t-text">Community email</p>
        <p class="text-sm t-text-muted">Newsletters, announcements and general news.</p>
        <p v-if="communityReady && sub?.communityOptOut && sub?.communityOptOutAt" class="text-xs t-text-muted mt-1">
          Off since {{ fmt(sub.communityOptOutAt) }}.
        </p>
        <p v-else-if="sub && !communityReady" class="text-xs t-text-muted mt-1" data-pref-unavailable>
          This setting isn't available for your community yet.
        </p>
      </div>
      <Switch
        :model-value="community"
        :disabled="!communityReady || savingCommunity"
        aria-label="Community email"
        @update:model-value="setCommunity"
      />
    </div>

    <div
      v-if="sub?.bounced"
      class="rounded-xl bg-destructive/10 text-destructive px-4 py-3 text-sm flex gap-2"
      role="status"
      data-pref="bounced"
    >
      <Icon name="lucide:mail-x" class="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        Mail to {{ sub.email || "your address" }} has been bouncing<template v-if="sub.bouncedAt">
        since {{ fmt(sub.bouncedAt) }}</template>, so nothing is being sent to it. Update your email on your
        account, then ask your board to clear it.
      </span>
    </div>

    <div class="rounded-xl t-bg-subtle px-4 py-3" data-pref="essential">
      <p class="text-xs font-medium uppercase tracking-wide t-text-muted">Always sent</p>
      <p class="mt-1 text-sm t-text-secondary">
        {{ ESSENTIAL_MAIL_EXAMPLES.join(" · ") }} — part of membership, so they can't be turned off.
      </p>
    </div>

    <!-- Notifications: master switch + the ten-category matrix -->
    <div class="space-y-3" data-pref="notifications">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium t-text">Notification emails</p>
          <p class="text-sm t-text-muted">Turn off to stop every notification email below.</p>
        </div>
        <Switch :model-value="prefs.emailMaster.value" aria-label="Notification emails" @update:model-value="setMaster" />
      </div>

      <div class="rounded-xl overflow-hidden t-bg-subtle">
        <div class="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-x-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide t-text-muted">
          <span>Category</span>
          <span class="text-center">In-app</span>
          <span class="text-center">Email</span>
        </div>
        <div
          v-for="c in prefs.categories"
          :key="c.key"
          class="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-x-2 px-4 py-2"
          :data-category="c.key"
        >
          <span class="text-sm t-text">{{ c.label }}</span>
          <span class="flex justify-center">
            <Switch
              :model-value="prefs.bellEnabled(c.key)"
              :aria-label="`${c.label} in-app`"
              @update:model-value="(v: boolean) => setBell(c.key, v)"
            />
          </span>
          <span class="flex justify-center">
            <Switch
              :model-value="prefs.emailEnabled(c.key)"
              :disabled="!prefs.emailMaster.value"
              :aria-label="`${c.label} email`"
              @update:model-value="(v: boolean) => setEmail(c.key, v)"
            />
          </span>
        </div>
      </div>
      <p class="text-xs t-text-muted">
        Digest emails are set on your
        <NuxtLink to="/account" class="underline underline-offset-2">account page</NuxtLink>.
      </p>
    </div>
  </section>
</template>
