// GET /api/support/context — where this person can ask for help, and about what.
//
// Per community they belong to: whether they can "Ask my community" (a question
// in its request inbox) and which "Contact HOA Connect" categories they may use.
// Per billing account they own or administer: the same for the account.
//
// One Directus request (support-context.ts): the caller's memberships, their
// board terms and their billing accounts, read together.
import { opsCan } from "#core/shared/ops/permissions";
import { getPlatformActor } from "#core/server/utils/admin-auth";
import { supportContextFrom, supportContextSpecs, type SupportContextRows } from "#core/server/utils/support-context";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  const actor = await getPlatformActor(event);
  const pub = useRuntimeConfig().public as { directusRoleHoaAdmin?: string; directusRolePropertyManager?: string };

  const specs = supportContextSpecs(String(userId), new Date().toISOString().slice(0, 10));
  let rows: SupportContextRows;
  try {
    rows = (await readItemsBatch(specs)) as SupportContextRows;
  } catch {
    // As before, no billing accounts where that collection cannot be read.
    const { sup_accounts: _accounts, ...rest } = specs;
    rows = { ...((await readItemsBatch(rest)) as Omit<SupportContextRows, "sup_accounts">), sup_accounts: [] };
  }

  return supportContextFrom(rows, { staff: opsCan(actor?.role, "support") }, {
    hoaAdmin: pub.directusRoleHoaAdmin,
    propertyManager: pub.directusRolePropertyManager,
  });
});
