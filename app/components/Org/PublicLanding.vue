<!--
  Org public landing page — the community's public-facing site (hero, about,
  amenities, board, contact). Shared by:
   - app/pages/[slug]/index.vue  (main host, /{slug})
   - app/pages/index.vue         (a verified custom domain's clean root)
  so both render identical markup. Pass the loaded org + its slug.
-->
<template>
  <div>
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
      class="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center flex-col relative"
      :class="{
        'bg-gradient-to-b from-black/70 via-black/50 to-black/90 bg-blend-darken':
          organization?.hero?.background_image,
      }"
      :style="
        organization?.hero?.background_image
          ? {
              backgroundImage:
                'url(https://admin.hoaconnect.info/assets/' +
                organization.hero.background_image.id +
                ')',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
            }
          : null
      "
    >
      <div
        ref="heroTitle"
        class="uppercase flex items-center justify-center flex-col px-4 sm:px-12 max-w-4xl w-full"
      >
        <div v-if="organization?.hero?.foreground_image" class="mb-8">
          <img
            :src="getFileUrl(organization.hero.foreground_image)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto drop-shadow-2xl"
          />
        </div>
        <div v-else-if="organization?.logo" class="mb-8">
          <img
            :src="getFileUrl(organization.logo)"
            :alt="organization.name"
            class="mx-auto object-contain w-full h-auto drop-shadow-2xl"
          />
        </div>
        <h1
          v-else-if="organization?.hero?.title"
          class="text-5xl text-white font-light tracking-ultra-wide uppercase mb-6"
        >
          {{ organization?.hero?.title }}
        </h1>
        <!-- Organization Name -->
        <h1
          v-else
          class="text-5xl text-white font-light tracking-ultra-wide uppercase mb-6"
        >
          {{ organization?.name }}
        </h1>
        <h5
          v-if="organization?.hero?.subtitle"
          class="text-sm text-white/75 mb-8 uppercase tracking-ultra-wide"
        >
          {{ organization.hero.subtitle }}
        </h5>

        <!-- Address -->
        <h5
          v-else-if="organization?.street_address"
          class="text-sm text-white/75 mb-8 uppercase tracking-ultra-wide"
        >
          {{ organization?.street_address }} {{ organization?.city }},
          {{ organization?.state }} {{ organization?.zip }}
        </h5>
        <!-- Under Construction Message (shown when in maintenance mode for non-admins) -->
        <p
          v-if="organization?.maintenance_mode && !isAdminOfCurrentDomain"
          class="text-lg text-white/90 mt-8 bg-amber-500/80 px-6 py-3 rounded-lg"
        >
          The site is currently under construction
        </p>

        <!-- Account Expired Message (shown when subscription is expired/canceled and not a free account) -->
        <div v-else-if="isAccountExpired" class="mt-8 text-center">
          <p class="text-lg text-white/90 bg-red-500/80 px-6 py-3 rounded-lg mb-4">
            This account has expired
          </p>
          <a
            href="/auth/login"
            class="inline-block glass-container tracking-extra-wide text-sm text-white hover:bg-white/20 transition"
          >
            Login here to renew your account
          </a>
        </div>

        <div
          v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired"
          class="flex flex-col sm:flex-row gap-4 justify-center mt-10"
        >
          <a
            v-if="user"
            href="/dashboard"
            class="inline-block glass-container tracking-extra-wide text-sm text-white"
          >
            Resident Portal
          </a>

          <a
            v-else
            href="/auth/login"
            class="inline-block glass-container tracking-extra-wide text-sm text-white"
          >
            Resident Login
          </a>

          <a
            href="#contact"
            class="inline-block glass-container tracking-extra-wide text-sm text-white"
          >
            Contact Us
          </a>
        </div>
      </div>
    </section>

    <!-- Content Sections (hidden in maintenance mode for non-admins, or when account is expired) -->
    <template v-if="(!organization?.maintenance_mode || isAdminOfCurrentDomain) && !isAccountExpired">
      <!-- About Section -->
      <section
        v-if="organization?.settings?.description || organization?.settings?.about"
        class="py-24 sm:py-32 t-bg"
      >
        <div class="container mx-auto px-6">
          <div class="max-w-3xl mx-auto text-center">
            <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-5">
              The Community
            </p>
            <h2 class="font-serif text-4xl sm:text-5xl leading-tight t-text">
              About {{ organization.name }}
            </h2>
            <div class="mx-auto w-14 h-px my-8" style="background: var(--theme-accent-primary)"></div>
            <p class="text-lg leading-relaxed font-light t-text-secondary">
              {{ organization.settings.description || organization.settings.about }}
            </p>
          </div>
        </div>
      </section>

      <!-- Amenities Section -->
      <section
        v-if="organization?.amenities && organization.amenities.length > 0"
        class="py-24 sm:py-32 t-bg-elevated border-t t-border"
      >
        <div class="container mx-auto px-6">
          <div class="max-w-6xl mx-auto">
            <div class="text-center mb-16">
              <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-5">
                Amenities
              </p>
              <h2 class="font-serif text-4xl sm:text-5xl t-text">
                Life at {{ organization.name }}
              </h2>
              <div class="mx-auto w-14 h-px mt-8" style="background: var(--theme-accent-primary)"></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-14">
              <div
                v-for="amenity in organization.amenities"
                :key="amenity.id"
                class="text-center"
              >
                <Icon
                  :name="amenity.icon || 'lucide:sparkles'"
                  class="w-7 h-7 mx-auto mb-5"
                  style="color: var(--theme-accent-primary)"
                />
                <h3 class="font-serif text-2xl t-text mb-2">{{ amenity.title }}</h3>
                <p class="font-light leading-relaxed t-text-secondary">
                  {{ amenity.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Board Members Section Link (hidden when show_board is false) -->
      <section v-if="organization?.show_board !== false" class="py-24 sm:py-32 t-bg border-t t-border">
        <div class="container mx-auto px-6">
          <div class="max-w-2xl mx-auto text-center">
            <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-5">
              Governance
            </p>
            <h2 class="font-serif text-4xl sm:text-5xl t-text">Board of Directors</h2>
            <div class="mx-auto w-14 h-px my-8" style="background: var(--theme-accent-primary)"></div>
            <p class="text-lg font-light leading-relaxed t-text-secondary mb-10">
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

      <!-- Contact CTA Section -->
      <section id="contact" class="py-24 sm:py-32 t-bg-elevated border-t t-border">
        <div class="container mx-auto px-6">
          <div class="max-w-3xl mx-auto text-center">
            <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-5">
              Contact
            </p>
            <h2 class="font-serif text-4xl sm:text-5xl t-text">Get in Touch</h2>
            <div class="mx-auto w-14 h-px my-8" style="background: var(--theme-accent-primary)"></div>
            <p class="text-lg font-light t-text-secondary mb-14">
              Questions or need assistance? Our community management team is here to help.
            </p>

            <!-- Contact details -->
            <div class="flex flex-col sm:flex-row items-center justify-center gap-12 sm:gap-20 mb-14">
              <div v-if="organization?.phone">
                <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-2">Call</p>
                <a
                  :href="`tel:${organization.phone}`"
                  class="font-serif text-2xl t-text hover:t-text-accent transition-colors"
                >
                  {{ organization.phone }}
                </a>
              </div>

              <div
                v-if="organization?.phone && organization?.email"
                class="hidden sm:block w-px h-10"
                style="background: var(--theme-border, rgba(0,0,0,0.12))"
              ></div>

              <div v-if="organization?.email">
                <p class="text-[11px] uppercase tracking-ultra-wide t-text-muted mb-2">Email</p>
                <a
                  :href="`mailto:${organization.email}`"
                  class="font-serif text-2xl t-text hover:t-text-accent transition-colors break-all"
                >
                  {{ organization.email }}
                </a>
              </div>
            </div>

            <!-- CTA -->
            <div v-if="!user">
              <NuxtLink
                :to="`/${slug}/signup`"
                class="inline-flex items-center gap-2 px-9 py-3.5 border t-border t-text text-[11px] uppercase tracking-ultra-wide hover:t-bg-subtle transition-colors"
              >
                Become a Resident
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
});

const { user } = useDirectusAuth();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const config = useRuntimeConfig();

const heroTitle = ref(null);
use3DMouseRotation(heroTitle, {
  orbitalMode: true,
  intensity: 0.2,
  maxRotation: 6,
  ease: 0.12,
  perspective: 300,
  enableTranslation: true,
  orbitalDepth: 60,
  hoverScale: 1.05,
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
</script>
