<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { login } = useDirectusAuth();
const isLoading = ref(false);

const handleSubmit = async (values: { email: string; password: string }) => {
  isLoading.value = true;
  try {
    await login(values.email, values.password);
    toast.success("Login successful!", {
      description: "Welcome back!",
    });
    router.push("/");
  } catch (error: any) {
    toast.error("Login failed", {
      description:
        error.message || "Please check your credentials and try again.",
    });
  } finally {
    isLoading.value = false;
  }
};

const handleForgotPassword = () => {
  router.push("/auth/forgot-password");
};

const handleRegister = () => {
  router.push("/auth/register");
};
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4"
  >
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <NuxtLink
          to="/"
          class="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to home
        </NuxtLink>
      </div>
      <AuthLoginForm
        @submit="handleSubmit"
        @forgot-password="handleForgotPassword"
        @register="handleRegister"
      />
    </div>
  </div>
</template>
