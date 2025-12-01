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

  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    // Server-only keys (never exposed to client-side)
    directusServerToken: process.env.DIRECTUS_STATIC_TOKEN,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD,
    directus: {
      url: process.env.DIRECTUS_URL,
      staticToken: process.env.DIRECTUS_STATIC_TOKEN,
    },
    vercel: {
      apiToken: process.env.VERCEL_API_TOKEN,
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID || "",
    },
    // SendGrid configuration
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    sendgridInvitationTemplateId: process.env.SENDGRID_INVITATION_TEMPLATE_ID,
    sendgridWelcomeTemplateId: process.env.SENDGRID_WELCOME_TEMPLATE_ID,
    sendgridInvitationAcceptedTemplateId:
      process.env.SENDGRID_INVITATION_ACCEPTED_TEMPLATE_ID,
    // Stripe configuration
    stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
    stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY_LIVE,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

    public: {
      directus: {
        url: process.env.DIRECTUS_URL,
        websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL,
      },
      // Role IDs for permission checking
      directusRoleAdmin: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_ADMIN,
      directusRoleUser: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER,
      // Legacy - can be removed after migration
      directusUrl: process.env.DIRECTUS_URL,
      mainDomain: process.env.NUXT_PUBLIC_MAIN_DOMAIN,
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
      companyName: "Property Flow",
    },
  },

  vite: {
    plugins: [tailwindcss()],
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
          href: process.env.DIRECTUS_URL,
        },
        {
          rel: "dns-prefetch",
          href: process.env.DIRECTUS_URL,
        },
        {
          rel: "manifest",
          href: "/manifest.webmanifest",
        },
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
    collections: ["heroicons-outline", "heroicons-solid", "lucide"],
  },

  image: {
    quality: 80,
    format: ["webp", "avif", "png", "jpg"],
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
        : "https://property.huestudios.com",
      logo: process.env.NUXT_PUBLIC_MAIN_DOMAIN
        ? `https://${process.env.NUXT_PUBLIC_MAIN_DOMAIN}/logo.png`
        : "https://property.huestudios.com/logo.png",
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
