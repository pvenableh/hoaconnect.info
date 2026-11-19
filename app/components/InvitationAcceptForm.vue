<script setup lang="ts">
/**
 * Accept an invitation to a community. What it asks depends on who opens it:
 *   - no HOA Connect account for the invited email: a name and a new password;
 *   - an account already (any community): that account's password;
 *   - signed in as that account: nothing, one button;
 *   - signed in as someone else: sign out first.
 * The rules live in core/server/utils/accept-invitation.ts.
 */
interface Props {
  token: string;
  /** Where to go after joining; defaults to the community's home. */
  redirectTo?: string;
}

const props = defineProps<Props>();

interface InvitationDetails {
  email: string;
  organizationName?: string;
  organizationSlug?: string | null;
  roleName?: string;
  hasAccount: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

const MIN_PASSWORD = 8;

const { loggedIn, user, fetch: refreshSession, clear: clearSession } = useUserSession();

const verifying = ref(true);
const details = ref<InvitationDetails | null>(null);
const invalidReason = ref("");
const loading = ref(false);
const error = ref("");

const form = reactive({ firstName: "", lastName: "", password: "", confirmPassword: "" });

onMounted(async () => {
  try {
    const res = await $fetch<InvitationDetails>("/api/hoa/verify-invitation", { method: "POST", body: { token: props.token } });
    details.value = res;
    form.firstName = res.firstName || "";
    form.lastName = res.lastName || "";
  } catch (err: any) {
    invalidReason.value = err?.data?.message || "Invalid or expired invitation";
  } finally {
    verifying.value = false;
  }
});

const community = computed(() => details.value?.organizationName || "your community");
const sessionEmail = computed(() => String((user.value as { email?: string } | null)?.email || "").toLowerCase());

/** Which form to show. */
const mode = computed<"signed-in" | "other-account" | "password" | "new">(() => {
  const d = details.value;
  if (loggedIn.value && d && sessionEmail.value === d.email) return "signed-in";
  if (loggedIn.value) return "other-account";
  return d?.hasAccount ? "password" : "new";
});

const canSubmit = computed(() => {
  if (loading.value) return false;
  if (mode.value === "signed-in") return true;
  if (mode.value === "password") return !!form.password;
  if (mode.value === "new") {
    return !!(form.firstName.trim() && form.lastName.trim() && form.password.length >= MIN_PASSWORD && form.password === form.confirmPassword);
  }
  return false;
});

const submit = async () => {
  if (!canSubmit.value) return;
  loading.value = true;
  error.value = "";
  try {
    const res = await $fetch<{ organization?: { slug?: string | null } }>("/api/hoa/accept-invitation", {
      method: "POST",
      body: {
        token: props.token,
        ...(mode.value === "signed-in" ? {} : { password: form.password }),
        ...(mode.value === "new" ? { firstName: form.firstName.trim(), lastName: form.lastName.trim() } : {}),
      },
    });
    const slug = res.organization?.slug || details.value?.organizationSlug;
    // A full load, so the community list and the session start fresh.
    reloadNuxtApp({ path: props.redirectTo || (slug ? `/${slug}` : "/dashboard") });
  } catch (err: any) {
    error.value = err?.data?.message || "Couldn't accept the invitation. Try again.";
    loading.value = false;
  }
};

const signOut = async () => {
  loading.value = true;
  try {
    await $fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Clear the local session either way.
  }
  await clearSession();
  await refreshSession();
  loading.value = false;
};
</script>

<template>
  <AppCard class="w-full max-w-md mx-auto">
    <CardHeader>
      <CardTitle>Join {{ community }}</CardTitle>
      <CardDescription v-if="details">
        You're invited as {{ details.email }}<template v-if="details.roleName"> ({{ details.roleName }})</template>.
      </CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="verifying" class="text-center py-8">
        <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-4" />
        <p class="text-sm text-muted-foreground">Checking your invitation…</p>
      </div>

      <Alert v-else-if="!details" variant="destructive">
        <Icon name="lucide:alert-circle" class="w-4 h-4" />
        <AlertTitle>This invitation can't be used</AlertTitle>
        <AlertDescription>
          {{ invalidReason }}. Ask your community's administrator to send a new one.
        </AlertDescription>
      </Alert>

      <div v-else-if="mode === 'other-account'" class="space-y-4">
        <p class="text-sm">
          You're signed in as {{ sessionEmail || "another account" }}. This invitation is for {{ details.email }}. Sign out to accept it.
        </p>
        <AppButton class="w-full" :disabled="loading" @click="signOut">Sign out</AppButton>
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <p v-if="mode === 'signed-in'" class="text-sm">You're signed in as {{ details.email }}.</p>

        <template v-else-if="mode === 'password'">
          <p class="text-sm">You already have an HOA Connect account. Enter its password to add {{ community }} to it.</p>
          <div class="space-y-1.5">
            <Label for="invite-password">Password</Label>
            <AppInput id="invite-password" v-model="form.password" type="password" autocomplete="current-password" required />
            <NuxtLink to="/auth/forgot-password" class="text-sm text-blue-600 hover:underline">Forgot your password?</NuxtLink>
          </div>
        </template>

        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="invite-first">First name</Label>
              <AppInput id="invite-first" v-model="form.firstName" autocomplete="given-name" required />
            </div>
            <div class="space-y-1.5">
              <Label for="invite-last">Last name</Label>
              <AppInput id="invite-last" v-model="form.lastName" autocomplete="family-name" required />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label for="invite-new-password">Create a password</Label>
            <AppInput id="invite-new-password" v-model="form.password" type="password" autocomplete="new-password" required />
            <p class="text-sm text-muted-foreground">At least {{ MIN_PASSWORD }} characters.</p>
          </div>
          <div class="space-y-1.5">
            <Label for="invite-confirm">Confirm the password</Label>
            <AppInput id="invite-confirm" v-model="form.confirmPassword" type="password" autocomplete="new-password" required />
            <p v-if="form.confirmPassword && form.password !== form.confirmPassword" class="text-sm text-destructive">
              The passwords don't match.
            </p>
          </div>
        </template>

        <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>

        <AppButton type="submit" class="w-full" :disabled="!canSubmit">
          <Icon v-if="loading" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          {{ mode === "new" ? "Create account and join" : `Join ${community}` }}
        </AppButton>
      </form>
    </CardContent>
  </AppCard>
</template>
