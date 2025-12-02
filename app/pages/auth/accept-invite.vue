<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const route = useRoute();
const { acceptInvite } = useDirectusUser();
const isLoading = ref(false);

// Get token and email from query params (e.g., /auth/accept-invite?token=abc123&email=user@example.com)
const token = computed(() => (route.query.token as string) || "");
const email = computed(() => (route.query.email as string) || "");

const handleSubmit = async (values: {
  firstName: string;
  lastName: string;
  password: string;
  token: string;
}) => {
  if (!values.token) {
    toast.error("Invalid invitation link", {
      description: "Please use the link from your invitation email.",
    });
    return;
  }

  isLoading.value = true;
  try {
    await acceptInvite(values.token, values.password);
    toast.success("Welcome to the team!", {
      description: "Your account has been created successfully.",
    });
    router.push("/auth/login");
  } catch (error: any) {
    toast.error("Failed to accept invitation", {
      description: error.message || "Please try again or contact support.",
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
      <AcceptInviteForm
        :token="token"
        :email="email"
        @submit="handleSubmit"
        @login="handleLogin"
      />
    </div>
  </div>
</template>
