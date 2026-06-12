// nuxt.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  // Nuxt 4 compatibility
  compatibilityDate: "2024-11-01",
  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  modules: [
    "nuxt-auth-utils",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/fonts",
    "@nuxtjs/seo",
    "@vueuse/nuxt",
    "@vueuse/motion/nuxt",
    "@vee-validate/nuxt",
    "shadcn-nuxt",
  ],

  // vue-sonner ships its own stylesheet (toast positioning/animation/structure);
  // without it toasts render unstyled at the page bottom. Load it before our CSS
  // so our theme tokens (--normal-bg etc. in ui/sonner) can override on top.
  css: ["vue-sonner/style.css", "~/assets/css/main.css"],

  runtimeConfig: {
    // Server-only keys (never exposed to client-side)
    directusServerToken: process.env.DIRECTUS_STATIC_TOKEN,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD,
    directus: {
      url: process.env.DIRECTUS_URL,
      staticToken: process.env.DIRECTUS_STATIC_TOKEN,
    },
    // OpenWeatherMap key (server-only) — powers the landing Weather widget via
    // /api/landing/weather. One platform key covers all tenants; if unset the
    // weather widget hides gracefully.
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    // SendGrid configuration
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    // Universal invite email template (handles invitation, welcome, and accepted notification emails)
    sendgridInviteEmailTemplateId: process.env.SENDGRID_INVITE_EMAIL_TEMPLATE_ID,
    // HOA email template for organization emails (newsletters, announcements, etc.)
    sendgridEmailTemplateId: process.env.SENDGRID_EMAIL_TEMPLATE_ID,
    // Stripe configuration
    stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
    stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY_LIVE,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    // Stripe Connect: platform fee taken on resident dues routed through a
    // connected (Express) account, as a percentage of the charge. Default 2%.
    // Confirm the final rate with the business before going live.
    stripeConnectFeePercent: process.env.STRIPE_CONNECT_FEE_PERCENT || "2",

    public: {
      directus: {
        url: process.env.DIRECTUS_URL,
        websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL,
      },
      // Role IDs for permission checking
      // App Administrator - full system access
      directusRoleAppAdmin: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_APP_ADMIN || "c4903b32-db6f-4479-a627-55be7f328321",
      // HOA Admin - organization-level admin access
      directusRoleHoaAdmin: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_HOA_ADMIN || "38494e81-9b49-4c64-a197-fcb8097cd433",
      // HOA Member - regular member access (front-facing only)
      directusRoleMember: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_MEMBER || "558b04ed-fdcc-48c2-9cd0-977cccf988b9",
      // Property Manager - external management staff with admin-granted, org-scoped access
      directusRolePropertyManager: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_PROPERTY_MANAGER || "b3c5a96f-ca24-41f1-8c1f-5683db384844",
      // Legacy - keeping for backwards compatibility
      directusRoleAdmin: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_ADMIN,
      directusRoleUser: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER,
      // Legacy - can be removed after migration
      directusUrl: process.env.DIRECTUS_URL,
      mainDomain: process.env.NUXT_PUBLIC_MAIN_DOMAIN || "app.hoaconnect.info",
      // Mapbox public token (pk.*) for static location maps on org landing pages.
      // Set NUXT_PUBLIC_MAPBOX_TOKEN in the environment (kept out of the repo).
      mapboxToken: process.env.NUXT_PUBLIC_MAPBOX_TOKEN || "",
      appUrl: process.env.APP_URL || "http://localhost:3000",
      fromEmail: process.env.FROM_EMAIL,
      siteTitle: "Property Flow - Premier Property Management App",
      siteSubtitle: "",
      siteDescription:
        "Premier Property Management App for Property Owners and Property Managers. Streamline your property management with Property Flow.",
      // Stripe public key
      stripePublicKey:
        process.env.NODE_ENV === "production"
          ? process.env.STRIPE_PUBLIC_KEY_LIVE
          : process.env.STRIPE_PUBLIC_KEY_TEST,
      // Agency billing: flat per-seat Price IDs for the agency plan (one Product,
      // monthly + yearly recurring Prices). See docs/stripe-setup.md.
      agencyPriceIdMonthly: process.env.STRIPE_AGENCY_PRICE_ID_MONTHLY || "",
      agencyPriceIdYearly: process.env.STRIPE_AGENCY_PRICE_ID_YEARLY || "",
      companyName: "Property Flow",
      // Stripe Connect platform fee % (display only; the server recomputes the
      // authoritative fee from the private stripeConnectFeePercent).
      stripeConnectFeePercent: process.env.STRIPE_CONNECT_FEE_PERCENT || "2",
      // Default branding assets (Directus file IDs)
      // These are used when no organization is active or org has no custom branding
      defaultIconId: process.env.NUXT_PUBLIC_DEFAULT_ICON_ID || "",
      defaultLogoId: process.env.NUXT_PUBLIC_DEFAULT_LOGO_ID || "",
    },
  },

  vite: {
    // Cast: @tailwindcss/vite types against vite 7 while @nuxt/schema bundles
    // its own vite type identities — structurally identical, nominally not.
    plugins: [tailwindcss() as never],
  },

  build: {
    transpile: ["gsap", "swiper"],
  },

  app: {
    head: {
      charset: "utf-8",
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1.0, maximum-scale=5, viewport-fit=cover",
        },
      ],
      link: [
        {
          rel: "preconnect",
          href: process.env.DIRECTUS_URL || "",
        },
        {
          rel: "dns-prefetch",
          href: process.env.DIRECTUS_URL || "",
        },
        // Note: manifest, favicon, and apple-touch-icon are set dynamically
        // via useOrgBranding composable to support multi-tenant branding
      ],
    },
    pageTransition: { name: "page", mode: "out-in" },
    layoutTransition: { name: "layout", mode: "out-in" },
  },

  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
  },

  veeValidate: {
    autoImports: true,
    componentNames: {
      Form: "VeeForm",
      Field: "VeeField",
      FieldArray: "VeeFieldArray",
      ErrorMessage: "VeeErrorMessage",
    },
  },

  icon: {
    serverBundle: "remote",
    clientBundle: {
      scan: true,
    },
    collections: ["heroicons-outline", "heroicons-solid", "lucide"],
  },

  image: {
    quality: 80,
    format: ["webp", "avif", "png", "jpg"],
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
    providers: {
      directus: {
        provider: "~/providers/directus",
        options: {
          baseURL: process.env.DIRECTUS_URL,
        },
      },
    },
  },

  site: {
    url: process.env.APP_URL || "http://localhost:3000",
    name: "Property Flow - Premier Property Management App",
    description:
      "Premier Property Management App for Property Owners and Property Managers. Streamline your property management with Property Flow.",
    defaultLocale: "en",
    ogImage: "",
  },

  seo: {
    fallbackTitle: false,
  },

  ogImage: {
    enabled: true,
    defaults: {
      component: "NuxtSeo",
      width: 1200,
      height: 630,
      emojis: "noto",
    },
  },

  schemaOrg: {
    identity: {
      type: "Business",
      name: "Property Flow",
      alternateName: "Property Flow",
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

  typescript: {
    strict: false,
    typeCheck: false,
    shim: false,
  },
});
