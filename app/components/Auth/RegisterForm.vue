<!-- components/auth/RegisterForm.vue -->
<template>
  <Card class="w-full max-w-md">
    <CardHeader class="space-y-1">
      <CardTitle class="text-2xl font-bold">Create an account</CardTitle>
      <CardDescription> Enter your information to get started </CardDescription>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="onSubmit" class="space-y-4">
        <!-- Name Fields -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="firstName">First name</Label>
            <Input
              id="firstName"
              v-model="form.firstName"
              type="text"
              placeholder="John"
              :disabled="loading"
              :class="{ 'border-red-500': errors.firstName }"
              autocomplete="given-name"
            />
            <p v-if="errors.firstName" class="text-sm text-red-500">
              {{ errors.firstName }}
            </p>
          </div>
          <div class="space-y-2">
            <Label for="lastName">Last name</Label>
            <Input
              id="lastName"
              v-model="form.lastName"
              type="text"
              placeholder="Doe"
              :disabled="loading"
              :class="{ 'border-red-500': errors.lastName }"
              autocomplete="family-name"
            />
            <p v-if="errors.lastName" class="text-sm text-red-500">
              {{ errors.lastName }}
            </p>
          </div>
        </div>

        <!-- Email Field -->
        <div class="space-y-2">
          <Label for="email">Email</Label>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            placeholder="john@example.com"
            :disabled="loading"
            :class="{ 'border-red-500': errors.email }"
            autocomplete="email"
          />
          <p v-if="errors.email" class="text-sm text-red-500">
            {{ errors.email }}
          </p>
        </div>

        <!-- Phone Field (Optional) -->
        <div class="space-y-2">
          <Label for="phone">
            Phone
            <span class="text-sm text-gray-500 ml-1">(optional)</span>
          </Label>
          <Input
            id="phone"
            v-model="form.phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            :disabled="loading"
            :class="{ 'border-red-500': errors.phone }"
            autocomplete="tel"
          />
          <p v-if="errors.phone" class="text-sm text-red-500">
            {{ errors.phone }}
          </p>
        </div>

        <!-- Password Field -->
        <div class="space-y-2">
          <Label for="password">Password</Label>
          <Input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="Enter a strong password"
            :disabled="loading"
            :class="{ 'border-red-500': errors.password }"
            autocomplete="new-password"
          />
          <p v-if="errors.password" class="text-sm text-red-500">
            {{ errors.password }}
          </p>
          <div class="text-xs text-gray-500">
            Must be at least 8 characters with uppercase, lowercase, and numbers
          </div>
        </div>

        <!-- Confirm Password Field -->
        <div class="space-y-2">
          <Label for="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            v-model="form.confirmPassword"
            type="password"
            placeholder="Confirm your password"
            :disabled="loading"
            :class="{ 'border-red-500': errors.confirmPassword }"
            autocomplete="new-password"
          />
          <p v-if="errors.confirmPassword" class="text-sm text-red-500">
            {{ errors.confirmPassword }}
          </p>
        </div>

        <!-- Terms Checkbox -->
        <div class="flex items-start space-x-2">
          <input
            id="terms"
            v-model="acceptedTerms"
            type="checkbox"
            class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label for="terms" class="text-sm font-normal cursor-pointer">
            I agree to the
            <NuxtLink to="/terms" class="text-blue-600 hover:text-blue-800">
              Terms of Service
            </NuxtLink>
            and
            <NuxtLink to="/privacy" class="text-blue-600 hover:text-blue-800">
              Privacy Policy
            </NuxtLink>
          </Label>
        </div>

        <!-- Error Alert -->
        <Alert v-if="errorMessage" variant="destructive">
          <AlertDescription>
            {{ errorMessage }}
          </AlertDescription>
        </Alert>

        <!-- Submit Button -->
        <Button
          type="submit"
          class="w-full"
          :disabled="loading || !isValid || !acceptedTerms"
        >
          <span v-if="loading" class="flex items-center gap-2">
            <Icon name="eos-icons:loading" class="animate-spin" />
            Creating account...
          </span>
          <span v-else>Create account</span>
        </Button>

        <!-- OAuth Divider -->
        <div class="relative my-6">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-white px-2 text-gray-500">Or continue with</span>
          </div>
        </div>

        <!-- OAuth Buttons -->
        <div class="grid grid-cols-2 gap-4">
          <Button
            type="button"
            variant="outline"
            @click="loginWithProvider('google')"
            :disabled="loading"
          >
            <Icon name="logos:google-icon" class="mr-2 h-4 w-4" />
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            @click="loginWithProvider('github')"
            :disabled="loading"
          >
            <Icon name="mdi:github" class="mr-2 h-4 w-4" />
            GitHub
          </Button>
        </div>

        <!-- Sign In Link -->
        <div class="text-center text-sm">
          <span class="text-gray-500">Already have an account?</span>
          <NuxtLink
            to="/auth/login"
            class="ml-1 font-semibold text-blue-600 hover:text-blue-800"
          >
            Sign in
          </NuxtLink>
        </div>
      </form>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { registerSchema } from "~/schemas/auth";
import type { RegisterSchema } from "~/schemas/auth";

// Props & Emits
const emit = defineEmits<{
  success: [user: any];
}>();

// Composables
const { register } = useDirectusAuth();
const { public: publicConfig } = useRuntimeConfig();

// State
const loading = ref(false);
const errorMessage = ref("");
const acceptedTerms = ref(false);

const form = reactive<RegisterSchema>({
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  phone: "",
});

const errors = reactive<Partial<Record<keyof RegisterSchema, string>>>({});

// Validation
const isValid = computed(() => {
  const hasRequiredFields =
    form.email &&
    form.password &&
    form.confirmPassword &&
    form.firstName &&
    form.lastName;
  return hasRequiredFields && Object.keys(errors).length === 0;
});

// Watch for changes and validate
watch(
  form,
  () => {
    try {
      registerSchema.parse(form);
      Object.keys(errors).forEach(
        (key) => delete errors[key as keyof RegisterSchema]
      );
    } catch (error: any) {
      // Clear all errors first
      Object.keys(errors).forEach(
        (key) => delete errors[key as keyof RegisterSchema]
      );

      if (error.errors) {
        error.errors.forEach((err: any) => {
          const field = err.path[0] as keyof RegisterSchema;
          if (!errors[field]) {
            // Only set the first error for each field
            errors[field] = err.message;
          }
        });
      }
    }
  },
  { deep: true }
);

// Submit handler
const onSubmit = async () => {
  if (!acceptedTerms.value) {
    errorMessage.value = "Please accept the terms and conditions";
    return;
  }

  errorMessage.value = "";
  loading.value = true;

  try {
    // Validate form
    const validatedData = registerSchema.parse(form);

    // Attempt registration
    const user = await register({
      email: validatedData.email,
      password: validatedData.password,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
    });

    // Emit success event
    emit("success", user);
  } catch (error: any) {
    if (error.data?.statusMessage) {
      errorMessage.value = error.data.statusMessage;
    } else if (error.message) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = "An error occurred during registration";
    }
  } finally {
    loading.value = false;
  }
};

// OAuth registration
const loginWithProvider = (provider: "google" | "github") => {
  const directusUrl = publicConfig.directusUrl;
  const appUrl = publicConfig.appUrl;

  // Redirect to Directus OAuth endpoint
  window.location.href = `${directusUrl}/auth/login/${provider}?redirect=${appUrl}/auth/callback`;
};
</script>
