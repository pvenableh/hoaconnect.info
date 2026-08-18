<!--
  Block dispatcher — renders the org's ordered, admin-controlled landing blocks
  (cfg.blocks) via `narrativeSections`, which also assigns the classic/luxury
  numbered editorial sequence (01/02/03 across content/location/gallery). Each
  enabled block maps to its section component by type; content sections alternate
  t-bg / t-bg-alt. Bubbles the contact CTA's `inquire` event up to PublicLanding.
-->
<template>
  <template v-for="entry in renderBlocks" :key="entry.block.id">
    <OrgLandingAbout v-if="entry.block.type === 'about'" :organization="organization" />
    <OrgLandingAmenities v-else-if="entry.block.type === 'amenities'" :organization="organization" />
    <OrgLandingListings v-else-if="entry.block.type === 'listings'" :listings="effectiveCfg.listings" />
    <OrgLandingFAQ v-else-if="entry.block.type === 'faq'" :items="effectiveCfg.faq" />
    <OrgLandingBoard v-else-if="entry.block.type === 'board'" :organization="organization" :slug="slug" />
    <OrgLandingLocation
      v-else-if="entry.block.type === 'location'"
      :organization="organization"
      :cfg="effectiveCfg"
      :number="entry.number"
      :numbered="isEditorial"
      :alt="entry.alt"
    />
    <OrgLandingGallery
      v-else-if="entry.block.type === 'gallery'"
      :slug="slug"
      :gallery="effectiveCfg.gallery"
      :organization-name="organization?.name"
      :number="entry.number"
      :numbered="isEditorial"
      :alt="entry.alt"
    />
    <OrgLandingContact
      v-else-if="entry.block.type === 'contact'"
      :organization="organization"
      :slug="slug"
      :user="user"
      :cfg="effectiveCfg"
      :hide-map="hasLocationSection"
      @inquire="(c) => $emit('inquire', c)"
    />
    <OrgLandingContentSection
      v-else-if="entry.block.type === 'content'"
      :block="entry.block"
      :alt="entry.alt"
    />
  </template>
</template>

<script setup>
import { narrativeSections } from "#core/shared/utils/landing";
import OrgLandingAbout from "./LandingAbout.vue";
import OrgLandingAmenities from "./LandingAmenities.vue";
import OrgLandingListings from "./LandingListings.vue";
import OrgLandingFAQ from "./LandingFAQ.vue";
import OrgLandingBoard from "./LandingBoard.vue";
import OrgLandingContact from "./LandingContact.vue";
import OrgLandingContentSection from "./LandingContentSection.vue";
import OrgLandingLocation from "./LandingLocation.vue";
import OrgLandingGallery from "./LandingGallery.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
  user: { type: Object, default: null },
  cfg: { type: Object, required: true },
});

defineEmits(["inquire"]);

const { themeStyle } = useTheme();
const route = useRoute();

// Editorial themes (classic/luxury) show the numbered narrative chrome; modern
// renders the same sections with a clean, number-less header.
const isEditorial = computed(() => themeStyle.value !== "modern");

// Dev-only preview: `?landingPreview=location,gallery` appends ephemeral
// section blocks so the new sections can be verified against a real org without
// mutating its stored config. Stripped from production builds (import.meta.dev).
const effectiveCfg = computed(() => {
  let cfg = props.cfg;
  if (import.meta.dev && route.query.landingPreview) {
    const want = String(route.query.landingPreview)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const extra = [];
    if (want.includes("location") && !cfg.blocks.some((b) => b.type === "location"))
      extra.push({ id: "__preview_location", type: "location", enabled: true });
    if (want.includes("gallery") && !cfg.blocks.some((b) => b.type === "gallery"))
      extra.push({ id: "__preview_gallery", type: "gallery", enabled: true });
    if (extra.length) {
      cfg = {
        ...cfg,
        blocks: [...cfg.blocks, ...extra],
        gallery: cfg.gallery || { source: "folder", folder: null, images: [], caption: "" },
      };
    }
  }
  return cfg;
});

const renderBlocks = computed(() => narrativeSections(effectiveCfg.value));
const hasLocationSection = computed(() =>
  effectiveCfg.value.blocks.some((b) => b.enabled && b.type === "location")
);
</script>
