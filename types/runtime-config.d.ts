// types/runtime-config.d.ts
// Type augmentation for Nuxt runtime config

declare module "nuxt/schema" {
  interface RuntimeConfig {
    // Server-only config (never exposed to client)
    directus: {
      url: string;
      staticToken: string;
    };
    directusServerToken: string; // Alias

    vercel: {
      apiToken: string;
      projectId: string;
      teamId: string;
    };

    // Session
    sessionPassword: string;

    // SendGrid
    sendgridApiKey: string;
    sendgridInvitationTemplateId: string;
    sendgridWelcomeTemplateId: string;
    sendgridInvitationAcceptedTemplateId: string;
  }

  interface PublicRuntimeConfig {
    // Public config (exposed to client)
    directus: {
      url: string;
      websocketUrl?: string;
    };
    directusUrl: string; // Alias for backwards compatibility
    mainDomain: string;
    appUrl: string;
    fromEmail: string;
    siteTitle: string;
    siteSubtitle: string;
    siteDescription: string;
  }
}

export {};
