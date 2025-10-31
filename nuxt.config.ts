// nuxt.config.ts
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  devtools: { enabled: true },
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
    // Private keys (server-side only)
    adminPassword: process.env.ADMIN_PASSWORD || "portfolio123",
    jwtSecret: process.env.JWT_SECRET || "your-secret-key",

    // Public keys (exposed to client-side)
    public: {
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
