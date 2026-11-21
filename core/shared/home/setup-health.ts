// The admin home's "Setup health" Needs-you item (docs/plan-unified-experience.md
// §5). Pure: it reads the org row the Settings glance already reads and returns
// only what is wrong, each with where to fix it. Nothing wrong returns [].
import { resolveEntitlement } from "../utils/entitlement";

export interface SetupIssue {
  key: "plan" | "site" | "payouts";
  label: string;
  detail: string;
  tone: "warn" | "bad";
  /** Org-relative path that fixes it. */
  path: string;
}

const daysUntil = (iso: string | null | undefined, now: Date) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.ceil((t - now.getTime()) / 86_400_000) : null;
};

export function setupIssues(org: any, opts: { paymentsOn: boolean; now?: Date }): SetupIssue[] {
  if (!org) return [];
  const now = opts.now ?? new Date();
  const out: SetupIssue[] = [];

  const ent = resolveEntitlement(org, now);
  const plan = "/admin/settings/organization?tab=subscription";
  if (!ent.is_free_account) {
    if (ent.inGrace) out.push({ key: "plan", label: "Billing", detail: "Grace period: set up billing to keep access", tone: "warn", path: plan });
    else if (ent.subscription_status === "past_due") out.push({ key: "plan", label: "Billing", detail: "A payment failed", tone: "bad", path: plan });
    else if (ent.subscription_status === "canceled" || ent.subscription_status === "expired")
      out.push({ key: "plan", label: "Billing", detail: "Resubscribe to keep access", tone: "bad", path: plan });
    else if (ent.subscription_status === "trial") {
      const left = daysUntil(ent.trial_ends_at, now);
      if (left != null && left <= 7) out.push({ key: "plan", label: "Billing", detail: `Trial ends in ${Math.max(left, 0)} day${left === 1 ? "" : "s"}`, tone: "warn", path: plan });
    } else if (ent.subscription_status !== "active") out.push({ key: "plan", label: "Billing", detail: "No plan chosen", tone: "warn", path: plan });
  }

  if (!org.external_url && org.custom_domain && !org.domain_verified)
    out.push({ key: "site", label: "Custom domain", detail: `${org.custom_domain} is not verified yet`, tone: "warn", path: "/admin/settings/domains" });

  if (opts.paymentsOn) {
    const pay = "/admin/settings/organization?tab=payments";
    const status = org.connect_onboarding_status || "none";
    if (status === "active") {
      if (org.connect_payouts_enabled === false) out.push({ key: "payouts", label: "Payouts", detail: "Stripe has paused payouts", tone: "warn", path: pay });
    } else if (status === "pending") out.push({ key: "payouts", label: "Payouts", detail: "Stripe still needs details", tone: "warn", path: pay });
    else if (status === "restricted") out.push({ key: "payouts", label: "Payouts", detail: "Stripe needs more information", tone: "bad", path: pay });
    else out.push({ key: "payouts", label: "Payouts", detail: "Not connected, so no online dues yet", tone: "warn", path: pay });
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));
}
