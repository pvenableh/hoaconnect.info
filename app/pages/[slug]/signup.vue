<script setup lang="ts">
import { toast } from "vue-sonner";

const route = useRoute();
const router = useRouter();
const { register } = useDirectusAuth();
const config = useRuntimeConfig();
const isLoading = ref(false);

// Get slug from route params
const slug = computed(() => route.params.slug as string);

// Fetch organization by slug for context
const { data: organization, pending } = await useAsyncData(
  `signup-org-${slug.value}`,
  async () => {
    const response = await $fetch(`/api/hoa/find?slug=${slug.value}`);
    return response;
  }
);

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
    // Redirect to login - the login page will handle org context
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

// Set SEO meta
useSeoMeta({
  title: () =>
    organization.value
      ? `Sign Up - ${organization.value.name}`
      : "Sign Up",
  description: () =>
    organization.value
      ? `Create an account to join ${organization.value.name}`
      : "Create an account",
});
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4"
  >
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center min-h-[400px]">
      <div class="text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
          role="status"
        >
          <span class="sr-only">Loading...</span>
        </div>
        <p class="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>

    <!-- Organization Not Found -->
    <div
      v-else-if="!organization"
      class="flex items-center justify-center min-h-[400px]"
    >
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">
          Organization Not Found
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          The organization you're looking for doesn't exist.
        </p>
        <a
          href="/"
          class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
        >
          Go Home
        </a>
      </div>
    </div>

    <!-- Signup Form with Organization Context -->
    <div v-else class="w-full max-w-md">
      <div class="mb-8 text-center">
        <!-- Organization Logo -->
        <div v-if="organization?.logo" class="mb-4">
          <img
            :src="getFileUrl(organization.logo)"
            :alt="organization.name"
            class="h-16 mx-auto object-contain"
          />
        </div>
        <!-- Organization Name -->
        <h2 v-else class="text-xl font-semibold text-gray-900 mb-2">
          {{ organization.name }}
        </h2>
        <NuxtLink
          :to="`/${slug}`"
          class="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to {{ organization.name }}
        </NuxtLink>
      </div>
      <AuthRegisterForm @submit="handleSubmit" @login="handleLogin" />
    </div>
  </div>
</template>
