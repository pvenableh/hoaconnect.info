<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { login } = useDirectusAuth();
const isLoading = ref(false);

const handleSubmit = async (values: { email: string; password: string }) => {
  isLoading.value = true;
  try {
    const response = await login(values.email, values.password);

    // Check subscription status from response
    const subscriptionInfo = response?.subscriptionInfo;

    // If all organizations have expired subscriptions, redirect to organizations page
    if (subscriptionInfo?.allExpired) {
      toast.warning("Subscription Expired", {
        description: "Your organization subscriptions have expired. Please renew to continue.",
        duration: 5000,
      });
      router.push("/organizations");
      return;
    }

    // If user has no active org but has some memberships, show warning and redirect to orgs
    if (subscriptionInfo?.memberships?.length > 0 && !subscriptionInfo?.hasActiveOrg) {
      toast.warning("No Active Subscription", {
        description: "Please select an organization or renew your subscription.",
        duration: 5000,
      });
      router.push("/organizations");
      return;
    }

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
      // No organization, redirect to dashboard
      router.push("/dashboard");
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
