/**
 * Subscription enforcement middleware
 * Blocks access for organizations with expired/canceled subscriptions
 * Free accounts bypass this check entirely
 * Performance optimized with early returns
 */

// Pre-compiled exempt path patterns for faster matching
const EXEMPT_PATHS = new Set([
  '/settings/subscription',
  '/subscription-expired',
  '/',
]);

const EXEMPT_PREFIXES = ['/auth/', '/setup/', '/_nuxt/', '/api/'];

export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path;

  // Early return: Skip for static assets and API routes
  if (path.includes('.') || EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return;
  }

  // Early return: Check exact exempt paths first (faster than iteration)
  if (EXEMPT_PATHS.has(path)) {
    return;
  }

  const { loggedIn } = useUserSession();

  // Early return: Skip if not logged in (auth middleware will handle redirect)
  if (!loggedIn.value) return;

  // Get organization data
  try {
    const { currentOrg } = await useSelectedOrg();

    // Early return: If no org selected, let them through
    if (!currentOrg.value?.organization) return;

    const org = currentOrg.value.organization;

    // Early return: Free accounts bypass subscription checking
    if (org.is_free_account === true) return;

    const status = org.subscription_status;

    // Early return: Allow active subscriptions (most common case)
    if (status === 'active') return;

    // Early return: Check valid trial
    if (status === 'trial') {
      if (!org.trial_ends_at) return;
      const trialEnd = new Date(org.trial_ends_at);
      if (trialEnd > new Date()) return;
    }

    // Subscription is expired or canceled - redirect to blocked page
    return navigateTo('/subscription-expired');

  } catch {
    // If we can't check subscription, let them through
    // (better to fail open than lock users out on error)
    return;
  }
});
