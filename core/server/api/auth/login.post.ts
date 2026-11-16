import { readItems } from "@directus/sdk";
import { passwordTokens, startPasswordSession } from "#core/server/utils/password-session";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email and password are required",
    });
  }

  try {
    // Directus checks the password; the session keeps its tokens
    // (password-session.ts, shared with accept-invitation).
    const user = await startPasswordSession(event, await passwordTokens(email, password));
    const avatarId = user.avatarId;

    // Fetch user's organization memberships with subscription status
    const adminDirectus = getTypedDirectus();
    let memberships: any[] = [];
    try {
      memberships = await adminDirectus.request(
        readItems("hoa_members", {
          filter: {
            user: { _eq: user.id },
          },
          fields: [
            "id",
            {
              organization: [
                "id",
                "name",
                "slug",
                // Entitlement (own fields + parent billing_account, resolved up)
                "subscription_status",
                "trial_ends_at",
                "is_free_account",
                {
                  billing_account: [
                    "id",
                    "subscription_status",
                    "trial_ends_at",
                    "is_free_account",
                    "status",
                  ],
                },
              ],
            },
            "role",
          ],
          // Dotted sort keys are runtime-valid in Directus but rejected by the SDK types
          sort: ["organization.name"] as unknown as ["organization"],
        })
      );
    } catch (memberError) {
      console.warn("Could not fetch memberships:", memberError);
    }

    // Resolve effective entitlement per org (resolves up to a parent
    // billing_account when set; otherwise the org's own subscription fields).
    const entitlements = memberships.map((m) => resolveEntitlement(m.organization));
    const hasActiveOrg = entitlements.some((e) => e.isEntitled);
    const allExpired =
      entitlements.length > 0 && entitlements.every((e) => !e.isEntitled);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: avatarId,
        role: user.role,
        organization: user.organization,
      },
      // Include subscription status info for redirect logic
      subscriptionInfo: {
        hasActiveOrg,
        allExpired,
        memberships: memberships.map((m, i) => ({
          organizationId: m.organization?.id,
          organizationName: m.organization?.name,
          // entitlements is mapped 1:1 from memberships, so index i always exists
          subscriptionStatus: entitlements[i]!.subscription_status,
          trialEndsAt: entitlements[i]!.trial_ends_at,
          isFreeAccount: entitlements[i]!.is_free_account,
        })),
      },
    };
  } catch (error: any) {
    console.error("Login error:", error);

    throw createError({
      statusCode: 401,
      statusMessage: error.message || "Invalid email or password",
    });
  }
});
