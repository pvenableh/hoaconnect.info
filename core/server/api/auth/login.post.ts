import {
  createDirectus,
  rest,
  staticToken,
  login,
  readMe,
  readItems,
} from "@directus/sdk";
import type { User } from "#auth-utils";

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email and password are required",
    });
  }

  try {
    const config = useRuntimeConfig();

    // Create a client for login
    const directus = createDirectus(config.directus.url).with(rest());

    // Authenticate with Directus. mode:"json" is REQUIRED so the refresh token
    // comes back in the response body — the SDK default is "cookie", which returns
    // it as an httpOnly cookie (unusable cross-origin) and leaves
    // authResult.refresh_token undefined. Without it the sealed session stores no
    // refresh token, and every user-token call 401s ("Session refresh unavailable")
    // once the ~15-min access token expires. Matches the mode:"json" used by every
    // refresh() call in server/utils/directus.ts.
    const authResult = await directus.request(login({ email, password }, { mode: "json" }));

    if (!authResult.access_token) {
      throw new Error("Authentication failed");
    }
    if (!authResult.refresh_token) {
      // Shouldn't happen with mode:"json"; guard so a bad session can't silently
      // be created without the ability to refresh.
      throw new Error("Authentication did not return a refresh token");
    }

    // Create an authenticated client to fetch user data
    const authClient = createDirectus(config.directus.url)
      .with(staticToken(authResult.access_token))
      .with(rest());

    // Fetch user data with organization info
    const user = await authClient.request(
      readMe({
        fields: ["*", "role", { organization: ["id", "slug", "name"] }],
      })
    );

    // Extract avatar ID (can be string or object with id)
    const avatarId = typeof user.avatar === 'string' ? user.avatar : user.avatar?.id || null;

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

    // Set user session with tokens in secure section
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatar: avatarId,
        role: user.role,
        organization: user.organization,
        provider: "local",
        // The session stores the full organization object; the augmented User
        // type only models organizationId.
      } as User,
      loggedInAt: Date.now(),
      expiresAt: Date.now() + ((authResult.expires || 900) * 1000), // Convert seconds to milliseconds
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token,
      },
    });

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
