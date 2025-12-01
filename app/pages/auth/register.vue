<template>
  <div
    class="container flex h-screen w-screen flex-col items-center justify-center"
  >
    <div
      class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]"
    >
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:user-plus" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p class="text-sm text-muted-foreground">
          Enter your information to get started
        </p>
      </div>

      <!-- Register Form -->
      <Card>
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>
            Create your account to access the platform
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

            <!-- Email -->
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                :error="!!errors.email"
                :disabled="isSubmitting"
              />
              <p v-if="errors.email" class="text-sm text-destructive">
                {{ errors.email }}
              </p>
            </div>

            <!-- Phone (Optional) -->
            <div class="space-y-2">
              <Label for="phone">Phone (Optional)</Label>
              <Input
                id="phone"
                v-model="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                :error="!!errors.phone"
                :disabled="isSubmitting"
              />
              <p v-if="errors.phone" class="text-sm text-destructive">
                {{ errors.phone }}
              </p>
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
            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Icon
                v-if="isSubmitting"
                name="lucide:loader-2"
                class="mr-2 h-4 w-4 animate-spin"
              />
              {{ isSubmitting ? "Creating account..." : "Create Account" }}
            </Button>

            <!-- Terms -->
            <p class="text-xs text-center text-muted-foreground">
              By creating an account, you agree to our
              <NuxtLink
                to="/terms"
                class="underline underline-offset-4 hover:text-primary"
              >
                Terms & Conditions
              </NuxtLink>
              and
              <NuxtLink
                to="/privacy"
                class="underline underline-offset-4 hover:text-primary"
              >
                Privacy Policy
              </NuxtLink>
            </p>
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
          Sign in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { registerSchema, type RegisterSchema } from "~/lib/validations";
import { toast } from "vue-sonner";

definePageMeta({
  layout: false,
  middleware: "guest",
});

const { register, login } = useDirectusAuth();
const router = useRouter();

// Form validation
const { handleSubmit, errors, isSubmitting, defineField } =
  useForm<RegisterSchema>({
    validationSchema: toTypedSchema(registerSchema),
  });

const [firstName] = defineField("firstName");
const [lastName] = defineField("lastName");
const [email] = defineField("email");
const [phone] = defineField("phone");
const [password] = defineField("password");
const [confirmPassword] = defineField("confirmPassword");

// State
const authError = ref<string | null>(null);
const success = ref(false);

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  authError.value = null;

  try {
    // Register the user
    await register({
      email: values.email,
      password: values.password,
      first_name: values.firstName,
      last_name: values.lastName,
      phone: values.phone,
    });

    success.value = true;
    toast.success("Account created successfully!");

    // Auto-login after registration
    await login(values.email, values.password);

    // Redirect to dashboard
    setTimeout(() => {
      router.push("/dashboard");
    }, 1000);
  } catch (error: any) {
    authError.value = error?.message || "Failed to create account";
  }
});

// Page metadata
useHead({
  title: "Create Account",
});
</script>
