// types/auth-session.d.ts
import type { DirectusRole } from "./directus-schema";

declare module "#auth-utils" {
  interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: DirectusRole;
    organizationId?: string;
    provider?: "local" | "google" | "github";
  }

  interface UserSession {
    user: User;
    loggedInAt?: number;
    expiresAt?: number;
  }

  // Tokens stored in secure encrypted section
  interface SecureSessionData {
    directusAccessToken?: string;
    directusRefreshToken?: string;
  }
}

export {};
