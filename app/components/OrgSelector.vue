<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const router = useRouter();
const config = useRuntimeConfig();

const { currentOrg, memberships, setOrganization, hasMultipleOrgs, isAdmin } =
  await useSelectedOrg();

// Agency / multi-property billing: surface the user's billing account(s) so a
// property manager can jump to the agency dashboard ("All properties").
const { accounts: billingAccounts, hasBillingAccounts } = useBillingMemberships();

const open = ref(false);

const currentOrgId = computed(() => currentOrg.value?.organization?.id ?? null);
const currentSlug = computed(
  () => currentOrg.value?.organization?.slug ?? null
);

// Other organizations the user belongs to (everything except the active one).
const otherOrgs = computed(() =>
  (memberships.value as any[])?.filter(
    (m) => m?.organization?.id !== currentOrgId.value
  ) ?? []
);

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

// ── Org-aware management links (built off the *selected* org's slug so they
// work from the main domain, a slug route, or a custom domain alike). ───────
const orgPath = (suffix: string) =>
  currentSlug.value ? `/${currentSlug.value}${suffix}` : suffix;

const manageLinks = computed(() => {
  if (!currentSlug.value) return [];
  return [
    {
      label: "Organization settings",
      icon: "i-lucide-settings",
      to: orgPath("/admin/settings/organization"),
      adminOnly: true,
    },
    {
      label: "Landing page & domains",
      icon: "i-lucide-globe",
      to: orgPath("/admin/settings/domains"),
      adminOnly: true,
    },
    {
      label: "People & members",
      icon: "i-lucide-users-round",
      to: orgPath("/admin/people"),
      adminOnly: true,
    },
    {
      label: "View public site",
      icon: "i-lucide-external-link",
      to: orgPath(""),
      adminOnly: false,
    },
  ].filter((l) => !l.adminOnly || isAdmin.value);
});

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

const goTo = async (to: string) => {
  open.value = false;
  await router.push(to);
};

const goToAgency = async (accountId: string) => {
  open.value = false;
  await router.push(`/billing/${accountId}`);
};
</script>

<template>
  <DropdownMenu v-if="currentOrg" v-model:open="open">
    <!-- Trigger: org avatar (logo / initials) with subscription dot. -->
    <DropdownMenuTrigger
      class="group flex items-center gap-2 rounded-full pl-0.5 pr-2 py-0.5 hover:t-bg-subtle transition-colors focus:outline-none"
      :title="currentOrg?.organization?.name || 'Organization'"
      aria-label="Switch organization"
    >
      <span
        class="relative grid place-items-center w-8 h-8 rounded-lg overflow-hidden bg-cyan-500/15 text-[11px] font-semibold text-cyan-700 shrink-0"
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
            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white',
            statusColor(currentOrg?.organization?.subscription_status),
          ]"
        />
      </span>
      <Icon
        name="i-lucide-chevrons-up-down"
        class="hidden md:block w-3.5 h-3.5 t-text-muted shrink-0"
      />
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start" class="w-72">
      <!-- Active org identity -->
      <DropdownMenuLabel class="flex items-center gap-2.5 py-2">
        <span
          class="relative grid place-items-center w-9 h-9 rounded-lg overflow-hidden bg-cyan-500/15 text-xs font-semibold text-cyan-700 shrink-0"
        >
          <img
            v-if="logoUrl(currentOrg?.organization)"
            :src="logoUrl(currentOrg?.organization)!"
            :alt="currentOrg?.organization?.name || ''"
            class="w-full h-full object-cover"
          />
          <template v-else>{{
            initials(currentOrg?.organization?.name)
          }}</template>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block font-semibold truncate t-text">{{
            currentOrg?.organization?.name
          }}</span>
          <span class="block text-xs font-normal t-text-muted">{{
            roleLabel(currentOrg)
          }}</span>
        </span>
      </DropdownMenuLabel>

      <!-- Switch to another org -->
      <template v-if="hasMultipleOrgs">
        <DropdownMenuSeparator />
        <div
          class="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider t-text-muted"
        >
          Switch organization
        </div>
        <DropdownMenuItem
          v-for="m in otherOrgs"
          :key="m.id"
          class="cursor-pointer gap-2.5"
          @click="handleSelect(m.organization.id)"
        >
          <span
            class="relative grid place-items-center w-6 h-6 rounded-md overflow-hidden bg-cyan-500/15 text-[10px] font-semibold text-cyan-700 shrink-0"
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
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
                statusColor(m.organization?.subscription_status),
              ]"
            />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block truncate">{{ m.organization.name }}</span>
            <span class="block text-xs t-text-muted">{{ roleLabel(m) }}</span>
          </span>
        </DropdownMenuItem>
      </template>

      <!-- Agency: jump to the agency dashboard (all properties) -->
      <template v-if="hasBillingAccounts">
        <DropdownMenuSeparator />
        <div
          class="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider t-text-muted"
        >
          Agency
        </div>
        <DropdownMenuItem
          v-for="acct in billingAccounts"
          :key="acct.id"
          class="cursor-pointer gap-2.5"
          @click="goToAgency(acct.id)"
        >
          <span
            class="grid place-items-center w-6 h-6 rounded-md bg-violet-500/15 text-violet-700 shrink-0"
          >
            <Icon name="i-lucide-layout-grid" class="w-3.5 h-3.5" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block truncate">{{ acct.name }}</span>
            <span class="block text-xs t-text-muted"
              >All properties · {{ acct.role }}</span
            >
          </span>
          <Icon
            name="i-lucide-arrow-up-right"
            class="w-3.5 h-3.5 t-text-muted shrink-0"
          />
        </DropdownMenuItem>
      </template>

      <!-- Org management / functions -->
      <template v-if="manageLinks.length">
        <DropdownMenuSeparator />
        <DropdownMenuItem
          v-for="link in manageLinks"
          :key="link.to"
          class="cursor-pointer"
          @click="goTo(link.to)"
        >
          <Icon :name="link.icon" class="size-4" />
          {{ link.label }}
        </DropdownMenuItem>
      </template>

      <!-- Manage all organizations -->
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" @click="goTo('/organizations')">
        <Icon name="i-lucide-settings-2" class="size-4" />
        Manage all organizations
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
