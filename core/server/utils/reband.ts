// Re-banding (launch-followups Session 3; operator console "move to another
// band"). The rules are in core/shared/billing/reband.ts.
//
// A move changes only the subscription's band item (add-ons share the
// subscription; reconcileActiveAddons keeps those), with
// `proration_behavior: "none"`: the current period is untouched and the next
// renewal bills the new band. Onboarding isn't charged again. Stripe metadata
// (`band_slug`, `units`) and the org's `subscription_plan` follow, so the next
// run sees nothing to do. Every Stripe write carries an idempotency key.
import type Stripe from "stripe";
import { readItems, updateItem } from "@directus/sdk";
import type { PlanBand } from "#core/shared/billing/bands";
import { bandSlugFromLookupKey, planReband } from "#core/shared/billing/reband";
import { money, shortDate } from "#core/shared/ops/format";
import { notifyUsers } from "./notify";
import { writeOpsAuditEntry } from "./ops-audit";
import { invalidateOpsCache } from "./ops-data";
import { notifyPlatform } from "./platform-notify";
import { getStripe } from "./stripe";
import { countOrgUnits, getActiveBands, getDeclaredUnits, resolveBandPrices } from "./subscription-band";
import { openAutoSupportRequest } from "./support";

const readAny = readItems as any;
const updateAny = updateItem as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

type Band = PlanBand & { id: string; slug: string; name?: string | null; price_monthly?: number | null; price_yearly?: number | null };

/** The subscription item that is the band (not an add-on), and its interval. */
export function findBandItem(sub: any, bandSlugs: ReadonlySet<string>): { item: any; interval: "monthly" | "annual" } | null {
  const items: any[] = sub?.items?.data ?? [];
  for (const it of items) {
    const parsed = bandSlugFromLookupKey(it?.price?.lookup_key);
    if (parsed && bandSlugs.has(parsed.slug)) return { item: it, interval: parsed.interval };
  }
  // Older subscriptions, made before lookup keys: one item, and it's the band.
  if (items.length === 1) {
    return { item: items[0], interval: items[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly" };
  }
  return null;
}

export interface BandChange {
  from: string | null;
  to: string;
  units: number;
  interval: "monthly" | "annual";
  renewsAt: string | null;
  priceId: string;
  subscriptionId: string;
}

/**
 * Move a community's subscription to `to`, effective at the next renewal.
 * Throws when the band has no price in this Stripe mode or the band item
 * can't be told apart from add-ons.
 */
export async function changeBand(input: {
  stripe: Stripe;
  orgId: string;
  sub: any;
  to: Band;
  units: number;
  bands: Band[];
  idempotencyKey: string;
}): Promise<BandChange> {
  const found = findBandItem(input.sub, new Set(input.bands.map((b) => b.slug)));
  if (!found) throw createError({ statusCode: 409, message: "The subscription's band item couldn't be told apart from its add-ons." });
  const prices = await resolveBandPrices(input.to.slug, input.stripe);
  const priceId = found.interval === "annual" ? prices.annual : prices.monthly;
  if (!priceId) throw createError({ statusCode: 503, message: `The ${input.to.name ?? input.to.slug} band has no ${found.interval} price in this Stripe mode.` });

  const from = (input.sub.metadata?.band_slug as string | undefined) || bandSlugFromLookupKey(found.item?.price?.lookup_key)?.slug || null;
  await input.stripe.subscriptions.update(
    input.sub.id,
    {
      items: [{ id: found.item.id, price: priceId }],
      proration_behavior: "none",
      metadata: { ...(input.sub.metadata ?? {}), band_slug: input.to.slug, units: String(input.units) },
    } as any,
    { idempotencyKey: input.idempotencyKey }
  );
  await (getTypedDirectus() as any).request(updateAny("hoa_organizations", input.orgId, { subscription_plan: input.to.id }));
  invalidateOpsCache("subscriptions", `sub:${input.sub.id}`);
  return {
    from,
    to: input.to.slug,
    units: input.units,
    interval: found.interval,
    renewsAt: input.sub.current_period_end ? new Date(input.sub.current_period_end * 1000).toISOString() : null,
    priceId,
    subscriptionId: input.sub.id,
  };
}

/** Tell the community's HOA Admins and HOA Connect that the band changes at renewal. */
export async function announceBandChange(org: { id: string; name: string }, change: BandChange, bands: Band[], why: "units" | "request"): Promise<void> {
  const to = bands.find((b) => b.slug === change.to);
  const from = bands.find((b) => b.slug === change.from);
  const price =
    change.interval === "annual"
      ? to?.price_yearly != null ? `${money(Math.round(to.price_yearly * 100))} a year` : null
      : to?.price_monthly != null ? `${money(Math.round(to.price_monthly * 100))} a month` : null;
  const when = change.renewsAt ? shortDate(change.renewsAt) : "your next renewal";
  const reason =
    why === "units"
      ? `${org.name} now has ${change.units} units, which is in the ${to?.name ?? change.to} band.`
      : `HOA Connect has moved ${org.name} to the ${to?.name ?? change.to} band, as asked.`;
  const message = `${reason} From ${when}, the plan is ${price ?? `the ${to?.name ?? change.to} band`}. Nothing changes before then, and there is no onboarding fee.`;

  const config = useRuntimeConfig();
  const admins = (await (getTypedDirectus() as any)
    .request(
      readAny("hoa_members", {
        filter: { organization: { _eq: org.id }, role: { _eq: config.public.directusRoleHoaAdmin }, status: { _eq: "active" } },
        fields: ["user"],
        limit: -1,
      })
    )
    .catch(() => [])) as any[];
  const ids = [...new Set((admins ?? []).map((a) => idOf(a.user)).filter((x): x is string => !!x))];
  if (ids.length) {
    await notifyUsers({
      organizationId: org.id,
      recipientUserIds: ids,
      category: "payment",
      subject: `Your HOA Connect plan changes at renewal: ${to?.name ?? change.to}`,
      message,
      path: "/admin/settings",
      email: { bodyHtml: `<p>${message}</p>`, cta: { label: "See your subscription", path: "/admin/settings" } },
    }).catch((e: any) => console.error("[reband] admins not notified:", e?.message ?? e));
  }
  await notifyPlatform({
    subject: `Band change at renewal: ${org.name} → ${to?.name ?? change.to}`,
    rows: [
      ["Community", org.name],
      ["From", from?.name ?? change.from ?? "unknown"],
      ["To", to?.name ?? change.to],
      ["Units", change.units],
      ["Takes effect", when],
      ["Why", why === "units" ? "Units grew past the band" : "Moved from the console"],
    ],
  });
}

export interface RebandRunResult {
  checked: number;
  moved: Array<{ orgId: string; from: string | null; to: string }>;
  unitsUpdated: number;
  enterprise: number;
  skipped: number;
  errors: Array<{ orgId: string; message: string }>;
  dry: boolean;
}

/**
 * The daily run: every community that pays for itself on an active Stripe
 * subscription. Free, demo and agency-billed communities are skipped (an
 * agency's quantity is its own matter). A second run changes nothing.
 */
export async function runRebanding(opts: { dry?: boolean; stripe?: Stripe } = {}): Promise<RebandRunResult> {
  const stripe = opts.stripe ?? getStripe();
  const dry = !!opts.dry;
  const directus = getTypedDirectus() as any;
  const bands = (await getActiveBands()) as unknown as Band[];
  const orgs = (await directus.request(
    readAny("hoa_organizations", {
      filter: {
        _and: [
          { subscription_status: { _in: ["active", "past_due"] } },
          { stripe_subscription_id: { _nnull: true } },
          { billing_account: { _null: true } },
          { _or: [{ is_free_account: { _null: true } }, { is_free_account: { _eq: false } }] },
          { _or: [{ is_demo: { _null: true } }, { is_demo: { _eq: false } }] },
        ],
      },
      fields: ["id", "name", "slug", "subscription_plan", "stripe_subscription_id"],
      limit: -1,
    })
  )) as any[];

  const result: RebandRunResult = { checked: 0, moved: [], unitsUpdated: 0, enterprise: 0, skipped: 0, errors: [], dry };
  for (const org of orgs ?? []) {
    result.checked += 1;
    const name = org.name || org.slug || org.id;
    try {
      const sub = (await stripe.subscriptions.retrieve(org.stripe_subscription_id)) as any;
      if (!["active", "past_due", "trialing"].includes(sub.status)) {
        result.skipped += 1;
        continue;
      }
      const units = Math.max(await countOrgUnits(org.id), await getDeclaredUnits(org.id).catch(() => 0));
      const planSlug = bands.find((b) => b.id === idOf(org.subscription_plan))?.slug ?? null;
      const decision = planReband({
        units,
        currentSlug: (sub.metadata?.band_slug as string | undefined) || planSlug,
        metadataUnits: sub.metadata?.units ?? null,
        bands,
      });

      if (decision.kind === "none") continue;
      if (decision.kind === "units") {
        if (!dry) {
          await stripe.subscriptions.update(sub.id, { metadata: { ...(sub.metadata ?? {}), units: String(units) } } as any, {
            idempotencyKey: `reband-units:${sub.id}:${units}`,
          });
        }
        result.unitsUpdated += 1;
        continue;
      }
      if (decision.kind === "enterprise") {
        if (!dry) {
          await openAutoSupportRequest({
            autoKey: `enterprise:${org.id}`,
            category: "billing",
            subject: `Into Enterprise: ${name}`,
            body: `${name} now has ${units} units, past the last priced band. Its subscription is unchanged; agree an Enterprise price with the board.`,
            organizationId: org.id,
          });
        }
        result.enterprise += 1;
        continue;
      }

      const to = bands.find((b) => b.slug === decision.to)!;
      if (dry) {
        result.moved.push({ orgId: org.id, from: decision.from, to: decision.to });
        continue;
      }
      const change = await changeBand({ stripe, orgId: org.id, sub, to, units, bands, idempotencyKey: `reband:${sub.id}:${to.slug}` });
      result.moved.push({ orgId: org.id, from: change.from, to: change.to });
      await writeOpsAuditEntry({
        action: "reband",
        actor: null,
        reason: `Units grew to ${units}, past the ${change.from ?? "current"} band.`,
        summary: `Moved ${name} from ${change.from ?? "?"} to ${change.to} at its next renewal (no proration).`,
        organization: org.id,
        organizationName: name,
        stripe: { subscription: sub.id, price: change.priceId },
        before: { band: change.from },
        after: { band: change.to, units, effective: change.renewsAt },
        idempotencyKey: `reband:${sub.id}:${to.slug}`,
      }).catch((e: any) => console.error("[reband] audit row not written:", e?.message ?? e));
      await announceBandChange({ id: org.id, name }, change, bands, "units");
    } catch (e: any) {
      console.error(`[reband] ${org.id}:`, e?.message ?? e);
      result.errors.push({ orgId: org.id, message: String(e?.message ?? e).slice(0, 200) });
    }
  }
  return result;
}

