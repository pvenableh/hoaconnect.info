// core/nuxt.config.ts
// Shared HOA Connect Nuxt LAYER, extended by the app at the repo root via
// `extends: ['./core']`.
// Holds the base plumbing every app inherits: modules, global CSS/theme, runtimeConfig
// (all env-var names unchanged so existing Vercel env keeps working), image/icon config,
// and the `#core` alias used by moved code to reference this layer's files.
// This layer is never built or deployed on its own.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";

// Absolute path to this layer's root, so `#core/...` resolves to core regardless of
// which app is consuming the layer (the consumer's `~`/`@`/`~~` point at the consumer).
const coreDir = fileURLToPath(new URL(".", import.meta.url));

// Stripe test/live mode. An explicit override so the PRODUCTION instance can run in
// Stripe TEST mode — complete Connect onboarding + payment/subscription dry-runs with
// test cards before taking real money — without flipping NODE_ENV. Set STRIPE_MODE=test
// (or =live). Unset → derive from NODE_ENV, so existing deployments are unchanged.
// The server-side counterpart is isStripeLiveMode() in core/server/utils/stripe.ts;
// keep the two in lockstep.
const stripeLiveMode = process.env.STRIPE_MODE
  ? process.env.STRIPE_MODE.toLowerCase() === "live"
  : process.env.NODE_ENV === "production";

// Build identity — the spine of client-side version detection (see useAppVersion +
// /api/version). Resolved ONCE at build/boot time and baked into the client bundle as
// runtimeConfig.public.buildId. After a redeploy the server boots with a fresh id, so a
// still-open tab (carrying the OLD baked id) polls /api/version, sees a mismatch, and
// can prompt the user to refresh. Must therefore be unique-per-deploy and stable within
// a deploy. Preference order: Vercel's per-deploy id → commit SHA → git SHA → dev stamp.
function resolveBuildId(): string {
  if (process.env.VERCEL_DEPLOYMENT_ID) return process.env.VERCEL_DEPLOYMENT_ID;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // No git context (e.g. some CI/containers) — fall back to a boot timestamp so the
    // value is still stable for this process and changes on the next build.
    return `build-${Date.now()}`;
  }
}
const buildId = resolveBuildId();

// ---------------------------------------------------------------------------
// Human-facing app version — the "Property Flow v2.1.1027" label.
//
// MAJOR.MINOR come from the consuming app's package.json; the PATCH is the git
// commit count (`git rev-list --count HEAD`), so the visible number moves on
// every deploy without anyone editing a file. That movement is the point: it is
// the at-a-glance signal that a fresh build shipped.
//
// TAG-FREE BY DESIGN (ported from Earnest, which learned this the hard way). An
// earlier scheme there used `git describe --tags`; Vercel's authenticated clone
// fetches commits but NOT tags, so `describe` failed on every deploy and the
// version silently froze at the static package.json value. Counting commits
// needs only commit history, which `--unshallow` can restore — never tags.
//
// ⚠️ This is only the LABEL. Deploy freshness — the "a new version is
// available" prompt — is driven by `buildId` above and is untouched by any of
// this. Nothing parses `version` as numeric semver, which is what makes the
// sha7 fallback below safe.
function tryGit(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// Read rather than `import ... from "./package.json"`: this layer has no
// package.json of its own, so the version belongs to whichever app extends it,
// and a static import would bake the repo-root path into the layer.
function readPkgVersion(): string {
  try {
    const raw = readFileSync(resolve(coreDir, "..", "package.json"), "utf8");
    return String(JSON.parse(raw).version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function resolveAppVersion(): string {
  // Explicit override always wins (CI, a manual lever, a Vercel env var).
  const envVer = process.env.NUXT_PUBLIC_APP_VERSION?.trim();
  if (envVer) return envVer;

  const pkgVersion = readPkgVersion();
  // MAJOR.MINOR base from package.json; its static patch is deliberately ignored.
  const [major = "0", minor = "0"] = pkgVersion.split(".");
  const base = `${major}.${minor}`;

  // Vercel/CI usually hand us a shallow clone (the tip N commits only), which
  // would undercount. Try to complete the COMMIT history first — a no-op on a
  // full clone. On Vercel's build container the unshallow typically CANNOT
  // succeed, so re-check afterwards rather than trusting the count blindly.
  let shallow = tryGit("git rev-parse --is-shallow-repository") === "true";
  if (shallow) {
    tryGit("git fetch --unshallow --quiet");
    tryGit("git fetch --deepen=2147483647 --quiet");
    shallow = tryGit("git rev-parse --is-shallow-repository") === "true";
  }

  // Only trust the count when the history is actually COMPLETE. A shallow clone
  // would freeze the label at the clone depth — the "stuck at 2.0.10" bug.
  if (!shallow) {
    const count = tryGit("git rev-list --count HEAD");
    if (count && /^\d+$/.test(count)) return `${base}.${count}`;
  }

  // Shallow and un-deepenable, or no git at all: fall back to the deploy's
  // commit SHA as the patch. It is honest and it CHANGES every deploy, which
  // the frozen count would not.
  const sha = (
    process.env.NUXT_PUBLIC_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    tryGit("git rev-parse HEAD") ||
    ""
  ).slice(0, 7);
  if (sha) return `${base}.${sha}`;

  // Last resort — the static package.json version, so the app still boots.
  return pkgVersion;
}

const appVersion = resolveAppVersion();
// Surface the resolved version in build/deploy logs for at-a-glance sanity.
console.log(`[version] app version resolved to ${appVersion}`);

export default defineNuxtConfig({
  // Nuxt 4 compatibility
  compatibilityDate: "2024-11-01",
  future: {
    compatibilityVersion: 4,
  },

  devtools: { enabled: true },

  // Dedicated, collision-free alias for layer-internal references. `~~`/`@@` resolve to
  // the *consuming* app's root, so moved code references this layer via `#core/...`.
  alias: {
    "#core": coreDir,
  },

  modules: [
    "nuxt-auth-utils",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/fonts",
    "@nuxtjs/seo",
    "@vueuse/nuxt",
    "@vee-validate/nuxt",
    "shadcn-nuxt",
  ],

  // vue-sonner ships its own stylesheet (toast positioning/animation/structure);
  // without it toasts render unstyled at the page bottom. Load it before our CSS
  // so our theme tokens (--normal-bg etc. in ui/sonner) can override on top.
  // main.css is referenced by absolute path so it resolves to the layer, not the app.
  css: ["vue-sonner/style.css", resolve(coreDir, "app/assets/css/main.css")],

  runtimeConfig: {
    // Server-only keys (never exposed to client-side)
    directusServerToken: process.env.DIRECTUS_STATIC_TOKEN,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD,
    // nuxt-auth-utils sealed session cookie. Without an explicit maxAge it's a
    // browser-SESSION cookie that dies on browser close/restart; setting maxAge
    // makes it a PERSISTENT rolling cookie matching the 7-day Directus refresh
    // token, so a restart no longer logs the user out. (Earnest parity §4.)
    session: {
      maxAge: 60 * 60 * 24 * 7,
      password: process.env.NUXT_SESSION_PASSWORD,
      cookie: { sameSite: "lax" },
    },
    directus: {
      url: process.env.DIRECTUS_URL,
      staticToken: process.env.DIRECTUS_STATIC_TOKEN,
    },
    // Web push (VAPID). The PRIVATE key is server-only and must never be
    // exposed; the public one is published under `public` below so the browser
    // can subscribe. Generate a pair with `npx web-push generate-vapid-keys`.
    // Leave both empty and web push cleanly disables itself everywhere — the
    // account UI hides it and every send path becomes a no-op.
    vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY || "",
    vapidSubject: process.env.NUXT_VAPID_SUBJECT || "mailto:support@hoaconnect.info",
    // OpenWeatherMap key (server-only) — powers the landing Weather widget via
    // /api/landing/weather. One platform key covers all tenants; if unset the
    // weather widget hides gracefully.
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    // Anthropic (Claude) key for the metered AI assistant ("Draft with AI" +
    // credit economy). Server-only; if unset the AI routes return 503 and the
    // composer's Draft-with-AI button hides.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // Public "try the app" demo. Shared demo-admin creds used by /api/demo/login
    // (and seed-demo.ts). When either is unset the demo login route is disabled.
    demoUserEmail: process.env.DEMO_USER_EMAIL,
    demoUserPassword: process.env.DEMO_USER_PASSWORD,
    // Guardrail switch: when "true", is_demo orgs may send REAL emails (so the
    // owner can test delivery); otherwise demo email is simulated/logged only.
    demoAllowEmail: process.env.DEMO_ALLOW_EMAIL,
    // Voyage AI embedding key (server-only) — powers doc/bylaw RAG retrieval.
    // A separate vendor (own key/billing; does NOT consume Anthropic tokens),
    // metered into the same AI wallet as an `embed` feature. When unset every RAG
    // surface auto-hides (isRagConfigured() === false) and the assistant runs
    // exactly as before.
    voyageApiKey: process.env.VOYAGE_API_KEY,
    // SendGrid configuration
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    // Universal invite email template (handles invitation, welcome, and accepted notification emails)
    sendgridInviteEmailTemplateId: process.env.SENDGRID_INVITE_EMAIL_TEMPLATE_ID,
    // HOA email template for organization emails (newsletters, announcements, etc.)
    sendgridEmailTemplateId: process.env.SENDGRID_EMAIL_TEMPLATE_ID,
    // SendGrid Signed Event Webhook verification key (base64 DER public key from
    // Settings → Mail Settings → Signed Event Webhook). When set, /api/email/
    // activity rejects unsigned/forged posts; when unset, events are accepted
    // unverified (with a warning) so the webhook works before signing is enabled.
    sendgridWebhookPublicKey: process.env.SENDGRID_WEBHOOK_PUBLIC_KEY,
    // Optional downstream consumer for the raw SendGrid event batch (fan-out).
    // When set, /api/email/activity forwards each batch verbatim here (e.g. the
    // legacy 1033 Lenox Directus flow trigger), so a single SendGrid Event
    // Webhook can serve both apps. The downstream applies its own category
    // filter. Unset = no forwarding.
    emailActivityForwardUrl: process.env.EMAIL_ACTIVITY_FORWARD_URL,
    // Timeout (ms) for that forward. The 1033 flow trigger responds slowly when
    // synchronous (cold start + inline ops); the request body is sent
    // immediately, so the downstream still fires even if we stop waiting. Tune
    // from Vercel without a redeploy. Default 15s.
    emailActivityForwardTimeoutMs: process.env.EMAIL_ACTIVITY_FORWARD_TIMEOUT_MS,
    // Optional category filter for the fan-out. When set, only events whose
    // `category` array contains an entry including this substring are forwarded,
    // and a batch with zero matches is NOT POSTed at all. This keeps a finicky
    // downstream (the 1033 Lenox flow's `_some` condition throws "Value is
    // required" on non-matching batches) from ever receiving a batch it can't
    // match. Unset = forward the raw batch verbatim (downstream self-filters).
    emailActivityForwardCategory: process.env.EMAIL_ACTIVITY_FORWARD_CATEGORY,
    // A SECOND, independent fan-out target (e.g. WeddingConnect), forwarded the
    // same way as the first with its own category filter — so one shared SendGrid
    // Event Webhook can serve a third app without disturbing the 1033 Lenox forward
    // above. Unset = no second forward. Auth the downstream via a token in its URL
    // (e.g. …/api/email/activity?k=<secret>), since we send no custom headers.
    emailActivityForwardUrl2: process.env.EMAIL_ACTIVITY_FORWARD_URL_2,
    emailActivityForwardCategory2: process.env.EMAIL_ACTIVITY_FORWARD_CATEGORY_2,
    // Stripe configuration
    stripeSecretKeyTest: process.env.STRIPE_SECRET_KEY_TEST,
    stripeSecretKeyLive: process.env.STRIPE_SECRET_KEY_LIVE,
    // Base webhook secret + optional per-mode secrets. When running test mode on a
    // prod deploy, set STRIPE_WEBHOOK_SECRET_TEST (the test endpoint's whsec) so the
    // live secret can stay in place — the server picks by mode, falling back to base.
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripeWebhookSecretTest: process.env.STRIPE_WEBHOOK_SECRET_TEST,
    stripeWebhookSecretLive: process.env.STRIPE_WEBHOOK_SECRET_LIVE,
    // Recurring Stripe Price ids for paid add-ons (see core/shared/billing/addons.ts).
    // Per-mode so test + live can coexist. Toggling an add-on adds/removes a
    // subscription item on the org's band subscription.
    stripeAddonStoragePriceTest: process.env.STRIPE_PRICE_ADDON_STORAGE_100_TEST,
    stripeAddonStoragePriceLive: process.env.STRIPE_PRICE_ADDON_STORAGE_100_LIVE,
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
      // The platform's own domain. Its APEX serves marketing, `app.` and the
      // per-org subdomains serve the product, and anything else is a customer's
      // custom domain. Marketing-host detection derives from this (see
      // isMarketingHost) rather than a separate env var, so the two can't drift.
      mainDomain: process.env.NUXT_PUBLIC_MAIN_DOMAIN || "hoaconnect.info",
      // Mapbox public token (pk.*) for static location maps on org landing pages.
      // Set NUXT_PUBLIC_MAPBOX_TOKEN in the environment (kept out of the repo).
      mapboxToken: process.env.NUXT_PUBLIC_MAPBOX_TOKEN || "",
      appUrl: process.env.APP_URL || "http://localhost:3000",
      fromEmail: process.env.FROM_EMAIL,
      siteTitle: "Property Flow - Premier Property Management App",
      siteSubtitle: "",
      siteDescription:
        "Premier Property Management App for Property Owners and Property Managers. Streamline your property management with Property Flow.",
      // Stripe public key — chosen by STRIPE_MODE (see stripeLiveMode above).
      stripePublicKey: stripeLiveMode
        ? process.env.STRIPE_PUBLIC_KEY_LIVE
        : process.env.STRIPE_PUBLIC_KEY_TEST,
      // Surfaced so the UI can show an unmistakable "Stripe test mode" badge when
      // the instance is transacting against test Stripe (esp. on the prod URL).
      stripeTestMode: !stripeLiveMode,
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
      // Human-facing release line (shown in the update prompt / About). Derived at
      // build time by resolveAppVersion() above — MAJOR.MINOR from package.json,
      // patch counted from git — so it is never hand-edited. Detection itself keys
      // off buildId, not this string.
      appVersion,
      // Per-deploy build identity baked into the client bundle. Compared against the
      // live value from GET /api/version to detect that a new version has shipped.
      buildId,
      // Web push applicationServerKey. Public by definition — it ships to every
      // browser that subscribes. Empty ⇒ push is disabled (see vapidPrivateKey).
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    },
  },

  experimental: {
    // A lazy route chunk that 404s has already broken the app by the time we
    // could ask permission, so reload immediately rather than surfacing an error.
    emitRouteChunkError: "automatic-immediate",
    // How often an open client re-checks the build manifest for a new deploy.
    // Fires `app:manifest:update`, signal 1 of three (see app-update.client.ts).
    checkOutdatedBuildInterval: 5 * 60_000,
  },

  routeRules: {
    // The service worker must NEVER be served from cache: a cached sw.js pins a
    // device to an old worker, and this one is responsible for push delivery and
    // for purging stale caches on activate.
    "/sw.js": {
      headers: { "cache-control": "no-cache, max-age=0, must-revalidate" },
    },
    // The build manifest is the file that tells a client it is stale — an edge
    // serving a cached copy defeats the entire mechanism.
    "/_nuxt/builds/latest.json": {
      headers: { "cache-control": "no-cache, max-age=0, must-revalidate" },
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
        // Installed/standalone PWA feel. `default` status bar adapts to the
        // app's own background so light + dark both read correctly (the manifest
        // already declares display:standalone + maskable icons). theme-color is
        // set per-org in useOrgBranding.
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
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

  typescript: {
    strict: false,
    typeCheck: false,
    shim: false,
  },
});
