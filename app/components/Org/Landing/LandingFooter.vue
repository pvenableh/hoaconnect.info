<!--
  Public-landing footer — themed with the landing's t-* tokens so it reads as
  part of the editorial page (not the dark marketing AppFooter, which only the
  app shell uses). Shows org brand + contact, an optional property-management
  block (when the admin features it), and a quiet copyright line.
-->
<template>
  <footer class="landing-section t-bg-elevated border-t t-border">
    <div class="container mx-auto px-6 py-16 sm:py-20">
      <div class="max-w-5xl mx-auto grid gap-10 sm:gap-12 sm:grid-cols-2 lg:grid-cols-3">
        <!-- Brand / org -->
        <div>
          <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="organization?.name"
            class="h-9 w-auto object-contain mb-4"
          />
          <h3 v-else class="font-serif t-text text-2xl leading-tight mb-3">{{ organization?.name }}</h3>
          <p v-if="addressLine" class="t-text-muted text-sm leading-relaxed">{{ addressLine }}</p>
        </div>

        <!-- Contact -->
        <div v-if="organization?.phone || organization?.email">
          <p class="landing-eyebrow mb-3">Contact</p>
          <ul class="space-y-1.5 text-sm">
            <li v-if="organization?.phone">
              <a :href="`tel:${organization.phone}`" class="t-text-muted hover:t-text-accent transition-colors">
                {{ organization.phone }}
              </a>
            </li>
            <li v-if="organization?.email">
              <a :href="`mailto:${organization.email}`" class="t-text-muted hover:t-text-accent transition-colors break-all">
                {{ organization.email }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Property management (opt-in) -->
        <div v-if="pm">
          <p class="landing-eyebrow mb-3">Management</p>
          <p class="t-text text-sm font-medium">{{ pmName }}</p>
          <ul class="mt-1.5 space-y-1.5 text-sm">
            <li v-if="pm.phone">
              <a :href="`tel:${pm.phone}`" class="t-text-muted hover:t-text-accent transition-colors">{{ pm.phone }}</a>
            </li>
            <li v-if="pm.email">
              <a :href="`mailto:${pm.email}`" class="t-text-muted hover:t-text-accent transition-colors break-all">{{ pm.email }}</a>
            </li>
            <li v-if="pmWebsite">
              <a :href="pmWebsite" target="_blank" rel="noopener" class="t-text-muted hover:t-text-accent transition-colors">
                Visit website
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="landing-rule my-10" />

      <div class="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p class="t-text-muted text-xs">
          &copy; {{ currentYear }} {{ organization?.name }}. All rights reserved.
        </p>
        <p class="t-text-muted text-[11px] uppercase tracking-[0.18em]">Powered by HOA Connect</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
const props = defineProps({
  organization: { type: Object, required: true },
  // Primary management vendor (public fields) when the admin features it; null otherwise.
  pm: { type: Object, default: null },
});

const config = useRuntimeConfig();
const currentYear = new Date().getFullYear();

const logoUrl = computed(() => {
  const logo = props.organization?.logo;
  if (!logo) return "";
  const id = typeof logo === "object" ? logo.id : logo;
  return `${config.public.directus.url}/assets/${id}`;
});

const addressLine = computed(() => {
  const o = props.organization;
  if (!o?.street_address && !o?.city) return "";
  return [o.street_address, [o.city, o.state].filter(Boolean).join(", "), o.zip]
    .filter(Boolean)
    .join("  ·  ");
});

const pmName = computed(() => props.pm?.company || props.pm?.name || "");

// Tolerate a bare-domain website (add https:// so the link resolves externally).
const pmWebsite = computed(() => {
  const w = props.pm?.website?.trim();
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
});
</script>
