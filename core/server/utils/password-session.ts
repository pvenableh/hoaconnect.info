/**
 * Sign someone in with their HOA Connect password: Directus checks it, and the
 * app's sealed session keeps the tokens. Shared by /api/auth/login and
 * /api/hoa/accept-invitation so an accepted invitation starts the same
 * session a sign-in does.
 */
import type { H3Event } from "h3";
import { createDirectus, login, readMe, rest, staticToken } from "@directus/sdk";
import type { User } from "#auth-utils";

export interface PasswordTokens {
  access_token: string;
  refresh_token: string;
  /** Seconds the access token lasts. */
  expires: number | null;
}

/**
 * Check `password` for `email` with Directus. Throws when Directus refuses it:
 * a wrong password, or an account that may not sign in (suspended, invited).
 */
export async function passwordTokens(email: string, password: string): Promise<PasswordTokens> {
  const config = useRuntimeConfig();
  // mode "json" so the refresh token comes back in the body; without it the
  // session has no refresh token and every user-token call 401s after ~15 min.
  const result = await createDirectus(config.directus.url)
    .with(rest())
    .request(login({ email, password }, { mode: "json" }));
  if (!result.access_token) throw new Error("Authentication failed");
  if (!result.refresh_token) throw new Error("Authentication did not return a refresh token");
  return { access_token: result.access_token, refresh_token: result.refresh_token, expires: result.expires ?? null };
}

/** The signed-in account, as /api/auth/login returns it. */
export interface SessionAccount {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar?: unknown;
  role: unknown;
  organization: unknown;
  avatarId: string | null;
}

/** Start the app's session for the account `tokens` belong to; returns that account. */
export async function startPasswordSession(event: H3Event, tokens: PasswordTokens): Promise<SessionAccount> {
  const config = useRuntimeConfig();
  const user = (await createDirectus(config.directus.url)
    .with(staticToken(tokens.access_token))
    .with(rest())
    .request(readMe({ fields: ["*", "role", { organization: ["id", "slug", "name"] }] }))) as unknown as Omit<SessionAccount, "avatarId">;

  const avatarId = typeof user.avatar === "string" ? user.avatar : (user.avatar as { id?: string } | null)?.id || null;

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
    expiresAt: Date.now() + (tokens.expires || 900) * 1000,
    secure: {
      directusAccessToken: tokens.access_token,
      directusRefreshToken: tokens.refresh_token,
    },
  });

  return { ...user, avatarId };
}
