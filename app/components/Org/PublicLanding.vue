<!--
  Org public landing page — the community's public-facing site. Imitates
  1033lenox.com: a photographic hero with a scrollable row of frosted glass
  widgets, a glass side drawer + avatar, an inquiry CTA, real-estate listings,
  and editorial content sections. Two personalities share this markup, driven by
  the org's theme: CLASSIC/LUXURY = editorial print (Harper's Bazaar /
  Restoration Hardware); MODERN = iOS. See app/assets/css/landing.css.

  Shared by:
   - app/pages/[slug]/index.vue  (main host, /{slug})
   - app/pages/index.vue         (a verified custom domain's clean root)
-->
<template>
  <div
    id="top"
    ref="rootEl"
    class="transition-[padding] duration-300 ease-out"
    :class="navVariant === 'editorial' ? (landingNavCollapsed ? 'lg:pl-14' : 'lg:pl-60') : ''"
  >
    <!-- Theme-aware navigation (editorial sidebar+drawer, or modern dock) -->
    <OrgLandingNav
      :organization="organization"
      :slug="slug"
      :user="user"
      :has-amenities="hasAmenities"
      :has-listings="hasListings"
      :has-faq="hasFaq"
    />

    <!-- Maintenance Mode Banner for Admins -->
    <div
      v-if="organization?.maintenance_mode && isAdminOfCurrentDomain"
      class="bg-amber-500 text-white py-2 px-4 text-center font-medium text-sm sticky top-0 z-50"
    >
      <Icon name="lucide:wrench" class="w-4 h-4 inline-block mr-2" />
      Maintenance Mode - This content is hidden from public visitors
    </div>

    <!-- Hero Section -->
    <section
      class="relative min-h-screen flex items-center justify-center flex-col bg-cover bg-center bg-no-repeat overflow-hidden"
      :style="
        organization?.hero?.background_image
          ? {
              backgroundImage:
                'url(https://admin.hoaconnect.info/assets/' +
                organization.hero.background_image.id +
                ')',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
            }
          : { backgroundColor: '#15130f' }
      "
    >
      <!-- Cinematic scrim for legibility on any photo -->
      <div
        v-if="organization?.hero?.background_image"
        class="absolute inset-0 bg-gradient-to-b from-black/65 via-black/40 to-black/85 pointer-events-none"
      />

      <!-- Top bar: admin edit (left) · drawer + avatar (right) -->
      <div class="absolute top-0 inset-x-0 z-40 flex items-center justify-between px-4 sm:px-6 py-4">
        <button
          v-if="isAdminOfCurrentDomain"
          type="button"
          class="landing-glass-btn h-10 px-4 gap-2 text-xs uppercase tracking-wide"
          @click="navigateToOrg('/admin/settings/domains')"
        >
          <Icon name="lucide:pencil" class="w-4 h-4" />
          <span class="hidden sm:inline">Edit public site</span>
        </button>
        <span v-else />
      </div>

      <!-- Centered brand block -->
      <div
        ref="heroTitle"
        class="relative z-10 flex items-center justify-center flex-col px-6 sm:px-12 max-w-4xl w-full pb-40 sm:pb-36"
      >
        <!-- Eyebrow: neighborhood · city (1033lenox style) -->
        <p
          v-if="heroEyebrow"
          class="hero-fade text-[11px] sm:text-xs text-white/75 uppercase tracking-[0.3em] sm:tracking-[0.45em] mb-7 sm:mb-10"
        >
          {{ heroEyebrow }}
        </p>

        <div v-if="organization?.hero?.foreground_image" class="hero-fade">
          <img
            :src="getFileUrl(organization.hero.foreground_image)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto max-h-[42vh] sm:max-h-[46vh] drop-shadow-2xl"
          />
        </div>
        <div v-else-if="organization?.logo" class="hero-fade">
          <img
            :src="getFileUrl(organization.logo)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto max-h-[38vh] drop-shadow-2xl"
          />
        </div>
        <h1
          v-else
          class="hero-fade text-5xl sm:text-6xl text-white font-light tracking-ultra-wide uppercase"
        >
          {{ organization?.hero?.title || organization?.name }}
        </h1>

        <!-- Gold hairline divider -->
        <div
          class="hero-fade w-16 h-px mx-auto mt-7 mb-5"
          style="background: var(--theme-accent-primary)"
        />

        <!-- Tagline: italic serif (1033lenox style) -->
        <p
          v-if="organization?.hero?.subtitle"
          class="hero-fade font-serif italic font-light text-white/85 text-[clamp(1.125rem,2.5vw,2rem)] leading-tight"
        >
          {{ organization.hero.subtitle }}
        </p>

        <!-- Under Construction -->
        <p
          v-if="organization?.maintenance_mode && !isAdminOfCurrentDomain"
          class="text-lg text-white/90 mt-8 bg-amber-500/80 px-6 py-3 rounded-lg"
        >
          The site is currently under construction
        </p>

        <!-- Account Expired -->
        <div v-else-if="isAccountExpired" class="mt-8 text-center">
          <p class="text-lg text-white/90 bg-red-500/80 px-6 py-3 rounded-lg mb-4">
            This account has expired
          </p>
          <a href="/auth/login" class="landing-cta">Login here to renew your account</a>
        </div>

        <!-- CTAs -->
        <div
          v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
          class="hero-fade flex flex-col items-center gap-4 mt-9"
        >
          <!-- Signed-in resident -->
          <a v-if="user" href="/dashboard" class="landing-cta">
            <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
            {{ memberNoun.singular }} Portal
          </a>

          <!-- Public visitor: log in, request access, or create an account -->
          <template v-else>
            <div class="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/auth/login" class="landing-cta">
                <Icon name="lucide:log-in" class="w-4 h-4" />
                {{ memberNoun.singular }} Login
              </a>
              <NuxtLink :to="`/${slug}/request-join`" class="landing-cta">
                <Icon name="lucide:key-round" class="w-4 h-4" />
                Request Access
              </NuxtLink>
            </div>
            <div class="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-white/80">
              <NuxtLink :to="`/${slug}/signup`" class="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                <Icon name="lucide:user-plus" class="w-3.5 h-3.5" />
                Create account
              </NuxtLink>
              <span class="opacity-40">·</span>
              <button
                v-if="inquiryEnabled"
                type="button"
                class="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                @click="openInquiry('general')"
              >
                <Icon name="lucide:mail" class="w-3.5 h-3.5" />
                Inquire
              </button>
              <a v-else href="#contact" class="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                <Icon name="lucide:mail" class="w-3.5 h-3.5" />
                Contact
              </a>
            </div>
          </template>
        </div>
      </div>

      <!-- Glass widget row, pinned to the bottom of the hero -->
      <div
        v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
        class="hero-fade hero-fade--widgets absolute bottom-14 sm:bottom-12 inset-x-0 z-10 px-4 sm:px-8 max-w-5xl mx-auto"
      >
        <OrgLandingWidgetRow :organization="organization" :slug="slug" />
      </div>

      <!-- Scroll-down cue (fades once scrolling) -->
      <Transition name="cue-fade">
        <div
          v-if="showScrollCue && (!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        >
          <Icon name="lucide:chevron-down" class="w-5 h-5 text-white/55 animate-bounce" />
        </div>
      </Transition>
    </section>

    <!-- Content Sections — admin-ordered, dynamic block list (see LandingBlocks) -->
    <template v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired">
      <OrgLandingBlocks
        :organization="organization"
        :slug="slug"
        :user="user"
        :cfg="cfg"
        @inquire="openInquiry"
      />

      <!-- Community news (opt-in; self-hides) -->
      <OrgLandingAnnouncements :slug="slug" />
    </template>

    <!-- Inquiry dialog -->
    <OrgLandingInquiryForm
      v-if="inquiryEnabled"
      v-model:open="inquiryOpen"
      :slug="slug"
      :organization-name="organization?.name"
      :default-category="inquiryCategory"
    />
  </div>
</template>

<script setup>
import { normalizeLandingConfig } from "~~/shared/utils/landing";
import { orgMemberNoun } from "~~/shared/utils/terminology";
import OrgLandingNav from "./Landing/LandingNav.vue";
import OrgLandingWidgetRow from "./Landing/LandingWidgetRow.vue";
import OrgLandingBlocks from "./Landing/LandingBlocks.vue";
import OrgLandingInquiryForm from "./Landing/LandingInquiryForm.vue";
import OrgLandingAnnouncements from "./Landing/LandingAnnouncements.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
});

const { user } = useDirectusAuth();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { navigateToOrg } = useOrgNavigation();
const { themeStyle } = useTheme();
const config = useRuntimeConfig();

// Editorial themes (classic/luxury) get the persistent left sidebar, so the page
// is offset on desktop to make room for it; modern uses a floating dock (no offset).
const navVariant = computed(() => (themeStyle.value === "modern" ? "dock" : "editorial"));

const cfg = computed(() => normalizeLandingConfig(props.organization?.settings?.landing));
const memberNoun = computed(() => orgMemberNoun(props.organization?.type));

const inquiryEnabled = computed(() => cfg.value.inquiry.enabled);

// Hero eyebrow — "City · Neighborhood" (1033lenox style); falls back to the
// street address when no neighborhood is curated.
const heroEyebrow = computed(() => {
  const o = props.organization;
  const neighborhood = cfg.value.places?.neighborhood;
  const parts = [o?.city, neighborhood].filter(Boolean);
  return parts.length ? parts.join(" · ") : o?.street_address || "";
});

// Editorial sidebar collapse state, shared with LandingSidebar (default slim so
// the landing reads full-bleed like 1033). Drives the desktop content offset.
const landingNavCollapsed = useState("landingNavCollapsed", () => true);

// Nav anchor gating (the section bodies themselves live in LandingBlocks).
const hasAmenities = computed(
  () => Array.isArray(props.organization?.amenities) && props.organization.amenities.length > 0
);
const hasListings = computed(() => cfg.value.listings.length > 0);
const hasFaq = computed(() => cfg.value.faq.length > 0);

// Inquiry dialog state
const inquiryOpen = ref(false);
const inquiryCategory = ref("general");
const openInquiry = (cat) => {
  inquiryCategory.value = cat || "general";
  inquiryOpen.value = true;
};

// Hero brand block ref (kept for layout; the 3D mouse-rotation effect was
// removed at the owner's request for a calmer, print-like hero).
const heroTitle = ref(null);

const getFileUrl = (file) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

const isAccountExpired = computed(() => {
  const o = props.organization;
  if (!o) return false;
  if (o.is_free_account) return false;
  const status = o.subscription_status;
  return status === "expired" || status === "canceled";
});

// Hero scroll-down cue — fades out once the visitor starts scrolling.
const showScrollCue = ref(true);
const onScroll = () => {
  if (window.scrollY > 40) showScrollCue.value = false;
};

// ---- Scroll reveal (hero entrance is pure CSS; see .hero-fade in landing.css) ----
const rootEl = ref(null);
onMounted(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Page-view beacon (once per session, best-effort).
  try {
    const key = `landing-view-${props.slug}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      $fetch("/api/landing/view", { method: "POST", body: { slug: props.slug } }).catch(() => {});
    }
  } catch {
    /* ignore */
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  const els = rootEl.value?.querySelectorAll(".reveal") || [];
  // Reveal sections as they enter the viewport (scroller-agnostic). Degrade to
  // immediately-visible when reduced-motion or IntersectionObserver is absent.
  if (reduced || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  els.forEach((el) => io.observe(el));
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));
</script>
