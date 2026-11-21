/**
 * Plan gating for forms to sign (docs/scope-notices-and-forms.md, decision 4 and
 * build step 5). Acknowledgments are free; forms to sign needs a plan that
 * includes it. Pure: the caller supplies the org's billing fields and plan.
 *
 * Order of the rules, first match wins:
 *  1. not entitled (expired, canceled, past due, grace over) -> blocked, "subscription"
 *  2. comped or free account                                  -> allowed
 *  3. the plan row's `features.forms_to_sign` is true / false  -> that answer
 *  4. the plan's band: Mid and up include it, Boutique does not
 *  5. no plan on record                                       -> blocked, "no_plan"
 * An org billed through an agency account uses the account's plan and entitlement,
 * as `resolveEntitlement` does.
 */
import { isEntitledFrom, type EntitlementOrg, type EntitlementSource } from "#core/shared/utils/entitlement";

export interface FormsPlan {
  slug?: string | null;
  features?: unknown;
  is_contact_only?: boolean | null;
}

export interface FormsPlanOrg extends EntitlementOrg {
  subscription_plan?: FormsPlan | string | null;
  billing_account?: (EntitlementSource & { subscription_plan?: FormsPlan | string | null }) | string | null;
}

/** Bands that include forms to sign. Boutique (the entry band) does not. */
export const FORMS_PLAN_SLUGS = ["mid", "larger", "grand", "enterprise"] as const;

export type FormsGateReason = "subscription" | "plan" | "no_plan";

export interface FormsGate {
  allowed: boolean;
  /** Why it is blocked; null when allowed. */
  reason: FormsGateReason | null;
  /** The plan slug the answer was read from, if any. */
  plan: string | null;
}

const planOf = (v: FormsPlan | string | null | undefined): FormsPlan | null => (v && typeof v === "object" ? v : null);

export function formsGate(org: FormsPlanOrg | null | undefined, now: Date = new Date()): FormsGate {
  if (!org) return { allowed: false, reason: "no_plan", plan: null };
  const account = org.billing_account && typeof org.billing_account === "object" ? org.billing_account : null;
  const src = account ?? org;
  const plan = planOf(src.subscription_plan) ?? planOf(org.subscription_plan);
  const slug = plan?.slug ?? null;

  if (!isEntitledFrom(src, now)) return { allowed: false, reason: "subscription", plan: slug };
  if (src.is_free_account === true) return { allowed: true, reason: null, plan: slug };

  const flag = plan?.features && typeof plan.features === "object" ? (plan.features as Record<string, unknown>).forms_to_sign : undefined;
  if (flag === true) return { allowed: true, reason: null, plan: slug };
  if (flag === false) return { allowed: false, reason: "plan", plan: slug };

  if (!plan) return { allowed: false, reason: "no_plan", plan: null };
  if (plan.is_contact_only === true || (slug && (FORMS_PLAN_SLUGS as readonly string[]).includes(slug))) {
    return { allowed: true, reason: null, plan: slug };
  }
  return { allowed: false, reason: "plan", plan: slug };
}

/** The sentence the upgrade prompt and the 402 carry, by reason. */
export function formsGateMessage(reason: FormsGateReason | null): string {
  if (reason === "subscription") return "Renew your subscription to use forms to sign.";
  return "Forms to sign are included from the Mid plan up. Upgrade to send forms for signature.";
}
