<template>
  <div
    class="container flex min-h-screen w-screen flex-col items-center justify-center"
  >
    <div
      class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]"
    >
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:mail-check" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Accept Invitation</h1>
        <p class="text-sm text-muted-foreground">
          Complete your account setup to get started
        </p>
      </div>

      <!-- Loading State -->
      <Card v-if="loading">
        <CardContent class="pt-6">
          <div class="flex flex-col items-center space-y-4">
            <Icon
              name="lucide:loader-2"
              class="h-8 w-8 animate-spin text-primary"
            />
            <p class="text-sm text-muted-foreground">Verifying invitation...</p>
          </div>
        </CardContent>
      </Card>

      <!-- Invalid Invitation -->
      <Card v-else-if="!invitationValid">
        <CardContent class="pt-6">
          <Alert variant="destructive">
            <Icon name="lucide:alert-triangle" class="h-4 w-4" />
            <div class="ml-2">
              <p class="font-medium">Invalid or Expired Invitation</p>
              <p class="text-sm mt-1">
                This invitation link is invalid or has already been used. Please
                contact your administrator for a new invitation.
              </p>
            </div>
          </Alert>
          <Button
            class="w-full mt-4"
            variant="outline"
            @click="router.push('/auth/login')"
          >
            Go to Login
          </Button>
        </CardContent>
      </Card>

      <!-- Accept Form -->
      <Card v-else>
        <CardHeader>
          <CardTitle>Welcome {{ invitation?.first_name }}!</CardTitle>
          <CardDescription>
            You've been invited to join {{ invitation?.organization?.name }}.
            Please set up your password to complete registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <p class="text-xs text-muted-foreground">
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
            <Alert v-if="success" variant="success">
              <Icon name="lucide:check-circle" class="h-4 w-4" />
              <div class="ml-2">
                Account created successfully! Redirecting...
              </div>
            </Alert>

            <!-- Submit Button -->
            <Button
              type="submit"
              class="w-full"
              :disabled="isSubmitting || success"
            >
              <Icon
                v-if="isSubmitting"
                name="lucide:loader-2"
                class="mr-2 h-4 w-4 animate-spin"
              />
              {{ isSubmitting ? "Creating account..." : "Accept Invitation" }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <!-- Sign In Link -->
      <p class="px-8 text-center text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink
          to="/auth/login"
          class="hover:text-primary underline underline-offset-4"
        >
          Sign in instead
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import {
  acceptInvitationSchema,
  type AcceptInvitationSchema,
} from "~/lib/validations";
import { toast } from "vue-sonner";
import type { HoaInvitation } from "~/types/directus-schema";

definePageMeta({
  layout: false,
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
const invitation = ref<HoaInvitation | null>(null);
const authError = ref<string | null>(null);
const success = ref(false);

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
    const response = await $fetch("/api/auth/verify-invitation", {
      method: "POST",
      body: { token: token.value },
    });

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
