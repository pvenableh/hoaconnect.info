<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { requestPasswordReset } = useDirectusAuth();
const isLoading = ref(false);

const handleSubmit = async (values: { email: string }) => {
  isLoading.value = true;
  try {
    await requestPasswordReset(values.email);
    toast.success("Reset link sent!", {
      description: "Check your email for the password reset link.",
    });
  } catch (error: any) {
    toast.error("Request failed", {
      description: error.message || "Please try again.",
    });
  } finally {
    isLoading.value = false;
  }
};

const handleBackToLogin = () => {
  router.push("/auth/login");
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
      <AuthPasswordResetRequestForm
        @submit="handleSubmit"
        @back-to-login="handleBackToLogin"
      />
    </div>
  </div>
</template>
