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

  // Settings → Your data is never gated. The written continuity guarantee
  // (docs/data-continuity-policy.md) says a community can take its records out
  // after it cancels, and the export API already honours that — the routes
  // check admin access and nothing else. This middleware was the only thing
  // standing between a cancelled board and its own history, which would have
  // made "take it anytime" true everywhere except the moment it matters.
  //
  // Matched by suffix rather than added to the list above: the page exists as
  // /{slug}/admin/settings/data, so a prefix match would never have caught it.
  if (to.path.endsWith('/admin/settings/data')) return;

  // Get organization data
  try {
    const { currentOrg, effectiveEntitlement } = await useSelectedOrg();

    // If no org selected, let them through (they may need to set up)
    if (!currentOrg.value?.organization) return;

    // Effective entitlement resolves up to a parent billing_account when the
    // org belongs to one (agency billing); otherwise it's the org's own fields.
    // Covers free accounts, active, and unexpired trials in one rule.
    const { isEntitled, subscription_status } = effectiveEntitlement.value;
    if (isEntitled) return;

    // Subscription is expired or canceled - redirect to blocked page
    console.log('[subscription middleware] Blocking access - subscription status:', subscription_status);
    return navigateTo('/subscription-expired');

  } catch (error) {
    // If we can't check subscription, let them through
    // (better to fail open than lock users out on error)
    console.warn('[subscription middleware] Error checking subscription:', error);
    return;
  }
});
