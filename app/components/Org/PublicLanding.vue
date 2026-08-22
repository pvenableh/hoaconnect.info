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
  <div id="top" ref="rootEl">
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
          @click="navigateToOrg('/admin/settings/site')"
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
          class="hero-fade text-xs text-white/75 uppercase tracking-[0.3em] lg:tracking-[0.6em] mb-6 lg:mb-12"
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

        <!-- Admin nudge: a transparent PNG logo elevates the hero. Only the
             org's admin sees it, only when no hero logo is set yet. -->
        <button
          v-if="isAdminOfCurrentDomain && !organization?.hero?.foreground_image && !organization?.logo"
          type="button"
          class="hero-fade landing-glass-btn mt-6 h-10 px-4 gap-2 text-xs uppercase tracking-wide mx-auto tappable"
          @click="navigateToOrg('/admin/settings/site')"
        >
          <Icon name="lucide:image-plus" class="w-4 h-4" />
          Add a transparent PNG logo
        </button>

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

        <!-- CTAs. `landing.hero_cta` can turn the whole cluster off for a site
             whose top bar already carries the account icon — see LandingConfig. -->
        <div
          v-if="heroCtaEnabled && (!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
          class="hero-fade flex flex-col items-center gap-4 mt-9"
        >
          <!-- Signed-in resident -->
          <a v-if="user" href="/dashboard" class="landing-cta">
            <Icon name="lucide:layout-dashboard" class="w-4 h-4" />
            {{ memberNoun.singular }} Portal
          </a>

          <!-- Public visitor: one primary CTA (login), the rest as quiet,
               tracked-out text links to cut button clutter. -->
          <template v-else>
            <a href="/auth/login" class="landing-cta">
              <Icon name="lucide:log-in" class="w-4 h-4" />
              {{ memberNoun.singular }} Login
            </a>
            <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-white/80">
              <NuxtLink :to="`/${slug}/request-join`" class="hover:text-white transition-colors">
                Request access
              </NuxtLink>
              <span class="opacity-40">·</span>
              <button
                v-if="inquiryEnabled"
                type="button"
                class="uppercase tracking-[0.22em] hover:text-white transition-colors"
                @click="openInquiry('general')"
              >
                Inquire
              </button>
              <a v-else href="#contact" class="hover:text-white transition-colors">
                Contact
              </a>
            </div>
          </template>
        </div>
      </div>

      <!-- Greeting + glass widget row, pinned to the bottom-left of the hero
           (left-anchored to the viewport edge like 1033lenox, not centered). -->
      <div
        v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
        class="hero-fade hero-fade--widgets absolute bottom-14 sm:bottom-12 inset-x-0 z-10 pl-4 sm:pl-6 pr-4"
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

      <!-- Property-management callout (opt-in; needs a management vendor) -->
      <section v-if="featurePm" class="landing-section py-20 sm:py-28 t-bg border-t t-border">
        <div class="container mx-auto px-6">
          <div class="reveal max-w-2xl mx-auto text-center">
            <p class="landing-eyebrow mb-5">Management</p>
            <h2 class="landing-heading text-3xl sm:text-4xl">Professionally Managed</h2>
            <div class="landing-rule mx-auto my-7" />
            <p class="landing-lede text-lg">
              {{ organization.name }} is professionally managed by
              <span class="t-text font-medium">{{ pmName }}</span>.
            </p>
            <div class="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
              <a
                v-if="propertyManager.phone"
                :href="`tel:${propertyManager.phone}`"
                class="t-text-muted hover:t-text-accent transition-colors"
              >
                {{ propertyManager.phone }}
              </a>
              <a
                v-if="propertyManager.email"
                :href="`mailto:${propertyManager.email}`"
                class="t-text-muted hover:t-text-accent transition-colors break-all"
              >
                {{ propertyManager.email }}
              </a>
            </div>
            <a
              v-if="pmWebsite"
              :href="pmWebsite"
              target="_blank"
              rel="noopener"
              class="landing-btn-outline mt-8 inline-flex"
            >
              Visit website
            </a>
          </div>
        </div>
      </section>

      <!-- Themed page footer (org + optional management info) -->
      <OrgLandingFooter :organization="organization" :pm="featurePm ? propertyManager : null" />
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
import { normalizeLandingConfig } from "#core/shared/utils/landing";
import { orgMemberNoun } from "#core/shared/utils/terminology";
import OrgLandingNav from "./Landing/LandingNav.vue";
import OrgLandingWidgetRow from "./Landing/LandingWidgetRow.vue";
import OrgLandingBlocks from "./Landing/LandingBlocks.vue";
import OrgLandingInquiryForm from "./Landing/LandingInquiryForm.vue";
import OrgLandingAnnouncements from "./Landing/LandingAnnouncements.vue";
import OrgLandingFooter from "./Landing/LandingFooter.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
  // Rendered inside the admin builder's preview iframe — hide admin edit chrome
  // and skip the view beacon so previewing never edits or inflates stats.
  preview: { type: Boolean, default: false },
});

const { user } = useDirectusAuth();
const { isAdminOfCurrentDomain: isAdminRaw } = useCurrentDomainAccess();
// In preview mode, never show the admin edit buttons/nudges (this IS the editor).
const isAdminOfCurrentDomain = computed(() => !props.preview && isAdminRaw.value);
const { navigateToOrg } = useOrgNavigation();
const config = useRuntimeConfig();

const cfg = computed(() => normalizeLandingConfig(props.organization?.settings?.landing));
const memberNoun = computed(() => orgMemberNoun(props.organization?.type));

const inquiryEnabled = computed(() => cfg.value.inquiry.enabled);
const heroCtaEnabled = computed(() => cfg.value.hero_cta);

// Property manager — the primary active management vendor (attached by /api/hoa/find).
// Featured only when the admin opted in AND a management vendor exists.
const propertyManager = computed(() => props.organization?.property_manager || null);
const featurePm = computed(() => cfg.value.feature_pm === true && !!propertyManager.value);
const pmName = computed(
  () => propertyManager.value?.company || propertyManager.value?.name || ""
);
const pmWebsite = computed(() => {
  const w = propertyManager.value?.website?.trim();
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
});

// Hero eyebrow — "City · Neighborhood" (1033lenox style); falls back to the
// street address when no neighborhood is curated.
const heroEyebrow = computed(() => {
  const o = props.organization;
  const neighborhood = cfg.value.places?.neighborhood;
  const parts = [o?.city, neighborhood].filter(Boolean);
  return parts.length ? parts.join(" · ") : o?.street_address || "";
});

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
let revealCtx = null; // GSAP context, reverted on unmount
onMounted(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Page-view beacon (once per session, best-effort). Skipped in builder preview.
  if (!props.preview) {
    try {
      const key = `landing-view-${props.slug}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        $fetch("/api/landing/view", { method: "POST", body: { slug: props.slug } }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // GSAP ScrollTrigger reveal — a smooth fade + rise + settle, BATCHED so items
  // that enter together stagger in sequence (à la the Earnest sell sheet). Falls
  // back to immediately-visible when reduced-motion or GSAP isn't available.
  const els = Array.from(rootEl.value?.querySelectorAll(".reveal") || []);
  const { $gsap: gsap, $ScrollTrigger: ScrollTrigger } = useNuxtApp();
  if (reduced || !gsap || !ScrollTrigger || !els.length) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  revealCtx = gsap.context(() => {
    gsap.set(els, { opacity: 0, y: 34, scale: 0.985 });
    ScrollTrigger.batch(els, {
      start: "top 86%",
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          overwrite: true,
        }),
    });

    // Count-up numeric stat values as they scroll in (Earnest [data-count]).
    Array.from(rootEl.value.querySelectorAll("[data-count]")).forEach((el) => {
      const end = parseFloat(el.getAttribute("data-count"));
      if (!isFinite(end)) return;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: end,
        duration: 1.4,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        onUpdate: () => {
          el.textContent = Math.round(obj.v).toString();
        },
      });
    });

    ScrollTrigger.refresh();
  }, rootEl.value);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  revealCtx?.revert();
});
</script>
