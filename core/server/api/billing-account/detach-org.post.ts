// POST /api/billing-account/detach-org
// Agency billing P4 migration (docs/plan-agency-multi-property-billing.md §9.3):
// remove an org from its billing account. Clears org.billing_account and
// decrements the account's seats (Stripe prorates down). Requires the caller to
// manage the account (owner/billing_admin) AND be an admin of the org.
//
// **Changed in Phase 4.** This used to set `subscription_status: "expired"` in
// the same write, which locked the board out the instant their property left the
// account — no administrator handover, no notice, no record. It now runs the
// same transition machinery as the wizard with an EMPTY outgoing list: billing
// moves to the community behind a 60-day grace window, the seat count still
// syncs, and the change lands in the community's audit log.
//
// Nobody is offboarded here, deliberately. Detaching a property from an agency's
// billing account is a billing change; the manager may well carry on managing
// it. Ending someone's access is what `/api/org/transition/execute` is for, and
// it asks who takes over first.
import { z } from "zod";
import { readItem } from "@directus/sdk";
import { planTransition } from "#core/shared/transition/plan";

const schema = z.object({ orgId: z.string().min(1) });

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: "orgId is required" });
  }
  const { orgId } = parsed.data;

  const directus = getTypedDirectus();
  const org: any = await directus.request(
    readItem("hoa_organizations", orgId, { fields: ["id", "billing_account"] })
  );
  const accountId =
    typeof org.billing_account === "object" ? org.billing_account?.id : org.billing_account;
  if (!accountId) {
    throw createError({ statusCode: 409, message: "Organization is not account-billed" });
  }

  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      message: "You must be an admin of the organization to detach it",
    });
  }

  const session = await requireUserSession(event);
  const user: any = session.user ?? {};
  const now = new Date().toISOString();

  const snapshot = await buildTransitionSnapshot(orgId, {
    now,
    // Explicitly nobody: a billing change, not an offboarding. The planner
    // treats an empty array differently from an absent one for exactly this.
    outgoingMemberIds: [],
  });

  const plan = planTransition(snapshot.input);

  const result = await executeTransitionPlan({
    plan,
    organizationId: snapshot.organization.id,
    organizationName: snapshot.organization.name,
    hoaAdminRoleId: snapshot.hoaAdminRoleId,
    billingAccountId: accountId,
    actor: {
      userId: user.id ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "An administrator",
      email: user.email ?? null,
    },
    now,
  });

  if (!result.completed) {
    const failed = result.steps.find((s) => s.status === "failed");
    throw createError({
      statusCode: 500,
      message: `Detach stopped at "${failed?.label ?? "an unknown step"}". ${failed?.note ?? ""}`.trim(),
      data: result,
    });
  }

  // The seat count is synced inside the detach step; re-read it for the
  // response so the agency dashboard shows the number it always did.
  const seats = await syncBillingAccountSeats(accountId);

  return {
    success: true,
    orgId,
    accountId,
    seats: seats.seats,
    // New, and the reason the caller should stop treating this as a hard cut:
    // the community keeps working until this date.
    graceEndsAt: result.graceEndsAt,
  };
});
