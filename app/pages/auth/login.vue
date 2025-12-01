<template>
  <div
    class="container flex h-screen w-screen flex-col items-center justify-center"
  >
    <div
      class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]"
    >
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:shield" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p class="text-sm text-muted-foreground">
          Sign in to your HOA management account
        </p>
      </div>

      <!-- Login Form Component -->
      <AuthLoginForm @success="handleLoginSuccess" :show-o-auth="false" />

      <!-- Sign Up Link -->
      <p class="px-8 text-center text-sm text-muted-foreground">
        Don't have an account?
        <NuxtLink
          to="/auth/register"
          class="hover:text-primary underline underline-offset-4"
        >
          Sign up
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  layout: false,
  middleware: "guest",
});

const router = useRouter();
const route = useRoute();

// Get redirect URL from query params
const redirectTo = computed(
  () => (route.query.redirect as string) || "/dashboard"
);

// Handle successful login
const handleLoginSuccess = async (user: any) => {
  toast.success("Successfully logged in!");
  await router.push(redirectTo.value);
};

// Page metadata
useHead({
  title: "Sign In",
});
</script>
