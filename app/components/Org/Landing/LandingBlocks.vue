<!--
  Block dispatcher — renders the org's ordered, admin-controlled landing blocks
  (cfg.blocks). Each enabled block maps to its section component by type. Content
  sections alternate t-bg / t-bg-alt among themselves. Bubbles the contact CTA's
  `inquire` event up to PublicLanding (which owns the inquiry dialog).
-->
<template>
  <template v-for="entry in renderBlocks" :key="entry.block.id">
    <OrgLandingAbout v-if="entry.block.type === 'about'" :organization="organization" />
    <OrgLandingAmenities v-else-if="entry.block.type === 'amenities'" :organization="organization" />
    <OrgLandingListings v-else-if="entry.block.type === 'listings'" :listings="cfg.listings" />
    <OrgLandingFAQ v-else-if="entry.block.type === 'faq'" :items="cfg.faq" />
    <OrgLandingBoard v-else-if="entry.block.type === 'board'" :organization="organization" :slug="slug" />
    <OrgLandingContact
      v-else-if="entry.block.type === 'contact'"
      :organization="organization"
      :slug="slug"
      :user="user"
      :cfg="cfg"
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
import { enabledLandingBlocks } from "~~/shared/utils/landing";
import OrgLandingAbout from "./LandingAbout.vue";
import OrgLandingAmenities from "./LandingAmenities.vue";
import OrgLandingListings from "./LandingListings.vue";
import OrgLandingFAQ from "./LandingFAQ.vue";
import OrgLandingBoard from "./LandingBoard.vue";
import OrgLandingContact from "./LandingContact.vue";
import OrgLandingContentSection from "./LandingContentSection.vue";

const props = defineProps({
  organization: { type: Object, required: true },
  slug: { type: String, required: true },
  user: { type: Object, default: null },
  cfg: { type: Object, required: true },
});

defineEmits(["inquire"]);

// Walk the enabled blocks in order; alternate the editorial sections' bg.
const renderBlocks = computed(() => {
  let contentIdx = 0;
  return enabledLandingBlocks(props.cfg).map((block) => {
    const alt = block.type === "content" ? contentIdx++ % 2 === 1 : false;
    return { block, alt };
  });
});
</script>
