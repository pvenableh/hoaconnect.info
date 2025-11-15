<template>
  <div
    class="container flex h-screen w-screen flex-col items-center justify-center"
  >
    <div
      class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]"
    >
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:lock" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Reset Password</h1>
        <p class="text-sm text-muted-foreground">
          Enter your new password below
        </p>
      </div>

      <!-- Reset Form -->
      <Card>
        <CardHeader>
          <CardTitle>New Password</CardTitle>
          <CardDescription>
            Choose a strong password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit="onSubmit" class="space-y-4">
            <!-- Password Field -->
            <div class="space-y-2">
              <Label for="password">New Password</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                :error="!!errors.password"
                :disabled="isSubmitting || success"
              />
              <p v-if="errors.password" class="text-sm text-destructive">
                {{ errors.password }}
              </p>
              <p class="text-xs text-muted-foreground">
                Must be at least 8 characters with uppercase, lowercase, and
                numbers
              </p>
            </div>

            <!-- Confirm Password Field -->
            <div class="space-y-2">
              <Label for="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                placeholder="••••••••"
                :error="!!errors.confirmPassword"
                :disabled="isSubmitting || success"
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
                Password reset successfully! Redirecting to login...
              </div>
            </Alert>

            <!-- Submit Button -->
            <UiButton
              v-if="!success"
              type="submit"
              class="w-full"
              :disabled="isSubmitting || !token"
            >
              <Icon
                v-if="isSubmitting"
                name="lucide:loader-2"
                class="mr-2 h-4 w-4 animate-spin"
              />
              {{ isSubmitting ? "Resetting..." : "Reset Password" }}
            </UiButton>

            <!-- Login Button -->
            <UiButton
              v-else
              type="button"
              class="w-full"
              @click="router.push('/auth/login')"
            >
              Go to Login
            </UiButton>
          </form>

          <!-- Invalid Token Alert -->
          <Alert v-if="!token" variant="destructive" class="mt-4">
            <Icon name="lucide:alert-triangle" class="h-4 w-4" />
            <div class="ml-2">
              <p class="font-medium">Invalid or missing reset token</p>
              <p class="text-sm mt-1">
                Please request a new password reset link
              </p>
            </div>
          </Alert>
        </CardContent>
      </Card>

      <!-- Back Link -->
      <p class="px-8 text-center text-sm text-muted-foreground">
        <NuxtLink
          to="/auth/login"
          class="hover:text-primary underline underline-offset-4"
        >
          <Icon name="lucide:arrow-left" class="inline h-3 w-3 mr-1" />
          Back to sign in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import {
  resetPasswordSchema,
  type ResetPasswordSchema,
} from "~/lib/validations";
import { toast } from "vue-sonner";

definePageMeta({
  layout: false,
  middleware: "guest",
});

const { resetPassword } = useDirectusAuth();
const router = useRouter();
const route = useRoute();

// Get token from query params
const token = computed(() => route.query.token as string);

// Form validation
const { handleSubmit, errors, isSubmitting, defineField } =
  useForm<ResetPasswordSchema>({
    validationSchema: toTypedSchema(resetPasswordSchema),
  });

const [password] = defineField("password");
const [confirmPassword] = defineField("confirmPassword");

// State
const authError = ref<string | null>(null);
const success = ref(false);

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  if (!token.value) {
    authError.value = "Reset token is missing";
    return;
  }

  authError.value = null;

  try {
    await resetPassword(token.value, values.password);
    success.value = true;
    toast.success("Password reset successfully!");

    // Redirect to login after 2 seconds
    setTimeout(() => {
      router.push("/auth/login");
    }, 2000);
  } catch (error: any) {
    authError.value = error?.message || "Failed to reset password";
  }
});

// Check for token on mount
onMounted(() => {
  if (!token.value) {
    toast.error("Invalid reset link");
  }
});

// Page metadata
useHead({
  title: "Reset Password",
});
</script>
