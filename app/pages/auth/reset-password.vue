<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const route = useRoute();
const { resetPassword } = useDirectusAuth();
const isLoading = ref(false);

// Get token from query params (e.g., /auth/reset-password?token=abc123)
const token = computed(() => (route.query.token as string) || "");

const handleSubmit = async (values: { password: string; token: string }) => {
  if (!values.token) {
    toast.error("Invalid reset link", {
      description: "Please use the link from your email.",
    });
    return;
  }

  isLoading.value = true;
  try {
    await resetPassword(values.token, values.password);
    toast.success("Password updated!", {
      description: "Your password has been successfully reset.",
    });
    router.push("/auth/login");
  } catch (error: any) {
    toast.error("Reset failed", {
      description:
        error.message || "Please try again or request a new reset link.",
    });
  } finally {
    isLoading.value = false;
  }
};

const handleLogin = () => {
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
      <AuthPasswordResetForm
        :token="token"
        @submit="handleSubmit"
        @login="handleLogin"
      />
    </div>
  </div>
</template>
