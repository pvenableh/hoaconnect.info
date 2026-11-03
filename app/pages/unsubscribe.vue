<script setup lang="ts">
/**
 * /unsubscribe?token=…&e=… — the footer link of every community email (Earnest
 * parity round 3, Phase 3a).
 *
 * No sign-in: the token names one member of one community. Opening the page
 * changes nothing — link scanners open links in mail — and one tap confirms.
 * It says what they will still receive (essential mail can't be unsubscribed),
 * offers the way back, and links into the portal's email preferences.
 */
definePageMeta({ layout: "auth-blank" });

interface UnsubscribeInfo {
  valid: boolean;
  org?: { name: string | null; slug: string | null };
  email?: string | null;
  optedOut?: boolean;
  optedOutAt?: string | null;
  bounced?: boolean;
  essential?: string[];
  preferencesUrl?: string;
}

const route = useRoute();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));

const { data, error, pending, refresh } = await useFetch<UnsubscribeInfo>("/api/email/unsubscribe", {
  query: { token },
  immediate: !!token.value,
  key: `unsubscribe-${token.value || "none"}`,
});

const working = ref(false);
const actionError = ref("");
/** What the member just did on this page, for the confirmation state. */
const justDid = ref<null | "unsubscribed" | "resubscribed">(null);

const orgName = computed(() => data.value?.org?.name || "your community");
const optedOut = computed(() => data.value?.optedOut === true);

async function act(action: "unsubscribe" | "resubscribe") {
  if (working.value) return;
  working.value = true;
  actionError.value = "";
  try {
    await $fetch("/api/email/unsubscribe", { method: "POST", body: { token: token.value, action } });
    justDid.value = action === "unsubscribe" ? "unsubscribed" : "resubscribed";
    await refresh();
  } catch (e: any) {
    actionError.value = e?.data?.statusMessage || e?.statusMessage || "Something went wrong. Try again in a moment.";
  } finally {
    working.value = false;
  }
}

useHead({ title: "Email preferences" });
</script>

<template>
  <AuthShell back-to="/" back-label="HOA Connect">
    <div class="glass-surface glass-surface--strong p-8 sm:p-10" data-unsubscribe>
      <!-- No token: someone followed a bare link (a test send, a CC copy). -->
      <div v-if="!token" class="text-center space-y-3" data-state="no-token">
        <Icon name="lucide:mail-question" class="w-8 h-8 mx-auto t-text-muted" />
        <h1 class="text-xl font-semibold t-text">Manage your email</h1>
        <p class="text-sm t-text-muted">
          This link doesn't say whose subscription it is. Sign in to choose which emails your
          community sends you.
        </p>
        <Button as-child class="rounded-full mt-2"><NuxtLink to="/auth/login">Sign in</NuxtLink></Button>
      </div>

      <div v-else-if="pending" class="py-10 text-center" data-state="loading">
        <Icon name="lucide:loader-2" class="w-6 h-6 mx-auto animate-spin t-text-muted" />
      </div>

      <!-- The read failed: say try again, not "dead link". -->
      <div v-else-if="error" class="text-center space-y-3" data-state="error">
        <Icon name="lucide:cloud-off" class="w-8 h-8 mx-auto t-text-muted" />
        <h1 class="text-xl font-semibold t-text">We couldn't load this</h1>
        <p class="text-sm t-text-muted">Your email settings didn't load. Try again in a moment.</p>
        <Button variant="outline" class="rounded-full" @click="refresh()">Try again</Button>
      </div>

      <div v-else-if="!data?.valid" class="text-center space-y-3" data-state="invalid">
        <Icon name="lucide:link-2-off" class="w-8 h-8 mx-auto t-text-muted" />
        <h1 class="text-xl font-semibold t-text">This link no longer works</h1>
        <p class="text-sm t-text-muted">
          Sign in to your community's portal to manage the email you receive.
        </p>
        <Button as-child class="rounded-full mt-2"><NuxtLink to="/auth/login">Sign in</NuxtLink></Button>
      </div>

      <div v-else class="space-y-6" :data-state="optedOut ? 'opted-out' : 'subscribed'">
        <header class="text-center space-y-1">
          <p class="text-[11px] uppercase tracking-[0.2em] t-text-muted">{{ orgName }}</p>
          <h1 class="text-xl font-semibold t-text">
            <template v-if="justDid === 'unsubscribed'">You're unsubscribed</template>
            <template v-else-if="justDid === 'resubscribed'">You're back on the list</template>
            <template v-else-if="optedOut">You're already unsubscribed</template>
            <template v-else>Unsubscribe from community email?</template>
          </h1>
          <p v-if="data.email" class="text-sm t-text-muted">{{ data.email }}</p>
        </header>

        <p class="text-sm t-text-secondary text-center">
          <template v-if="optedOut">
            You won't receive newsletters, announcements or general news from {{ orgName }}.
          </template>
          <template v-else>
            Newsletters, announcements and general news from {{ orgName }} will stop.
          </template>
        </p>

        <div class="rounded-2xl t-bg-subtle px-5 py-4" data-essential-list>
          <p class="text-xs font-medium uppercase tracking-wide t-text-muted">You'll still receive</p>
          <ul class="mt-2 space-y-1.5">
            <li v-for="item in data.essential" :key="item" class="flex items-center gap-2 text-sm t-text">
              <Icon name="lucide:check" class="w-4 h-4 t-text-muted shrink-0" />
              {{ item }}
            </li>
          </ul>
          <p class="mt-3 text-xs t-text-muted">
            These are part of membership, so they can't be unsubscribed.
          </p>
        </div>

        <p v-if="data.bounced" class="text-xs t-text-muted text-center">
          Mail to this address has been bouncing. If it works again, ask your board to clear it.
        </p>

        <p v-if="actionError" class="text-sm text-destructive text-center" role="alert">{{ actionError }}</p>

        <div class="flex flex-col items-center gap-3">
          <Button
            v-if="!optedOut"
            class="rounded-full w-full sm:w-auto sm:min-w-56"
            size="lg"
            :disabled="working"
            data-action="unsubscribe"
            @click="act('unsubscribe')"
          >
            <Icon v-if="working" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
            Unsubscribe
          </Button>
          <Button
            v-else
            variant="outline"
            class="rounded-full w-full sm:w-auto sm:min-w-56"
            size="lg"
            :disabled="working"
            data-action="resubscribe"
            @click="act('resubscribe')"
          >
            <Icon v-if="working" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
            {{ justDid === "unsubscribed" ? "Changed your mind? Resubscribe" : "Resubscribe" }}
          </Button>
          <NuxtLink
            v-if="data.preferencesUrl"
            :to="data.preferencesUrl"
            external
            class="text-sm t-text-muted underline underline-offset-4 hover:t-text"
            data-link="preferences"
          >
            Manage all email preferences
          </NuxtLink>
        </div>
      </div>
    </div>
  </AuthShell>
</template>
