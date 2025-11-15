<template>
  <div
    class="container flex h-screen w-screen flex-col items-center justify-center"
  >
    <div
      class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]"
    >
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:key" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Forgot Password?</h1>
        <p class="text-sm text-muted-foreground">
          No worries, we'll send you reset instructions
        </p>
      </div>

      <!-- Reset Form -->
      <Card>
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to reset your
            password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit="onSubmit" class="space-y-4">
            <!-- Email Field -->
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                :error="!!errors.email"
                :disabled="isSubmitting || success"
              />
              <p v-if="errors.email" class="text-sm text-destructive">
                {{ errors.email }}
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
                <p class="font-medium">Check your email</p>
                <p class="text-sm mt-1">
                  We've sent a password reset link to {{ email }}
                </p>
              </div>
            </Alert>

            <!-- Submit Button -->
            <UiButton
              v-if="!success"
              type="submit"
              class="w-full"
              :disabled="isSubmitting"
            >
              <Icon
                v-if="isSubmitting"
                name="lucide:loader-2"
                class="mr-2 h-4 w-4 animate-spin"
              />
              {{ isSubmitting ? "Sending..." : "Send Reset Link" }}
            </UiButton>

            <!-- Back to Login -->
            <UiButton
              v-else
              type="button"
              variant="outline"
              class="w-full"
              @click="router.push('/auth/login')"
            >
              Back to Login
            </UiButton>
          </form>
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
  forgotPasswordSchema,
  type ForgotPasswordSchema,
} from "~/lib/validations";
import { toast } from "vue-sonner";

definePageMeta({
  layout: false,
  middleware: "guest",
});

const { requestPasswordReset } = useDirectusAuth();
const router = useRouter();

// Form validation
const { handleSubmit, errors, isSubmitting, defineField } =
  useForm<ForgotPasswordSchema>({
    validationSchema: toTypedSchema(forgotPasswordSchema),
  });

const [email] = defineField("email");

// State
const authError = ref<string | null>(null);
const success = ref(false);

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  authError.value = null;

  try {
    await requestPasswordReset(values.email);
    success.value = true;
    toast.success("Password reset email sent!");
  } catch (error: any) {
    authError.value = error?.message || "Failed to send reset email";
  }
});

// Page metadata
useHead({
  title: "Forgot Password",
});
</script>
