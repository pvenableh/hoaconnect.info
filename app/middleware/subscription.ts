/**
 * Subscription enforcement middleware
 * Blocks access for organizations with expired/canceled subscriptions
 * Free accounts bypass this check entirely
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();

  // Skip if not logged in (auth middleware will handle redirect)
  if (!loggedIn.value) return;

  // Pages that don't require active subscription
  const exemptPages = [
    '/settings/subscription', // Allow access to renew
    '/subscription-expired',  // The blocked page itself
    '/auth/',                 // Auth pages
    '/setup/',                // Setup pages
    '/',                      // Landing page
  ];

  // Check if current route is exempt
  const isExempt = exemptPages.some(page =>
    to.path === page || to.path.startsWith(page)
  );

  if (isExempt) return;

  // Get organization data
  try {
    const { currentOrg } = await useSelectedOrg();

    // If no org selected, let them through (they may need to set up)
    if (!currentOrg.value?.organization) return;

    const org = currentOrg.value.organization;

    // Free accounts bypass subscription checking
    if (org.is_free_account === true) return;

    // Check subscription status
    const status = org.subscription_status;

    // Allow active and trial subscriptions
    if (status === 'active' || status === 'trial') return;

    // Check if trial is still valid (even if status says trial)
    if (status === 'trial' && org.trial_ends_at) {
      const trialEnd = new Date(org.trial_ends_at);
      if (trialEnd > new Date()) return;
    }

    // Subscription is expired or canceled - redirect to blocked page
    console.log('[subscription middleware] Blocking access - subscription status:', status);
    return navigateTo('/subscription-expired');

  } catch (error) {
    // If we can't check subscription, let them through
    // (better to fail open than lock users out on error)
    console.warn('[subscription middleware] Error checking subscription:', error);
    return;
  }
});
