// GET /api/ops/communities/:id — one community: people, billing, activity, links.
// App Admin and Platform Support (`billing.read`).
//
// People (plan §3): the community's customer contacts by name and email —
// HOA Admins, current board officers, Property Managers with their grants, and
// the billing account's members when agency-billed. Residents appear only as
// counts. Nothing about an ordinary member leaves this route by name.
import { readItem, readItems } from "@directus/sdk";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import {
  directusItemUrl,
  opsCached,
  opsUsers,
  personName,
  stripeDashboardUrl,
  stripeReadProblem,
} from "#core/server/utils/ops-data";
import { getStripe } from "#core/server/utils/stripe";
import { countOrgUnits, getActiveBands } from "#core/server/utils/subscription-band";
import { isContactOnly, selectBand, type PlanBand } from "#core/shared/billing/bands";
import { residencyFor, RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";
import { communityStatus, isDuesCharge, monthlyValue } from "#core/shared/ops/metrics";
import { MANAGER_GRANT_KEYS, normalizeGrants } from "#core/shared/transition/grants";

const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" ? v : null;

/** A read that may fail on an environment without the collection: null, not a 500. */
async function optional<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e: any) {
    console.warn(`[ops/community] ${label} unavailable:`, e?.message ?? e);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Community id required" });

  const config = useRuntimeConfig();
  const directus = getTypedDirectus();
  const now = new Date();

  const org = (await optional("organization", () =>
    directus.request(
      readItem("hoa_organizations", id, {
        fields: [
          "id",
          "name",
          "slug",
          "subscription_status",
          "trial_ends_at",
          "is_free_account",
          "grace_ends_at",
          "billing_account",
          "subscription_plan",
          "declared_units",
          "billing_cycle",
          "stripe_customer_id",
          "stripe_subscription_id",
          "date_created",
        ] as any,
      })
    )
  )) as any;
  if (!org) throw createError({ statusCode: 404, message: "Community not found" });

  const accountId = idOf(org.billing_account);
  const account = accountId
    ? ((await optional("billing account", () => directus.request(readItem("billing_accounts", accountId)))) as any)
    : null;

  // ── People ────────────────────────────────────────────────────────────────
  const members = ((await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: id }, status: { _in: ["active", "pending"] } },
      fields: [
        "id",
        "user",
        "role",
        "status",
        "first_name",
        "last_name",
        "email",
        "member_type",
        "manager_permissions",
        ...RESIDENCY_UNIT_FIELDS,
      ] as any,
      limit: -1,
    })
  )) ?? []) as any[];

  const roleOf = (m: any) => idOf(m.role);
  const admins = members.filter((m) => roleOf(m) === config.public.directusRoleHoaAdmin);
  const managers = members.filter((m) => roleOf(m) === config.public.directusRolePropertyManager && m.status === "active");
  const active = members.filter((m) => m.status === "active");

  const today = now.toISOString().slice(0, 10);
  const boardRows = members.length
    ? (((await optional("board", () =>
        directus.request(
          readItems("hoa_board_members", {
            filter: {
              _and: [
                { hoa_member: { _in: members.map((m) => m.id) } },
                { status: { _eq: "published" } },
                { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
                { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
              ],
            } as any,
            fields: ["id", "hoa_member", "title", "term_start", "term_end", "sort"] as any,
            limit: -1,
          })
        )
      )) ?? []) as any[])
    : [];

  const accountMembers = accountId
    ? (((await optional("billing account members", () =>
        directus.request(
          readItems("billing_account_members", {
            filter: { billing_account: { _eq: accountId } },
            fields: ["id", "user", "role"] as any,
            limit: -1,
          })
        )
      )) ?? []) as any[])
    : [];

  const memberById = new Map(members.map((m) => [m.id, m]));
  const users = await opsUsers([
    ...admins.map((m) => idOf(m.user)!),
    ...managers.map((m) => idOf(m.user)!),
    ...boardRows.map((b) => idOf(memberById.get(idOf(b.hoa_member) ?? "")?.user)!),
    ...accountMembers.map((a) => idOf(a.user)!),
  ]);
  const contact = (m: any) => {
    const u = users.get(idOf(m?.user) ?? "");
    return { name: personName(m) ?? u?.name ?? null, email: m?.email ?? u?.email ?? null, lastSignInAt: u?.last_access ?? null };
  };

  let owners = 0;
  let tenants = 0;
  let unknownResidency = 0;
  for (const m of active) {
    const r = residencyFor(m, { asOf: now });
    if (r === "owner") owners += 1;
    else if (r === "tenant") tenants += 1;
    else unknownResidency += 1;
  }
  const realUnits = await countOrgUnits(id);
  const declaredUnits = Number(org.declared_units) || 0;

  const people = {
    hoaAdmins: admins.map((m) => ({ id: m.id, status: m.status, ...contact(m) })),
    boardOfficers: boardRows
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((b) => {
        const m = memberById.get(idOf(b.hoa_member) ?? "");
        return { id: b.id, title: b.title ?? null, termEnd: b.term_end ?? null, ...contact(m) };
      }),
    propertyManagers: managers.map((m) => {
      const grants = normalizeGrants(m.manager_permissions);
      return { id: m.id, ...contact(m), grants: MANAGER_GRANT_KEYS.filter((k) => grants[k]) };
    }),
    billingAccountMembers: accountMembers.map((a) => {
      const u = users.get(idOf(a.user) ?? "");
      return { id: a.id, role: a.role, name: u?.name ?? null, email: u?.email ?? null };
    }),
    counts: { members: active.length, owners, tenants, unknownResidency, units: realUnits, declaredUnits },
  };

  // ── Billing (Stripe, live, cached 60 s) ───────────────────────────────────
  const bands = ((await optional("bands", () => getActiveBands())) ?? []) as any[];
  const currentPlanId = idOf(org.subscription_plan);
  const currentPlan = currentPlanId
    ? (((await optional("plan", () => directus.request(readItem("subscription_plans", currentPlanId, { fields: ["id", "slug", "name"] as any }))))) as any)
    : null;
  const fitsBand = selectBand(Math.max(realUnits, declaredUnits), bands as unknown as PlanBand[]) as any;

  const customerId: string | null = (accountId ? account?.stripe_customer_id : org.stripe_customer_id) ?? null;
  const subscriptionId: string | null = (accountId ? account?.stripe_subscription_id : org.stripe_subscription_id) ?? null;
  // Each read on its own, so one failure doesn't blank the card. On localhost
  // (test key) a live customer answers resource_missing: say that, and the page
  // disables actions on it.
  const problems: string[] = [];
  const mode: { other: "live" | "test" | null } = { other: null };
  const read = async <T>(label: string, run: (stripe: ReturnType<typeof getStripe>) => Promise<T>): Promise<T | null> => {
    try {
      return await run(getStripe());
    } catch (e: any) {
      const p = stripeReadProblem(e);
      if (p.otherMode) mode.other = p.otherMode;
      else console.error(`[ops/community] Stripe ${label} read failed:`, e?.message ?? e);
      if (!problems.includes(p.message)) problems.push(p.message);
      return null;
    }
  };
  const [sub, inv, ch, cust] = await Promise.all([
    subscriptionId ? read("subscription", (stripe) => opsCached(`sub:${subscriptionId}`, () => stripe.subscriptions.retrieve(subscriptionId))) : null,
    customerId ? read("invoices", (stripe) => opsCached(`invoices:${customerId}`, () => stripe.invoices.list({ customer: customerId, limit: 12 }))) : null,
    customerId ? read("charges", (stripe) => opsCached(`charges-of:${customerId}`, () => stripe.charges.list({ customer: customerId, limit: 12 }))) : null,
    customerId ? read("customer", (stripe) => opsCached(`customer:${customerId}`, () => stripe.customers.retrieve(customerId))) : null,
  ]);

  let subscription: any = null;
  const s = sub as any;
  if (s) {
    const d = s.discount && typeof s.discount === "object" ? s.discount : null;
    subscription = {
      id: s.id,
      status: s.status,
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
      currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
      trialEnd: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
      quantity: (s.items?.data ?? []).reduce((n: number, i: any) => n + (i.quantity ?? 1), 0),
      items: (s.items?.data ?? []).map((i: any) => ({
        nickname: i.price?.nickname ?? i.price?.lookup_key ?? null,
        unitAmount: i.price?.unit_amount ?? null,
        currency: i.price?.currency ?? null,
        interval: i.price?.recurring?.interval ?? null,
        quantity: i.quantity ?? 1,
      })),
      monthlyValueCents: monthlyValue(s, now).cents,
      bandSlug: s.metadata?.band_slug || null,
      discount: d
        ? {
            name: d.coupon?.name ?? null,
            percentOff: d.coupon?.percent_off ?? null,
            amountOff: d.coupon?.amount_off ?? null,
            duration: d.coupon?.duration ?? null,
            end: d.end ? new Date(d.end * 1000).toISOString() : null,
            promotionCode: s.metadata?.promotion_code || null,
          }
        : null,
    };
  }
  const invoices = ((inv as any)?.data ?? []).map((i: any) => ({
    id: i.id,
    number: i.number ?? null,
    created: new Date(i.created * 1000).toISOString(),
    total: i.total,
    amountPaid: i.amount_paid,
    currency: i.currency,
    status: i.status,
    url: i.hosted_invoice_url ?? null,
  }));
  const charges = ((ch as any)?.data ?? []).map((c: any) => ({
    id: c.id,
    created: new Date(c.created * 1000).toISOString(),
    amount: c.amount,
    amountRefunded: c.amount_refunded ?? 0,
    currency: c.currency,
    status: c.status,
    refunded: !!c.refunded,
    refundable: c.status === "succeeded" && c.amount > (c.amount_refunded ?? 0) && !isDuesCharge(c),
    failureMessage: c.failure_message ?? null,
    last4: c.payment_method_details?.card?.last4 ?? null,
  }));
  const stripeError = problems.length ? problems.join(" ") : null;

  // ── Activity ──────────────────────────────────────────────────────────────
  const wallet = ((await optional("AI wallet", () =>
    directus.request(
      readItems("ai_wallets", {
        filter: { organization: { _eq: id } },
        fields: ["balance_credits", "allowance_credits", "purchased_credits", "included_credits", "period_resets_at"] as any,
        limit: 1,
      })
    )
  )) as any[] | null)?.[0] ?? null;
  const audit = (((await optional("audit log", () =>
    directus.request(
      readItems("org_audit_log", {
        filter: { organization: { _eq: id } },
        fields: ["id", "event_type", "occurred_at", "actor_name", "summary"] as any,
        sort: ["-occurred_at"] as any,
        limit: 20,
      })
    )
  )) ?? []) as any[])
    .sort((a, b) => String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")))
    .slice(0, 20);
  const adminSignIns = people.hoaAdmins.map((a) => a.lastSignInAt).filter((t): t is string => !!t).sort();

  return {
    community: {
      id: org.id,
      name: org.name || org.slug,
      slug: org.slug,
      ...communityStatus(org, account, now),
      subscriptionStatus: org.subscription_status ?? null,
      trialEndsAt: (accountId ? account?.trial_ends_at : org.trial_ends_at) ?? null,
      graceEndsAt: org.grace_ends_at ?? null,
      billingCycle: org.billing_cycle ?? null,
      signupAt: org.date_created ?? null,
      billingAccount: account ? { id: account.id, name: account.name, seatsPurchased: account.seats_purchased ?? null } : null,
    },
    people,
    billing: {
      source: accountId ? "billing_account" : "organization",
      band: currentPlan ? { slug: currentPlan.slug, name: currentPlan.name } : null,
      bandForUnits: fitsBand ? { slug: fitsBand.slug, name: fitsBand.name, units: Math.max(realUnits, declaredUnits) } : null,
      subscription,
      invoices,
      charges,
      error: stripeError,
      /** Set when the community's Stripe objects belong to the other mode: no actions on them. */
      otherMode: mode.other,
      /** Who Stripe sends invoices and receipts to. */
      customer: cust && !(cust as any).deleted ? { email: (cust as any).email ?? null, name: (cust as any).name ?? null } : null,
      /** The bands it could be moved to (the console's "Change band"). */
      bands: bands.map((b: any) => ({ slug: b.slug, name: b.name ?? b.slug, contactOnly: isContactOnly(b), priceMonthly: b.price_monthly ?? null })),
    },
    activity: {
      lastAdminSignInAt: adminSignIns.at(-1) ?? null,
      aiWallet: wallet,
      audit: audit.map((a) => ({ id: a.id, eventType: a.event_type, occurredAt: a.occurred_at, actorName: a.actor_name ?? null, summary: a.summary ?? null })),
    },
    links: {
      directus: directusItemUrl("hoa_organizations", org.id),
      stripeCustomer: customerId ? stripeDashboardUrl(`customers/${customerId}`) : null,
      stripeSubscription: subscriptionId ? stripeDashboardUrl(`subscriptions/${subscriptionId}`) : null,
      app: `/${org.slug}`,
    },
  };
});
