// nuxt.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  extends: ["directus-nuxt-layer"],
  devtools: { enabled: true },
  debug: true,
  modules: [
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/fonts",
    "@nuxtjs/seo",
    "@vueuse/nuxt",
    "@vueuse/motion/nuxt",
    "shadcn-nuxt",
  ],
  shadcn: {
    prefix: "",
    componentDir: "./components/ui",
  },
  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    // Server-only keys (never exposed to client-side)
    directusServerToken: process.env.DIRECTUS_STATIC_TOKEN || "",
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
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
    sendgridInvitationTemplateId:
      process.env.SENDGRID_INVITATION_TEMPLATE_ID || "",
    sendgridWelcomeTemplateId: process.env.SENDGRID_WELCOME_TEMPLATE_ID || "",
    sendgridInvitationAcceptedTemplateId:
      process.env.SENDGRID_INVITATION_ACCEPTED_TEMPLATE_ID || "",

    public: {
      directus: {
        url: process.env.DIRECTUS_URL,
        websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL,
      },
      directusUrl: process.env.DIRECTUS_URL,
      mainDomain: process.env.NUXT_PUBLIC_MAIN_DOMAIN,
      appUrl: process.env.APP_URL || "http://localhost:3000",
      fromEmail: process.env.FROM_EMAIL || "noreply@605lincolnroad.com",
      siteTitle: "605 Lincoln Road",
      siteSubtitle: "",
      siteDescription:
        "605 Lincoln is a prominent Streamline Moderne structure located on the famous pedestrian mall at the corner of Pennsylvania Avenue and Lincoln Road in Miami Beach.",
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
          href: "https://admin.605lincolnroad.com",
        },
        {
          rel: "dns-prefetch",
          href: "https://admin.605lincolnroad.com",
        },
        {
          rel: "manifest",
          href: "/manifest.webmanifest",
        },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/icon-192x192.png",
        },
      ],
    },
  },
  site: {
    url: "https://605lincolnroad.com",
    name: "605 Lincoln Road - Premier Streamline Moderne Structure in Miami Beach",
    description:
      "605 Lincoln Road is a prominent Streamline Moderne structure located on the famous pedestrian mall at the corner of Pennsylvania Avenue and Lincoln Road in Miami Beach.",
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
      name: "605 Lincoln",
      alternateName: "605 Lincoln Road",
      url: "https://605lincolnroad.com",
      logo: "https://605lincolnroad.com/logo.png",
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
        email: "contact@605lincolnroad.com",
      },
    },
  },
});
