import {
  createDirectus,
  rest,
  staticToken,
  login,
  readMe,
} from "@directus/sdk";
import type { User } from "#auth-utils";

/**
 * POST /api/demo/login — one-click "Try the app" login.
 *
 * Signs the visitor into the shared, sandboxed demo-admin account (creds from
 * server-only runtimeConfig, provisioned by seed-demo.ts). No email/password is
 * ever taken from the client — the account is fixed — so this is safe to expose
 * behind a public "Try the demo" button. The demo user is a member of both demo
 * orgs (Harborview Lofts / The Beaumont Residences), so the org switcher toggles
 * the modern vs classic experience. Guardrails (no real email/payments, capped
 * AI, nightly reset) are enforced elsewhere off each org's is_demo flag.
 *
 * Disabled (404) when demo creds aren't configured.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const email = config.demoUserEmail as string | undefined;
  const password = config.demoUserPassword as string | undefined;

  if (!email || !password) {
    throw createError({ statusCode: 404, statusMessage: "Demo is not available" });
  }

  try {
    const directus = createDirectus(config.directus.url).with(rest());
    const authResult = await directus.request(login({ email, password }));
    if (!authResult.access_token) throw new Error("Demo authentication failed");

    const authClient = createDirectus(config.directus.url)
      .with(staticToken(authResult.access_token))
      .with(rest());
    const user = await authClient.request(
      readMe({ fields: ["*", "role", { organization: ["id", "slug", "name"] }] })
    );
    const avatarId = typeof user.avatar === "string" ? user.avatar : user.avatar?.id || null;

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
      } as User,
      loggedInAt: Date.now(),
      expiresAt: Date.now() + (authResult.expires || 900) * 1000,
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token!,
      },
    });

    // Land on the modern demo's dashboard (org root); the org switcher reaches
    // the classic one. The dashboard lives at the org root, not /{slug}/dashboard.
    return { success: true, redirect: "/demo" };
  } catch (error: any) {
    console.error("Demo login error:", error?.message || error);
    throw createError({ statusCode: 500, statusMessage: "Demo login failed" });
  }
});
