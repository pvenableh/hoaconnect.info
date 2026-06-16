// apps/_bespoke-starter/nuxt.config.ts
// Template for a bespoke (Signature-tier) single-building site. It inherits ALL
// shared plumbing — backend, data, auth, composables, theme, /api routes — from
// the core layer, and contains ONLY this building's design.
//
// To spin up a real client: copy this folder to apps/<client>, set the env vars
// in .env (see .env.example), and create a Vercel project with
// Root Directory = apps/<client>. See README.md.

export default defineNuxtConfig({
  extends: ["../../core"],

  compatibilityDate: "2024-11-01",
  future: {
    compatibilityVersion: 4,
  },

  // Single-org binding: which building this app serves. Read from
  // NUXT_PUBLIC_ORG_SLUG; falls back to resolve-by-domain (/api/hoa/by-domain)
  // when empty. There is NO org-picker — useSelectedOrg/useBoundOrg lock to this.
  // (Declared in core runtimeConfig; restated here for visibility.)
  runtimeConfig: {
    public: {
      lockedOrgSlug: process.env.NUXT_PUBLIC_ORG_SLUG || "",
    },
  },

  // This app sets its OWN session password (NUXT_SESSION_PASSWORD) at deploy →
  // its own same-origin cookie against the SAME Directus backend. Independent
  // login per domain; no shared session / SSO. (core reads it from env.)

  // Bespoke design: blank canvas. Add your own components/layouts/CSS here.
});
