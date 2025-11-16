// types/auth-session.d.ts
// Type augmentation for nuxt-auth-utils

import type { DirectusRole } from "./directus-schema";

declare module "#auth-utils" {
  interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: DirectusRole;
    organizationId?: string; // For multi-tenancy
    provider?: "local" | "google" | "github"; // More specific types
  }

  interface UserSession {
    user: User;
    directusAccessToken?: string;
    directusRefreshToken?: string;
    loggedInAt?: number;
    expiresAt?: number;
  }
}

export {};
