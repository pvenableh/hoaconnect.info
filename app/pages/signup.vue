<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { register } = useDirectusAuth();
const { activeHoa, isCustomDomain } = useActiveHoa();
const config = useRuntimeConfig();
const isLoading = ref(false);

// Helper function to get Directus file URL
const getFileUrl = (file: any) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

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

// Set SEO meta based on organization context
useSeoMeta({
  title: () =>
    activeHoa.value
      ? `Sign Up - ${activeHoa.value.name}`
      : "Sign Up - HOA Connect",
  description: () =>
    activeHoa.value
      ? `Create an account to join ${activeHoa.value.name}`
      : "Create an account on HOA Connect",
});
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4"
  >
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <!-- Organization Logo (for custom domains) -->
        <div v-if="isCustomDomain && activeHoa?.logo" class="mb-4">
          <img
            :src="getFileUrl(activeHoa.logo)"
            :alt="activeHoa.name"
            class="h-16 mx-auto object-contain"
          />
        </div>
        <!-- Organization Name (for custom domains without logo) -->
        <h2 v-else-if="isCustomDomain && activeHoa?.name" class="text-xl font-semibold text-gray-900 mb-2">
          {{ activeHoa.name }}
        </h2>
        <NuxtLink
          to="/"
          class="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to {{ isCustomDomain && activeHoa?.name ? activeHoa.name : 'home' }}
        </NuxtLink>
      </div>
      <AuthRegisterForm @submit="handleSubmit" @login="handleLogin" />
    </div>
  </div>
</template>
