// composables/useBillingMemberships.ts
// The billing accounts the current user belongs to (agency / multi-property
// billing). Backs the org switcher's "All properties" entry and the agency
// dashboard. Server-resolved (/api/billing-account/mine) so it works for pure
// billing viewers regardless of their Directus org role.
export interface BillingMembership {
  id: string;
  name: string;
  status: string | null;
  subscription_status: string | null;
  role: "owner" | "billing_admin" | "viewer";
}

export const useBillingMemberships = () => {
  const { loggedIn } = useUserSession();

  const { data, pending, refresh } = useAsyncData(
    "billing-memberships",
    async () => {
      if (!loggedIn.value) return [] as BillingMembership[];
      try {
        const res = await $fetch<{ accounts: BillingMembership[] }>(
          "/api/billing-account/mine"
        );
        return res.accounts || [];
      } catch (e) {
        console.error("[useBillingMemberships] fetch failed:", e);
        return [] as BillingMembership[];
      }
    },
    { watch: [loggedIn] }
  );

  const accounts = computed(() => data.value || []);
  const hasBillingAccounts = computed(() => accounts.value.length > 0);
  /** Can the user manage (not just view) at least one account? */
  const canManageAny = computed(() =>
    accounts.value.some((a) => a.role === "owner" || a.role === "billing_admin")
  );

  return { accounts, hasBillingAccounts, canManageAny, isLoading: pending, refresh };
};
