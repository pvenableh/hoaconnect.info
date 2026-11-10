// GET /api/support/context — where this person can ask for help, and about what.
//
// Per community they belong to: whether they can "Ask my community" (a question
// in its request inbox) and which "Contact HOA Connect" categories they may use.
// Per billing account they own or administer: the same for the account.
import { readItems } from "@directus/sdk";
import { canAskCommunity, supportCategoriesFor } from "#core/shared/support/access";
import { supportRolesFor, supportViewerFor } from "#core/server/utils/support";

const readAny = readItems as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export default defineEventHandler(async (event) => {
  const viewer = await supportViewerFor(event);
  const directus = getTypedDirectus() as any;

  const memberships = (await directus.request(
    readAny("hoa_members", {
      filter: { user: { _eq: viewer.userId }, status: { _eq: "active" } },
      fields: ["organization.id", "organization.name", "organization.slug"],
      limit: -1,
    })
  )) as any[];
  const communities = await Promise.all(
    (memberships ?? [])
      .map((m) => m.organization)
      .filter((o: any) => o && idOf(o))
      .map(async (o: any) => {
        const roles = await supportRolesFor(viewer.userId, { organizationId: idOf(o) });
        return {
          id: idOf(o)!,
          name: o.name || o.slug,
          slug: o.slug ?? null,
          canAsk: canAskCommunity(roles),
          categories: supportCategoriesFor(roles),
          isAdmin: viewer.adminOf.has(idOf(o)!),
        };
      })
  );

  const accountRows = (await directus
    .request(
      readAny("billing_account_members", {
        filter: { user: { _eq: viewer.userId }, role: { _in: ["owner", "billing_admin"] } },
        fields: ["role", "billing_account.id", "billing_account.name"],
        limit: -1,
      })
    )
    .catch(() => [])) as any[];
  const accounts = (accountRows ?? [])
    .filter((a) => idOf(a.billing_account))
    .map((a) => ({
      id: idOf(a.billing_account)!,
      name: a.billing_account?.name ?? "Billing account",
      categories: supportCategoriesFor({ membership: null, boardTitles: [], residency: null, managerGrants: [], billingAccountRole: a.role }),
    }));

  return {
    communities: communities.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    accounts,
    staff: viewer.staff,
    adminOfAny: viewer.adminOf.size > 0,
  };
});
