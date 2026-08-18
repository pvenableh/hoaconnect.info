<script setup lang="ts">
/**
 * Member-facing vendor directory. Members read only vendors flagged
 * show_to_members (enforced by the HOA Member policy); we additionally show
 * active ones, grouped by category. Gated by the `vendors` module (global
 * middleware) + auth.
 */
import type { HoaVendor } from "#core/types/directus";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const vendorsApi = useDirectusItems<HoaVendor>("hoa_vendors");

const CATEGORY_LABELS: Record<string, string> = {
  management: "Management",
  attorney: "Attorney",
  accountant: "Accountant",
  insurance: "Insurance",
  elevator: "Elevator",
  landscaping: "Landscaping",
  plumbing: "Plumbing",
  electrical: "Electrical",
  cleaning: "Cleaning / Janitorial",
  security: "Security",
  pest_control: "Pest Control",
  hvac: "HVAC",
  general_contractor: "General Contractor",
  other: "Other",
};

const { data: vendors, pending } = await useAsyncData(
  `vendors-${selectedOrgId.value}`,
  () =>
    vendorsApi.list({
      filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "active" }, show_to_members: { _eq: true } },
      sort: ["category", "sort", "company"],
      limit: -1,
    }),
  { watch: [selectedOrgId], server: false }
);

const catLabel = (v: HoaVendor) => (v.category === "other" ? v.category_other || "Other" : CATEGORY_LABELS[v.category] || v.category);
const vendorTitle = (v: HoaVendor) => v.company || v.name || "Vendor";

// Group vendors by display category, preserving sort order.
const grouped = computed(() => {
  const map = new Map<string, HoaVendor[]>();
  for (const v of vendors.value || []) {
    const key = catLabel(v);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
});

const telHref = (p?: string | null) => (p ? `tel:${p.replace(/[^0-9+]/g, "")}` : undefined);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold t-text">Vendors</h1>
        <p class="t-text-muted mt-1">Service providers for the community.</p>
      </div>

      <div v-if="pending" class="py-16 text-center t-text-muted">Loading…</div>
      <div v-else-if="!vendors?.length" class="ios-card p-10 text-center t-text-muted">
        No vendors are listed yet.
      </div>

      <div v-else class="space-y-8">
        <section v-for="[category, list] in grouped" :key="category">
          <h2 class="text-xs uppercase tracking-wider t-text-muted mb-3">{{ category }}</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <div v-for="v in list" :key="v.id" class="ios-card p-4">
              <div class="font-medium t-text">{{ vendorTitle(v) }}</div>
              <div v-if="v.company && v.name" class="text-sm t-text-muted">{{ v.name }}</div>
              <div class="mt-2 space-y-1 text-sm">
                <a v-if="v.email" :href="`mailto:${v.email}`" class="flex items-center gap-2 t-text-accent hover:underline">
                  <Icon name="lucide:mail" class="h-4 w-4" />{{ v.email }}
                </a>
                <a v-if="v.phone" :href="telHref(v.phone)" class="flex items-center gap-2 t-text-accent hover:underline">
                  <Icon name="lucide:phone" class="h-4 w-4" />{{ v.phone }}
                </a>
                <a v-if="v.website" :href="v.website" target="_blank" rel="noopener" class="flex items-center gap-2 t-text-accent hover:underline">
                  <Icon name="lucide:globe" class="h-4 w-4" />Website
                </a>
                <div v-if="v.address" class="flex items-start gap-2 t-text-muted">
                  <Icon name="lucide:map-pin" class="h-4 w-4 mt-0.5 shrink-0" /><span>{{ v.address }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  </div>
</template>
