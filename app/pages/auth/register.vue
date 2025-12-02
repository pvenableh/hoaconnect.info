<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { register } = useDirectusAuth();
const isLoading = ref(false);

const handleSubmit = async (values: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}) => {
  isLoading.value = true;
  try {
    await register({
      email: values.email,
      password: values.password,
      first_name: values.firstName,
      last_name: values.lastName,
    });
    toast.success("Account created!", {
      description: "Please check your email to verify your account.",
    });
    router.push("/auth/login");
  } catch (error: any) {
    toast.error("Registration failed", {
      description: error.message || "Please try again.",
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
      <AuthRegisterForm @submit="handleSubmit" @login="handleLogin" />
    </div>
  </div>
</template>
