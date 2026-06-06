// GET /api/billing-account/mine
// The billing accounts the current user belongs to (any role). Used by the org
// switcher to surface an "All properties" entry and by the agency dashboard
// guard. Uses the admin token but scopes strictly to the session user.
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user?.id) return { accounts: [] };

  const directus = getTypedDirectus();
  let rows: any[] = [];
  try {
    rows = (await directus.request(
      readItems("billing_account_members", {
        filter: { user: { _eq: session.user.id } },
        fields: [
          "role",
          "billing_account.id",
          "billing_account.name",
          "billing_account.status",
          "billing_account.subscription_status",
        ],
        limit: -1,
      })
    )) as any[];
  } catch (e) {
    // Collection may not exist yet (migration not run) — degrade to "no accounts".
    console.warn("[billing-account/mine] lookup failed (migration run?):", (e as any)?.message || e);
    return { accounts: [] };
  }

  const accounts = (rows as any[])
    .filter((r) => r.billing_account && typeof r.billing_account === "object")
    .map((r) => ({
      id: r.billing_account.id,
      name: r.billing_account.name,
      status: r.billing_account.status,
      subscription_status: r.billing_account.subscription_status,
      role: r.role,
    }));

  return { accounts };
});
