import {
  createDirectus,
  rest,
  staticToken,
  login,
  readMe,
  readItems,
} from "@directus/sdk";

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

    // Authenticate with Directus
    const authResult = await directus.request(login({ email, password }));

    if (!authResult.access_token) {
      throw new Error("Authentication failed");
    }

    // Create an authenticated client to fetch user data
    const authClient = createDirectus(config.directus.url)
      .with(staticToken(authResult.access_token))
      .with(rest());

    // Fetch user data with organization info
    const user = await authClient.request(
      readMe({
        fields: ["*", "role", { organization: ["id", "slug", "name", "custom_domain", "domain_verified"] }],
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
            "organization.id",
            "organization.name",
            "organization.slug",
            "organization.subscription_status",
            "organization.trial_ends_at",
            "role",
          ],
          sort: ["organization.name"],
        })
      );
    } catch (memberError) {
      console.warn("Could not fetch memberships:", memberError);
    }

    // Check subscription status for all organizations
    const hasActiveOrg = memberships.some(
      (m) =>
        m.organization?.subscription_status === "active" ||
        m.organization?.subscription_status === "trial"
    );
    const allExpired = memberships.length > 0 && memberships.every(
      (m) =>
        m.organization?.subscription_status === "expired" ||
        m.organization?.subscription_status === "canceled"
    );

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
      },
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
        memberships: memberships.map((m) => ({
          organizationId: m.organization?.id,
          organizationName: m.organization?.name,
          subscriptionStatus: m.organization?.subscription_status,
          trialEndsAt: m.organization?.trial_ends_at,
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
