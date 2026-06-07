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
        <div class="flex items-center gap-2">
          <OrgLandingAvatar v-if="user" :user="user" />
          <OrgLandingDrawer
            :organization="organization"
            :slug="slug"
            :user="user"
            :has-amenities="hasAmenities"
            :has-listings="hasListings"
          />
        </div>
      </div>

      <!-- Centered brand block -->
      <div
        ref="heroTitle"
        class="relative z-10 flex items-center justify-center flex-col px-6 sm:px-12 max-w-4xl w-full pb-40 sm:pb-36"
      >
        <div v-if="organization?.hero?.foreground_image" class="hero-fade mb-8">
          <img
            :src="getFileUrl(organization.hero.foreground_image)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto max-h-[42vh] sm:max-h-[46vh] drop-shadow-2xl"
          />
        </div>
        <div v-else-if="organization?.logo" class="hero-fade mb-8">
          <img
            :src="getFileUrl(organization.logo)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto max-h-[38vh] drop-shadow-2xl"
          />
        </div>
        <h1
          v-else
          class="hero-fade text-5xl sm:text-6xl text-white font-light tracking-ultra-wide uppercase mb-6"
        >
          {{ organization?.hero?.title || organization?.name }}
        </h1>

        <h5
          v-if="organization?.hero?.subtitle"
          class="hero-fade text-xs sm:text-sm text-white/80 mb-2 uppercase tracking-ultra-wide"
        >
          {{ organization.hero.subtitle }}
        </h5>
        <h5
          v-else-if="organization?.street_address"
          class="hero-fade text-xs sm:text-sm text-white/80 mb-2 uppercase tracking-ultra-wide"
        >
          {{ organization?.street_address }} {{ organization?.city }},
          {{ organization?.state }} {{ organization?.zip }}
        </h5>

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
        ref="widgetRowEl"
        class="hero-fade hero-fade--widgets absolute bottom-14 sm:bottom-12 inset-x-0 z-10 px-4 sm:px-8 max-w-5xl mx-auto"
      >
        <OrgLandingWidgetRow :organization="organization" :slug="slug" />
      </div>
    </section>

    <!-- Content Sections -->
    <template v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired">
      <!-- About -->
      <section
        v-if="aboutText"
        class="landing-section py-24 sm:py-36 t-bg"
      >
        <div class="container mx-auto px-6">
          <div class="reveal max-w-3xl mx-auto text-center">
            <p class="landing-eyebrow mb-5">The Community</p>
            <h2 class="landing-heading text-4xl sm:text-5xl mb-8">About {{ organization.name }}</h2>
            <div class="landing-rule mx-auto mb-9" />
            <p class="landing-dropcap landing-lede text-lg sm:text-xl leading-relaxed text-left sm:text-center">
              {{ aboutText }}
            </p>
          </div>
        </div>
      </section>

      <!-- Amenities -->
      <section
        v-if="hasAmenities"
        id="amenities"
        class="landing-section py-24 sm:py-36 t-bg-elevated border-t t-border"
      >
        <div class="container mx-auto px-6">
          <div class="max-w-6xl mx-auto">
            <div class="reveal text-center mb-16">
              <p class="landing-eyebrow mb-5">Amenities</p>
              <h2 class="landing-heading text-4xl sm:text-5xl">Life at {{ organization.name }}</h2>
              <div class="landing-rule mx-auto mt-8" />
            </div>
            <div class="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
              <div
                v-for="amenity in organization.amenities"
                :key="amenity.id"
                class="text-center"
              >
                <Icon
                  :name="iconName(amenity.icon)"
                  class="w-7 h-7 mx-auto mb-5"
                  style="color: var(--theme-accent-primary)"
                />
                <h3 class="landing-heading text-2xl mb-2">{{ amenity.title }}</h3>
                <p class="landing-lede leading-relaxed">{{ amenity.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Listings -->
      <OrgLandingListings :listings="cfg.listings" />

      <!-- Board -->
      <section v-if="organization?.show_board !== false" class="landing-section py-24 sm:py-36 t-bg border-t t-border">
        <div class="container mx-auto px-6">
          <div class="reveal max-w-2xl mx-auto text-center">
            <p class="landing-eyebrow mb-5">Governance</p>
            <h2 class="landing-heading text-4xl sm:text-5xl">Board of Directors</h2>
            <div class="landing-rule mx-auto my-8" />
            <p class="landing-lede text-lg leading-relaxed mb-10">
              A dedicated group of residents who volunteer their time to guide our community.
            </p>
            <NuxtLink
              :to="`/${slug}/board`"
              class="inline-flex items-center gap-2 text-[11px] uppercase tracking-ultra-wide t-text hover:opacity-60 transition-opacity"
            >
              Meet the board
              <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Contact -->
      <section id="contact" class="landing-section py-24 sm:py-36 t-bg-elevated border-t t-border">
        <div class="container mx-auto px-6">
          <div class="reveal max-w-3xl mx-auto text-center">
            <p class="landing-eyebrow mb-5">Contact</p>
            <h2 class="landing-heading text-4xl sm:text-5xl">Get in Touch</h2>
            <div class="landing-rule mx-auto my-8" />
            <p class="landing-lede text-lg mb-14">
              Questions or need assistance? Our community management team is here to help.
            </p>

            <div class="flex flex-col sm:flex-row items-center justify-center gap-12 sm:gap-20 mb-14">
              <div v-if="organization?.phone">
                <p class="landing-eyebrow mb-2">Call</p>
                <a :href="`tel:${organization.phone}`" class="landing-heading text-2xl hover:t-text-accent transition-colors">
                  {{ organization.phone }}
                </a>
              </div>
              <div
                v-if="organization?.phone && organization?.email"
                class="hidden sm:block w-px h-10"
                style="background: var(--theme-border-secondary)"
              />
              <div v-if="organization?.email">
                <p class="landing-eyebrow mb-2">Email</p>
                <a :href="`mailto:${organization.email}`" class="landing-heading text-2xl hover:t-text-accent transition-colors break-all">
                  {{ organization.email }}
                </a>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button v-if="inquiryEnabled" type="button" class="landing-btn" @click="openInquiry('general')">
                Send an inquiry
              </button>
              <NuxtLink v-if="!user" :to="`/${slug}/signup`" class="landing-btn-outline">
                Become a {{ memberNoun.singular }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>
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
import OrgLandingAvatar from "./Landing/LandingAvatar.vue";
import OrgLandingDrawer from "./Landing/LandingDrawer.vue";
import OrgLandingWidgetRow from "./Landing/LandingWidgetRow.vue";
import OrgLandingListings from "./Landing/LandingListings.vue";
import OrgLandingInquiryForm from "./Landing/LandingInquiryForm.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
});

const { user } = useDirectusAuth();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { navigateToOrg } = useOrgNavigation();
const config = useRuntimeConfig();

const cfg = computed(() => normalizeLandingConfig(props.organization?.settings?.landing));
const memberNoun = computed(() => orgMemberNoun(props.organization?.type));
const inquiryEnabled = computed(() => cfg.value.inquiry.enabled);
const hasAmenities = computed(
  () => Array.isArray(props.organization?.amenities) && props.organization.amenities.length > 0
);
const hasListings = computed(() => cfg.value.listings.length > 0);
const aboutText = computed(
  () => props.organization?.settings?.description || props.organization?.settings?.about || ""
);

// Tolerate icon names stored without a collection prefix (e.g. "wine" → "lucide:wine").
const iconName = (name) => {
  if (!name) return "lucide:sparkles";
  return name.includes(":") ? name : `lucide:${name}`;
};

// Inquiry dialog state
const inquiryOpen = ref(false);
const inquiryCategory = ref("general");
const openInquiry = (cat) => {
  inquiryCategory.value = cat || "general";
  inquiryOpen.value = true;
};

const heroTitle = ref(null);
use3DMouseRotation(heroTitle, {
  orbitalMode: true,
  intensity: 0.18,
  maxRotation: 5,
  ease: 0.12,
  perspective: 320,
  enableTranslation: true,
  orbitalDepth: 50,
  hoverScale: 1.03,
  resetOnLeave: true,
});

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

// ---- Scroll reveal (hero entrance is pure CSS; see .hero-fade in landing.css) ----
const rootEl = ref(null);
onMounted(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
</script>
