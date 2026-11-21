/**
 * Server side of plan gating for forms to sign. The decision is the pure
 * `formsGate`; this reads the org's billing fields and plan (and the agency
 * account's, when it bills the org) with the admin token.
 */
import { readItem } from "@directus/sdk";
import { formsGate, formsGateMessage, type FormsGate, type FormsPlanOrg } from "#core/shared/billing/forms-plan";

const PLAN = ["slug", "features", "is_contact_only"];

export async function getFormsGate(orgId: string): Promise<FormsGate> {
  const org = (await getTypedDirectus().request(
    readItem("hoa_organizations", orgId, {
      fields: [
        "subscription_status", "trial_ends_at", "is_free_account", "grace_ends_at",
        { subscription_plan: PLAN },
        { billing_account: ["subscription_status", "trial_ends_at", "is_free_account", { subscription_plan: PLAN }] },
      ] as never,
    })
  )) as FormsPlanOrg;
  return formsGate(org);
}

/** Throws 402 with the upgrade sentence when the org's plan does not include forms to sign. */
export async function requireFormsPlan(orgId: string): Promise<void> {
  const gate = await getFormsGate(orgId);
  if (!gate.allowed) {
    throw createError({ statusCode: 402, statusMessage: formsGateMessage(gate.reason), data: { code: "forms_plan", reason: gate.reason } });
  }
}
