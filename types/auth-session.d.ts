// types/auth-session.d.ts
// Type augmentation for nuxt-auth-utils session
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
    role?: any
    provider?: string
  }

  interface UserSession {
    user: User
    directusAccessToken?: string
    directusRefreshToken?: string
    loggedInAt?: number
    expiresAt?: number
  }
}

export {}