<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const router = useRouter();
const config = useRuntimeConfig();

const { currentOrg, memberships, setOrganization, hasMultipleOrgs } =
  useSelectedOrg();

// Agency / multi-property billing: surface the user's billing account(s) so a
// property manager can jump to the agency dashboard ("All properties").
const { accounts: billingAccounts, hasBillingAccounts } = useBillingMemberships();

const open = ref(false);

// The user can actually switch context only with more than one org (or an
// agency account). With a single org we render a static identity chip.
const canSwitch = computed(
  () => hasMultipleOrgs.value || hasBillingAccounts.value
);

const currentOrgId = computed(() => currentOrg.value?.organization?.id ?? null);

// ── Display helpers ───────────────────────────────────────────────────────
const logoUrl = (org: any): string | null => {
  const logoId = org?.settings?.logo;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=small-contain`;
};

const initials = (name?: string | null) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

// A friendly role label from the data we actually have on each membership
// (role is an id, plus member_type and board terms).
const adminRoleIds = [
  config.public.directusRoleAppAdmin,
  config.public.directusRoleHoaAdmin,
  config.public.directusRoleAdmin,
].filter(Boolean);

const hasActiveBoardTerm = (m: any): boolean => {
  const terms = m?.board_member_terms;
  if (!Array.isArray(terms)) return false;
  const now = new Date();
  return terms.some((t: any) => {
    if (t?.status !== "published") return false;
    const start = t.term_start ? new Date(t.term_start) : null;
    const end = t.term_end ? new Date(t.term_end) : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  });
};

const roleLabel = (m: any): string => {
  const roleId = typeof m?.role === "string" ? m.role : m?.role?.id;
  if (roleId === config.public.directusRolePropertyManager) return "Manager";
  if (adminRoleIds.includes(roleId)) return "Admin";
  if (hasActiveBoardTerm(m)) return "Board";
  if (m?.member_type === "owner") return "Owner";
  if (m?.member_type === "tenant") return "Resident";
  return "Member";
};

const statusColor = (status: string | null | undefined) => {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "trial":
      return "bg-blue-500";
    case "expired":
      return "bg-red-500";
    case "canceled":
      return "bg-gray-400";
    default:
      return "bg-gray-400";
  }
};

const trialDaysRemaining = (trialEndsAt: string | null | undefined) => {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
};

// ── Actions ───────────────────────────────────────────────────────────────
const handleSelect = async (orgId: string) => {
  open.value = false;
  if (orgId === currentOrgId.value) return;

  const membership = (memberships.value as any[])?.find(
    (m: any) => m?.organization?.id === orgId
  );
  const newSlug = membership?.organization?.slug;

  await setOrganization(orgId);

  // Navigate to the new org. The slug becomes authoritative on arrival
  // (useSelectedOrg STEP 3.5 / org-slug-sync), so the dock and hero agree.
  if (newSlug) await router.push(`/${newSlug}`);
  else window.location.reload();
};

const goToAgency = async (accountId: string) => {
  open.value = false;
  await router.push(`/billing/${accountId}`);
};
</script>

<template>
  <div>
    <!-- Single org: static identity chip (nothing to switch to) -->
    <div
      v-if="!canSwitch && currentOrg"
      class="flex items-center gap-2 px-3 py-2 text-sm"
    >
      <div class="relative">
        <Icon name="i-lucide-building-2" class="w-4 h-4" />
        <span
          :class="[
            'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
            statusColor(currentOrg?.organization?.subscription_status),
          ]"
        />
      </div>
      <span class="font-medium truncate">{{
        currentOrg?.organization?.name
      }}</span>
      <span
        v-if="
          currentOrg?.organization?.subscription_status === 'trial' &&
          trialDaysRemaining(currentOrg?.organization?.trial_ends_at) !== null
        "
        class="text-xs text-blue-600 font-medium"
      >
        ({{ trialDaysRemaining(currentOrg?.organization?.trial_ends_at) }}d left)
      </span>
      <span
        v-else-if="currentOrg?.organization?.subscription_status === 'expired'"
        class="text-xs text-red-600 font-medium"
      >
        (Expired)
      </span>
    </div>

    <!-- Multiple orgs / agency: a tappable chip that opens the switcher -->
    <template v-else-if="canSwitch">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 px-3 py-2 text-sm border t-border rounded-full hover:t-bg-subtle transition-colors"
        @click="open = true"
      >
        <!-- Current org avatar -->
        <span
          class="relative grid place-items-center w-6 h-6 rounded-md overflow-hidden bg-cyan-500/15 text-[10px] font-semibold text-cyan-700 shrink-0"
        >
          <img
            v-if="logoUrl(currentOrg?.organization)"
            :src="logoUrl(currentOrg?.organization)!"
            :alt="currentOrg?.organization?.name || ''"
            class="w-full h-full object-cover"
          />
          <template v-else>{{
            initials(currentOrg?.organization?.name) || "·"
          }}</template>
          <span
            :class="[
              'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
              statusColor(currentOrg?.organization?.subscription_status),
            ]"
          />
        </span>
        <span class="font-medium truncate flex-1 text-left">{{
          currentOrg?.organization?.name ||
          billingAccounts[0]?.name ||
          "Select organization"
        }}</span>
        <Icon
          name="i-lucide-chevrons-up-down"
          class="w-4 h-4 t-text-muted shrink-0"
        />
      </button>

      <Dialog v-model:open="open">
        <DialogContent class="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader class="px-5 pt-5 pb-2 text-left">
            <DialogTitle class="flex items-center gap-2">
              <Icon name="i-lucide-building-2" class="w-5 h-5 t-text-secondary" />
              Switch organization
            </DialogTitle>
            <DialogDescription>
              Jump between the communities you belong to.
            </DialogDescription>
          </DialogHeader>

          <div class="max-h-[60vh] overflow-y-auto px-3 py-2 space-y-1">
            <!-- Organizations -->
            <button
              v-for="m in memberships"
              :key="m.id"
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
              :class="
                m.organization.id === currentOrgId
                  ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40'
                  : 'hover:t-bg-subtle'
              "
              @click="handleSelect(m.organization.id)"
            >
              <span
                class="relative grid place-items-center w-9 h-9 rounded-lg overflow-hidden bg-cyan-500/15 text-xs font-semibold text-cyan-700 shrink-0"
              >
                <img
                  v-if="logoUrl(m.organization)"
                  :src="logoUrl(m.organization)!"
                  :alt="m.organization.name"
                  class="w-full h-full object-cover"
                />
                <template v-else>{{ initials(m.organization.name) }}</template>
                <span
                  :class="[
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white',
                    statusColor(m.organization?.subscription_status),
                  ]"
                  :title="m.organization?.subscription_status || 'Unknown'"
                />
              </span>

              <span class="flex-1 min-w-0">
                <span class="block font-medium t-text truncate">{{
                  m.organization.name
                }}</span>
                <span class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs t-text-muted">{{ roleLabel(m) }}</span>
                  <span
                    v-if="m.organization?.subscription_status === 'trial'"
                    class="text-xs text-blue-600"
                    >· {{ trialDaysRemaining(m.organization?.trial_ends_at) }}d
                    trial</span
                  >
                  <span
                    v-else-if="m.organization?.subscription_status === 'expired'"
                    class="text-xs text-red-600"
                    >· Expired</span
                  >
                </span>
              </span>

              <Icon
                v-if="m.organization.id === currentOrgId"
                name="i-lucide-check"
                class="w-5 h-5 text-cyan-600 shrink-0"
              />
            </button>

            <!-- Agency billing: jump to the agency dashboard (all properties) -->
            <template v-if="hasBillingAccounts">
              <div class="flex items-center gap-2 px-3 pt-3 pb-1">
                <span class="text-xs uppercase tracking-wider t-text-muted"
                  >Agency</span
                >
                <span class="flex-1 border-t t-border" />
              </div>
              <button
                v-for="acct in billingAccounts"
                :key="acct.id"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:t-bg-subtle transition-colors"
                @click="goToAgency(acct.id)"
              >
                <span
                  class="grid place-items-center w-9 h-9 rounded-lg bg-violet-500/15 text-violet-700 shrink-0"
                >
                  <Icon name="i-lucide-layout-grid" class="w-4 h-4" />
                </span>
                <span class="flex-1 min-w-0">
                  <span class="block font-medium t-text truncate">{{
                    acct.name
                  }}</span>
                  <span class="block text-xs t-text-muted mt-0.5"
                    >All properties · {{ acct.role }}</span
                  >
                </span>
                <Icon
                  name="i-lucide-arrow-up-right"
                  class="w-4 h-4 t-text-muted shrink-0"
                />
              </button>
            </template>
          </div>

          <div class="border-t t-border px-5 py-3">
            <NuxtLink
              to="/organizations"
              class="inline-flex items-center gap-1.5 text-sm t-text-secondary hover:t-text transition-colors"
              @click="open = false"
            >
              <Icon name="i-lucide-settings-2" class="w-4 h-4" />
              Manage all organizations
            </NuxtLink>
          </div>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
