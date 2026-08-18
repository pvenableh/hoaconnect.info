<template>
  <AuthShell back-to="/auth/login" back-label="Back to login">
      <!-- Loading State -->
      <div v-if="loading" class="glass-surface glass-surface--strong p-8 sm:p-10">
        <div class="flex flex-col items-center space-y-4 py-6">
          <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin t-text-accent" />
          <p class="text-sm t-text-muted">Verifying invitation...</p>
        </div>
      </div>

      <!-- Invalid Invitation -->
      <div v-else-if="!invitationValid" class="glass-surface glass-surface--strong p-8 sm:p-10 space-y-4">
        <div class="flex items-start gap-2 p-3 rounded-xl text-sm text-destructive bg-destructive/10 border border-destructive/20">
          <Icon name="lucide:alert-triangle" class="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p class="font-medium">Invalid or expired invitation</p>
            <p class="mt-1">
              This invitation link is invalid or has already been used. Please
              contact your administrator for a new invitation.
            </p>
          </div>
        </div>
        <Button
          class="w-full rounded-full"
          size="lg"
          variant="outline"
          @click="router.push('/auth/login')"
        >
          Go to login
        </Button>
      </div>

      <!-- Accept Form -->
      <div v-else class="glass-surface glass-surface--strong p-8 sm:p-10">
        <div class="mb-7 space-y-1.5">
          <h1 class="text-2xl font-semibold tracking-tight t-text">
            Welcome {{ invitation?.first_name }}!
          </h1>
          <p class="text-sm t-text-muted">
            You've been invited to join {{ invitation?.organization?.name }}.
            Set up your password to complete registration.
          </p>
        </div>
          <form @submit="onSubmit" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <!-- First Name -->
              <div class="space-y-2">
                <Label for="firstName">First Name</Label>
                <Input
                  id="firstName"
                  v-model="firstName"
                  placeholder="John"
                  :error="!!errors.firstName"
                  :disabled="isSubmitting"
                />
                <p v-if="errors.firstName" class="text-sm text-destructive">
                  {{ errors.firstName }}
                </p>
              </div>

              <!-- Last Name -->
              <div class="space-y-2">
                <Label for="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  v-model="lastName"
                  placeholder="Doe"
                  :error="!!errors.lastName"
                  :disabled="isSubmitting"
                />
                <p v-if="errors.lastName" class="text-sm text-destructive">
                  {{ errors.lastName }}
                </p>
              </div>
            </div>

            <!-- Email (Read-only) -->
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                :modelValue="invitation?.email"
                type="email"
                disabled
                class="bg-muted"
              />
            </div>

            <!-- Password -->
            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                :error="!!errors.password"
                :disabled="isSubmitting"
              />
              <p v-if="errors.password" class="text-sm text-destructive">
                {{ errors.password }}
              </p>
              <p class="text-xs t-text-muted">
                Must be at least 8 characters with uppercase, lowercase, and
                numbers
              </p>
            </div>

            <!-- Confirm Password -->
            <div class="space-y-2">
              <Label for="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                placeholder="••••••••"
                :error="!!errors.confirmPassword"
                :disabled="isSubmitting"
              />
              <p v-if="errors.confirmPassword" class="text-sm text-destructive">
                {{ errors.confirmPassword }}
              </p>
            </div>

            <!-- Error Alert -->
            <Alert v-if="authError" variant="destructive">
              <Icon name="lucide:alert-circle" class="h-4 w-4" />
              <div class="ml-2">{{ authError }}</div>
            </Alert>

            <!-- Success Alert -->
            <Alert v-if="success" :variant="successVariant">
              <Icon name="lucide:check-circle" class="h-4 w-4" />
              <div class="ml-2">
                Account created successfully! Redirecting...
              </div>
            </Alert>

            <!-- Submit Button -->
            <Button
              type="submit"
              size="lg"
              class="w-full rounded-full"
              :disabled="isSubmitting || success"
            >
              <Icon
                v-if="isSubmitting"
                name="lucide:loader-2"
                class="mr-2 h-4 w-4 animate-spin"
              />
              {{ isSubmitting ? "Creating account..." : "Accept invitation" }}
            </Button>

            <p class="text-center text-sm t-text-muted">
              Already have an account?
              <NuxtLink to="/auth/login" class="font-medium t-text-accent underline-offset-4 hover:underline">
                Sign in instead
              </NuxtLink>
            </p>
          </form>
      </div>
  </AuthShell>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import {
  acceptInvitationSchema,
  type AcceptInvitationSchema,
} from "~/lib/validations";
import { toast } from "vue-sonner";

// Shape of the invitation returned by /api/auth/verify-invitation (only the
// fields this page reads)
interface VerifiedInvitation {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  organization?: { name?: string | null } | null;
}

definePageMeta({
  layout: "auth-blank",
  middleware: "guest",
});

const router = useRouter();
const route = useRoute();
const { login } = useDirectusAuth();

// Get token from query params
const token = computed(() => route.query.token as string);

// State
const loading = ref(true);
const invitationValid = ref(false);
const invitation = ref<VerifiedInvitation | null>(null);
const authError = ref<string | null>(null);
const success = ref(false);

// Alert's cva typing only knows "default" | "destructive"; keep the existing
// runtime value ("success") while satisfying the prop type.
const successVariant = "success" as unknown as "default";

// Form validation
const { handleSubmit, errors, isSubmitting, defineField, setFieldValue } =
  useForm<AcceptInvitationSchema>({
    validationSchema: toTypedSchema(acceptInvitationSchema),
  });

const [firstName] = defineField("firstName");
const [lastName] = defineField("lastName");
const [password] = defineField("password");
const [confirmPassword] = defineField("confirmPassword");

// Verify invitation on mount
onMounted(async () => {
  if (!token.value) {
    loading.value = false;
    invitationValid.value = false;
    toast.error("No invitation token provided");
    return;
  }

  try {
    // Verify the invitation
    const response = await $fetch<{ invitation: VerifiedInvitation }>(
      "/api/auth/verify-invitation",
      {
        method: "POST",
        body: { token: token.value },
      }
    );

    invitation.value = response.invitation;
    invitationValid.value = true;

    // Pre-fill form with invitation data
    if (invitation.value?.first_name) {
      setFieldValue("firstName", invitation.value.first_name);
    }
    if (invitation.value?.last_name) {
      setFieldValue("lastName", invitation.value.last_name);
    }
  } catch (error: any) {
    invitationValid.value = false;
    toast.error(error?.message || "Invalid invitation");
  } finally {
    loading.value = false;
  }
});

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  if (!token.value || !invitation.value) {
    authError.value = "Invalid invitation";
    return;
  }

  authError.value = null;

  try {
    // Accept the invitation
    const response = await $fetch("/api/auth/accept-invitation", {
      method: "POST",
      body: {
        token: token.value,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      },
    });

    success.value = true;
    toast.success("Account created successfully!");

    // Auto-login
    await login(invitation.value.email, values.password);

    // Redirect to dashboard
    setTimeout(() => {
      router.push("/dashboard");
    }, 1000);
  } catch (error: any) {
    authError.value = error?.message || "Failed to accept invitation";
  }
});

// Page metadata
useHead({
  title: "Accept Invitation",
});
</script>
