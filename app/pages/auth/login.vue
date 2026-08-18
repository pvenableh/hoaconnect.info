<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({ layout: "auth-blank" });

const router = useRouter();
const { login } = useDirectusAuth();
// On a custom domain the bound tenant is dictated by the host (resolved into
// activeHoa by domain-detector.global), NOT by the user's default org.
const { activeHoa, isCustomDomain } = useActiveHoa();
const isLoading = ref(false);

// Ref to the login form component for setting errors
const loginFormRef = ref<{ setFormError: (message: string | null, fieldErrors?: { email?: string; password?: string }) => void } | null>(null);

// Shape of the user returned by /api/auth/login (only the fields this page reads)
interface LoginResponseUser {
  email?: string;
  organization?: { id?: string; slug?: string | null; name?: string | null } | null;
}

const handleSubmit = async (values: { email: string; password: string }) => {
  isLoading.value = true;
  console.log('[login] Starting login attempt for:', values.email);

  // Clear any previous form errors
  loginFormRef.value?.setFormError(null);

  try {
    console.log('[login] Calling login API...');
    const response = await login(values.email, values.password);
    const loginUser = response?.user as LoginResponseUser | undefined;
    console.log('[login] Login successful for:', loginUser?.email);

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

    // Redirect after login. On a CUSTOM DOMAIN, the tenant is fixed by the host —
    // land on that org (resolved into activeHoa by host), never the user's default
    // org, which could belong to a different tenant and would render its content
    // on the wrong domain (e.g. 605lincolnroad.com/1033-lenox).
    if (isCustomDomain.value) {
      const domainSlug = activeHoa.value?.slug;
      await navigateTo(domainSlug ? `/${domainSlug}` : "/", { replace: true });
    } else {
      // Main app host: route to the user's default org slug, or the slug-agnostic
      // /dashboard entry when they have none.
      const org = loginUser?.organization;
      await navigateTo(org?.slug ? `/${org.slug}` : "/dashboard", {
        replace: true,
      });
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

const demoLoading = ref(false);
// One-click "Try the app": sign into the shared, sandboxed demo account, then a
// full navigation so the server picks up the fresh session and lands us on the
// demo dashboard. Fails quietly (feature is off when demo creds aren't set).
const handleTryDemo = async () => {
  if (demoLoading.value) return;
  demoLoading.value = true;
  try {
    const res = await $fetch<{ success: boolean; redirect: string }>("/api/demo/login", {
      method: "POST",
    });
    toast.success("Welcome to the demo", { description: "Loading a sample community…", duration: 8000 });
    window.location.assign(res?.redirect || "/demo/dashboard");
  } catch {
    toast.error("Demo unavailable", { description: "The live demo isn't available right now." });
    demoLoading.value = false;
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
  <AuthShell>
    <AuthLoginForm
      ref="loginFormRef"
      :is-loading="isLoading"
      @submit="handleSubmit"
      @forgot-password="handleForgotPassword"
      @register="handleRegister"
    />

    <!-- One-click sandbox: no signup, no credentials -->
    <div class="mt-6 pt-5 border-t t-border">
      <button
        type="button"
        :disabled="demoLoading"
        class="w-full inline-flex items-center justify-center gap-2 rounded-full border t-border px-4 py-2.5 text-sm font-medium t-text hover:t-bg-subtle transition-colors disabled:opacity-60"
        @click="handleTryDemo"
      >
        <Icon :name="demoLoading ? 'lucide:loader-circle' : 'lucide:play'" class="w-4 h-4" :class="{ 'animate-spin': demoLoading }" />
        {{ demoLoading ? "Loading demo…" : "Try the live demo" }}
      </button>
      <p class="mt-2 text-center text-xs t-text-muted">Explore a sample community — no account needed.</p>
    </div>
  </AuthShell>
</template>
