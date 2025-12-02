<!-- components/Auth/LoginForm.vue -->
<template>
  <Card class="w-full max-w-md">
    <CardHeader class="space-y-1">
      <CardTitle class="text-2xl font-bold">Welcome back</CardTitle>
      <CardDescription>
        Enter your email and password to sign in
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="onSubmit" class="space-y-4">
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

        <!-- Password Field -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label for="password">Password</Label>
            <NuxtLink
              to="/auth/forgot-password"
              class="text-sm text-blue-600 hover:text-blue-800"
            >
              Forgot password?
            </NuxtLink>
          </div>
          <Input
            id="password"
            v-model="form.password"
            type="password"
            placeholder="Enter your password"
            :disabled="loading"
            :class="{ 'border-red-500': errors.password }"
            autocomplete="current-password"
          />
          <p v-if="errors.password" class="text-sm text-red-500">
            {{ errors.password }}
          </p>
        </div>

        <!-- Remember Me -->
        <div class="flex items-center space-x-2">
          <input
            id="remember"
            v-model="remember"
            type="checkbox"
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label for="remember" class="text-sm font-normal cursor-pointer">
            Remember me for 30 days
          </Label>
        </div>

        <!-- Error Alert -->
        <Alert v-if="errorMessage" variant="destructive">
          <AlertDescription>
            {{ errorMessage }}
          </AlertDescription>
        </Alert>

        <!-- Submit Button -->
        <Button type="submit" class="w-full" :disabled="loading || !isValid">
          <span v-if="loading" class="flex items-center gap-2">
            <Icon name="eos-icons:loading" class="animate-spin" />
            Signing in...
          </span>
          <span v-else>Sign in</span>
        </Button>

        <!-- OAuth Section (conditional) -->
        <template v-if="showOAuth">
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
        </template>

        <!-- Sign Up Link -->
        <div class="text-center text-sm">
          <span class="text-gray-500">Don't have an account?</span>
          <NuxtLink
            to="/auth/register"
            class="ml-1 font-semibold text-blue-600 hover:text-blue-800"
          >
            Sign up
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

// Props
interface Props {
  showOAuth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showOAuth: true,
});

// Emits
const emit = defineEmits<{
  success: [user: any];
}>();

// Composables
const { login } = useDirectusAuth();
const { public: publicConfig } = useRuntimeConfig();

// State
const loading = ref(false);
const errorMessage = ref("");

const form = reactive<LoginSchema>({
  email: "",
  password: "",
});

const remember = ref(false);
const errors = reactive<Partial<Record<keyof LoginSchema, string>>>({});

// Validation
const isValid = computed(() => {
  return form.email && form.password && Object.keys(errors).length === 0;
});

// Watch for changes and validate
watch(
  form,
  () => {
    try {
      loginSchema.parse(form);
      Object.keys(errors).forEach(
        (key) => delete errors[key as keyof LoginSchema]
      );
    } catch (error: any) {
      if (error.errors) {
        error.errors.forEach((err: any) => {
          const field = err.path[0] as keyof LoginSchema;
          errors[field] = err.message;
        });
      }
    }
  },
  { deep: true }
);

// Submit handler
const onSubmit = async () => {
  errorMessage.value = "";
  loading.value = true;

  try {
    // Validate form
    const validatedData = loginSchema.parse(form);

    // Attempt login
    const user = await login(validatedData);

    // Emit success event
    emit("success", user);
  } catch (error: any) {
    if (error.data?.statusMessage) {
      errorMessage.value = error.data.statusMessage;
    } else if (error.message) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = "An error occurred during login";
    }
  } finally {
    loading.value = false;
  }
};

// OAuth login
const loginWithProvider = (provider: "google" | "github") => {
  const directusUrl = publicConfig.directusUrl;
  const appUrl = publicConfig.appUrl;

  // Redirect to Directus OAuth endpoint
  window.location.href = `${directusUrl}/auth/login/${provider}?redirect=${appUrl}/auth/callback`;
};
</script>
