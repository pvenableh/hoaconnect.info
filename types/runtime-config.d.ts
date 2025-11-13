// types/runtime-config.d.ts

declare module "nuxt/schema" {
  interface RuntimeConfig {
    directus: {
      url: string;
      staticToken: string;
    };
    vercel: {
      apiToken: string;
      projectId: string;
      teamId: string;
    };
  }

  interface PublicRuntimeConfig {
    directusUrl: string;
    mainDomain: string;
  }
}

export {};
