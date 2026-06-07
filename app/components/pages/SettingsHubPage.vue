<script setup lang="ts">
// Settings hub — the single, discoverable home for everything "configure the
// org". Renders the shared AdminSectionHub with grouped cards.
import type { HubGroup } from "~/components/Admin/SectionHub.vue";

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();
const { currentOrg } = await useSelectedOrg();

const isFreeAccount = computed(
  () => (currentOrg.value?.organization as any)?.is_free_account === true
);

const groups = computed<HubGroup[]>(() => [
  {
    label: "Organization",
    description: "Identity, branding, and how your community presents itself.",
    items: [
      { label: "General", description: "Name, contact details, and address.", icon: "building-2", to: buildOrgPath("/admin/settings/organization?tab=general") },
      { label: "Branding", description: "Logo, colors, and theme.", icon: "palette", to: buildOrgPath("/admin/settings/organization?tab=branding") },
      { label: "SEO", description: "Search and social preview metadata.", icon: "search", to: buildOrgPath("/admin/settings/organization?tab=seo") },
    ],
  },
  {
    label: "Public site",
    description: "Your community's outward-facing landing page and domain.",
    items: [
      { label: "Landing & domains", description: "Built-in landing vs external site, and custom/APEX domain.", icon: "globe", to: buildOrgPath("/admin/settings/domains") },
    ],
  },
  {
    label: "People & access",
    description: "Login accounts and management staff.",
    items: [
      { label: "Users", description: "Login accounts and roles.", icon: "user-cog", to: buildOrgPath("/admin/users") },
      { label: "Vendors & management", description: "Service providers and property-manager access.", icon: "contact", to: buildOrgPath("/admin/settings/property-management"), show: isEnabled("vendors") },
    ],
  },
  {
    label: "Features",
    description: "Turn optional modules on or off for this community.",
    items: [
      { label: "Modules", description: "Enable or disable apps like Polls, Files, Channels.", icon: "toggle-right", to: buildOrgPath("/admin/settings/organization?tab=modules") },
    ],
  },
  {
    label: "Billing & payments",
    description: "Subscription, dues, and payout configuration.",
    items: [
      { label: "Payment settings", description: "Dues, late fees, and Stripe payouts.", icon: "credit-card", to: buildOrgPath("/admin/settings/organization?tab=payments") },
      { label: "Subscription", description: "Your HOA Connect plan and invoices.", icon: "sparkles", to: buildOrgPath("/admin/settings/organization?tab=subscription"), show: !isFreeAccount.value },
    ],
  },
]);
</script>

<template>
  <AdminSectionHub
    eyebrow="Admin"
    title="Settings"
    subtitle="Everything to configure your community — organization, public site, access, features, and billing."
    :groups="groups"
  />
</template>
