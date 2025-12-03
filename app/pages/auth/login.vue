<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { login } = useDirectusAuth();
const isLoading = ref(false);

const handleSubmit = async (values: { email: string; password: string }) => {
  isLoading.value = true;
  try {
    const response = await login(values.email, values.password);
    toast.success("Login successful!", {
      description: "Welcome back!",
    });

    // Redirect to organization URL if available
    const org = response?.user?.organization;

    if (org?.custom_domain && org?.domain_verified) {
      // Redirect to verified custom domain with auth token
      try {
        const tokenResponse = await $fetch('/api/auth/cross-domain-token', {
          method: 'POST',
          body: { targetDomain: org.custom_domain },
        });

        const protocol = window.location.protocol;
        const customDomainUrl = new URL(`${protocol}//${org.custom_domain}`);
        if (tokenResponse?.token) {
          customDomainUrl.searchParams.set('_auth_token', tokenResponse.token);
        }

        window.location.href = customDomainUrl.toString();
        return;
      } catch (tokenError) {
        // If token generation fails, redirect anyway (user will need to re-login on custom domain)
        console.warn('Failed to generate cross-domain token:', tokenError);
        window.location.href = `${window.location.protocol}//${org.custom_domain}`;
        return;
      }
    } else if (org?.slug) {
      // Redirect to organization slug path
      router.push(`/${org.slug}`);
    } else {
      // No organization, redirect to home
      router.push("/");
    }
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
