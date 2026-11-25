/**
 * Server side of plan gating for forms to sign. The decision is the pure
 * `formsGate`; this reads the org's billing fields and plan (and the agency
 * account's, when it bills the org) with the admin token.
 */
import { readItem } from "@directus/sdk";
import { formsGate, formsGateMessage, type FormsGate, type FormsPlanOrg } from "#core/shared/billing/forms-plan";

import type { ReadSpec } from "./directus-graphql";

const PLAN = ["slug", "features", "is_contact_only"];

const ORG_FIELDS = ["subscription_status", "trial_ends_at", "is_free_account", "grace_ends_at"];
const ACCOUNT_FIELDS = ["subscription_status", "trial_ends_at", "is_free_account"];

/**
 * getFormsGate's read, as a batch spec: the community's plan fields, dotted.
 * A missing row means a missing community; call getFormsGate to fail as it fails.
 */
export function formsGateSpec(orgId: string): ReadSpec {
  return {
    collection: "hoa_organizations",
    filter: { id: { _eq: orgId } },
    fields: [
      ...ORG_FIELDS,
      ...PLAN.map((f) => `subscription_plan.${f}`),
      ...ACCOUNT_FIELDS.map((f) => `billing_account.${f}`),
      ...PLAN.map((f) => `billing_account.subscription_plan.${f}`),
    ],
    limit: 1,
  };
}

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
