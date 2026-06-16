<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({ layout: "auth-blank" });

const route = useRoute();
const router = useRouter();
const { register } = useDirectusAuth();
const config = useRuntimeConfig();
const isLoading = ref(false);

// Get slug from route params
const slug = computed(() => route.params.slug as string);

// Minimal shape of /api/hoa/find used by this page
interface SignupOrganization {
  name: string;
  logo?: string | { id: string } | null;
}

// Fetch organization by slug for context
const { data: organization, pending } = await useAsyncData(
  `signup-org-${slug.value}`,
  async () => {
    const response = await $fetch<SignupOrganization>(`/api/hoa/find?slug=${slug.value}`);
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
  <AuthShell
    :back-to="organization ? `/${slug}` : '/'"
    :back-label="organization ? `Back to ${organization.name}` : 'Back to home'"
  >
    <!-- Loading State -->
    <div v-if="pending" class="glass-surface glass-surface--strong p-8 sm:p-10 flex justify-center">
      <div class="spinner-ios" />
    </div>

    <!-- Organization Not Found -->
    <div v-else-if="!organization" class="glass-surface glass-surface--strong p-8 sm:p-10 text-center space-y-3">
      <h1 class="text-xl font-semibold t-text">Organization not found</h1>
      <p class="text-sm t-text-muted">The organization you're looking for doesn't exist.</p>
      <NuxtLink to="/">
        <Button class="rounded-full mt-2">Go home</Button>
      </NuxtLink>
    </div>

    <!-- Signup Form with Organization Context -->
    <template v-else>
      <div v-if="organization?.logo" class="mb-5 text-center">
        <img
          :src="getFileUrl(organization.logo)"
          :alt="organization.name"
          class="h-14 mx-auto object-contain"
        />
      </div>
      <AuthRegisterForm @submit="handleSubmit" @login="handleLogin" />
    </template>
  </AuthShell>
</template>
