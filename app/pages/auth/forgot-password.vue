<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({ layout: "auth-blank" });

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
  <AuthShell back-to="/auth/login" back-label="Back to login">
    <AuthPasswordResetRequestForm
      @submit="handleSubmit"
      @back-to-login="handleBackToLogin"
    />
  </AuthShell>
</template>
