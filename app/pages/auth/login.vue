<script setup lang="ts">
import { toast } from "vue-sonner";

const router = useRouter();
const { login } = useDirectusAuth();
const { activeHoa, isCustomDomain } = useActiveHoa();
const isLoading = ref(false);

// Ref to the login form component for setting errors
const loginFormRef = ref<{ setFormError: (message: string | null, fieldErrors?: { email?: string; password?: string }) => void } | null>(null);

// Get organization context for custom domain login
const organizationName = computed(() => {
  if (isCustomDomain.value && activeHoa.value?.name) {
    return activeHoa.value.name;
  }
  return null;
});

// Get allowed email domain from custom domain
const allowedDomain = computed(() => {
  if (isCustomDomain.value && activeHoa.value?.custom_domain) {
    return activeHoa.value.custom_domain;
  }
  return null;
});

const handleSubmit = async (values: { email: string; password: string }) => {
  isLoading.value = true;
  console.log('[login] Starting login attempt for:', values.email);

  // Clear any previous form errors
  loginFormRef.value?.setFormError(null);

  try {
    console.log('[login] Calling login API...');
    const response = await login(values.email, values.password);
    console.log('[login] Login successful for:', response?.user?.email);

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

    // Show success toast - keep it visible during redirect
    toast.success("Login successful!", {
      description: "Redirecting to your dashboard...",
      duration: 10000, // Long duration since page will navigate away
    });

    // Redirect to organization URL if available
    const org = response?.user?.organization;

    if (org?.custom_domain && org?.domain_verified) {
      // Check if we're already on the custom domain
      const currentHostname = window.location.hostname.toLowerCase().replace(/^www\./, '');
      const targetDomain = org.custom_domain.toLowerCase().replace(/^www\./, '');

      if (currentHostname === targetDomain) {
        // Already on the custom domain, session is set - just redirect to dashboard
        // Use navigateTo instead of window.location.href to prevent full page reload
        await navigateTo('/dashboard', { replace: true });
        return;
      }

      // Different domain - use cross-domain token flow
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

        // Cross-domain navigation requires external: true
        await navigateTo(customDomainUrl.toString(), { external: true });
        return;
      } catch (tokenError) {
        // If token generation fails, redirect anyway (user will need to re-login on custom domain)
        console.warn('Failed to generate cross-domain token:', tokenError);
        await navigateTo(`${window.location.protocol}//${org.custom_domain}`, { external: true });
        return;
      }
    } else if (org?.slug) {
      // Redirect to organization slug path using navigateTo for smooth client-side navigation
      await navigateTo(`/${org.slug}`, { replace: true });
    } else {
      // No organization, redirect to dashboard
      await navigateTo("/dashboard", { replace: true });
    }
  } catch (error: any) {
    console.error('[login] Login failed:', error);
    // Extract error message - handle both Error objects and Nuxt H3 errors
    const rawMessage = error?.data?.message || error?.statusMessage || error?.message || "";
    console.log('[login] Error message:', rawMessage);
    const errorMessage = rawMessage.toLowerCase();

    let toastTitle = "Login failed";
    let toastDescription = "Please check your credentials and try again.";
    let formErrorMessage: string | null = null;
    let fieldErrors: { email?: string; password?: string } = {};

    if (errorMessage.includes("invalid") || errorMessage.includes("incorrect") || errorMessage.includes("wrong")) {
      toastTitle = "Invalid credentials";
      toastDescription = "The email or password you entered is incorrect. Please try again.";
      formErrorMessage = "Invalid email or password";
      fieldErrors = { email: " ", password: " " }; // Space to trigger error state without extra message
    } else if (errorMessage.includes("not found") || errorMessage.includes("no user") || errorMessage.includes("user doesn't exist")) {
      toastTitle = "Account not found";
      toastDescription = "No account exists with this email address. Please check your email or sign up.";
      formErrorMessage = "No account found with this email";
      fieldErrors = { email: "No account found" };
    } else if (errorMessage.includes("email") && errorMessage.includes("required")) {
      toastTitle = "Email required";
      toastDescription = "Please enter your email address.";
      fieldErrors = { email: "Email is required" };
    } else if (errorMessage.includes("password") && errorMessage.includes("required")) {
      toastTitle = "Password required";
      toastDescription = "Please enter your password.";
      fieldErrors = { password: "Password is required" };
    } else if (rawMessage) {
      toastDescription = rawMessage;
      formErrorMessage = rawMessage;
    }

    // Show toast notification
    toast.error(toastTitle, {
      description: toastDescription,
      duration: 5000,
    });

    // Set form-level error and field errors
    loginFormRef.value?.setFormError(formErrorMessage, Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined);

    // Only reset loading state on error - on success we keep it loading during redirect
    isLoading.value = false;
  }
  // Note: No finally block - we intentionally keep isLoading=true on success
  // so the button shows loading state while the page redirects
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
        ref="loginFormRef"
        :is-loading="isLoading"
        :organization-name="organizationName"
        :allowed-domain="allowedDomain"
        @submit="handleSubmit"
        @forgot-password="handleForgotPassword"
        @register="handleRegister"
      />
    </div>
  </div>
</template>
