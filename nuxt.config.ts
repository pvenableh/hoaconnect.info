// nuxt.config.ts
// The multi-tenant HOA Connect app (app.hoaconnect.info). Inherits all shared
// plumbing (modules, CSS/theme, runtimeConfig, image/icon, auth) from the core
// layer; only app-identity overrides live here. App-specific UI (pages, layouts,
// components, lib) and the debug API stay in this package.

export default defineNuxtConfig({
  extends: ["./core"],

  // Nuxt 4 compatibility (also declared in core; kept here as the consuming app
  // is the authoritative place for the compatibility version).
  compatibilityDate: "2024-11-01",
  future: {
    compatibilityVersion: 4,
  },

  // shadcn component dir is app-local (the shadcn ui kit + feature components live
  // in this app). The shadcn-nuxt module itself is provided by the core layer.
  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
  },

  // Site identity / SEO defaults for the platform app. Bespoke apps override these.
  site: {
    url: process.env.APP_URL || "http://localhost:3000",
    name: "HOA Connect - Premier Property Management App",
    description:
      "Premier Property Management App for Property Owners and Property Managers. Streamline your property management with HOA Connect.",
    defaultLocale: "en",
    ogImage: "",
  },

  schemaOrg: {
    identity: {
      type: "Business",
      name: "HOA Connect",
      alternateName: "HOA Connect",
      url: process.env.NUXT_PUBLIC_MAIN_DOMAIN
        ? `https://${process.env.NUXT_PUBLIC_MAIN_DOMAIN}`
        : "https://www.hoaconnect.info",
      logo: process.env.NUXT_PUBLIC_MAIN_DOMAIN
        ? `https://${process.env.NUXT_PUBLIC_MAIN_DOMAIN}/logo.png`
        : "https://www.hoaconnect.info/logo.png",
      address: {
        type: "PostalAddress",
        streetAddress: "605 Lincoln Road",
        addressLocality: "Miami Beach",
        addressRegion: "FL",
        postalCode: "33139",
        addressCountry: "US",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 25.7907,
        longitude: -80.1341,
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "Business",
        email: "contact@huestudios.com",
      },
    },
  },
});
