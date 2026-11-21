<script setup lang="ts">
import type { HoaDocument, HoaOrganization, HoaAnnouncement } from "#core/types/directus";
import { homeFor } from "#core/shared/home/roles";
import { emptyRoleContext } from "#core/shared/roles/role-context";
import {
  REQUEST_STEPS,
  balanceSeries,
  openRequests,
  paidThisYear,
  requestTrackKey,
  type HomeCharge,
  type HomeRequest,
} from "#core/shared/home/member-home";

const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { getAuthUrl } = useDirectusFiles();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();
const { fetchHousehold } = useChangeRequests();

// Get organization context including member type and board member status
const {
  selectedOrgId,
  currentOrg,
  isAdmin,
  isMember,
  memberType,
  isOwner,
  isTenant,
  isBoardMember,
  boardTitleDisplay,
  activeBoardTerms,
} = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed<HoaOrganization | null>(() => currentOrg.value?.organization || null);

// ---- Tabbed dashboard: Overview + Building feed (Phase 9) ----
const { isEnabled } = useModules();
const feedEnabled = computed(() => isEnabled("feed"));
const isBoard = computed(() => isAdmin.value || isBoardMember.value);

// Same tab contract as the rest of the app: linkable via `?tab=`, replace not
// push, so Back leaves the portal rather than stepping through its tabs.
const activeTab = useTabQuery({
  values: ["overview", "building"],
  fallback: "overview",
});

// "Building" only exists when the feed module is on; a stale link to it should
// land on Overview rather than an empty panel.
watchEffect(() => {
  if (activeTab.value === "building" && !feedEnabled.value) {
    activeTab.value = "overview";
  }
});

const tabItems = computed(() => [
  { value: "overview", label: "Overview", icon: "lucide:layout-dashboard" },
  ...(feedEnabled.value
    ? [{ value: "building", label: "Building", icon: "lucide:building-2" }]
    : []),
]);

// Get org logo URL
const orgLogoUrl = computed(() => {
  const settings = organization.value?.settings;
  const logoId =
    typeof settings === "object" && settings ? settings.logo : null;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// ── Portal sections — the resident hub. One card per member-facing area, gated
// by the org's module toggles (and show_board). This is the "everything in one
// place" map: communications, documents, money, meetings, and the resident's own
// household record, all a tap away. Mirrors the member dock/nav set.
const showBoard = computed(() => organization.value?.show_board !== false);
// Every section is shown so the resident sees the full shape of their portal;
// modules the community hasn't enabled render greyed + non-navigating (a disabled
// card mustn't link — module.global.ts would just bounce it back to the dashboard).
// `available` drives the enabled/disabled treatment in the template.
const portalSections = computed(() => [
  {
    key: "household",
    label: "My Household",
    description: "Your contact info, vehicles, pets & parking",
    icon: "i-lucide-home",
    path: "/profile",
    available: true,
  },
  {
    key: "payments",
    label: "Payments",
    description: "Dues, assessments & statements",
    icon: "i-lucide-credit-card",
    path: "/payments",
    available: isEnabled("payments"),
  },
  {
    key: "requests",
    label: "Requests",
    description: "Submit & track your requests",
    icon: "i-lucide-clipboard-list",
    path: "/requests",
    available: isEnabled("requests"),
  },
  {
    key: "documents",
    label: "Documents",
    description: "Bylaws, minutes, notices & forms",
    icon: "i-lucide-file-text",
    path: "/documents",
    available: isEnabled("documents"),
  },
  {
    key: "meetings",
    label: "Meetings",
    description: "Agendas, schedules & minutes",
    icon: "i-lucide-calendar-days",
    path: "/meetings",
    available: isEnabled("meetings"),
  },
  // No Announcements tile: community news is the Building tab, one control away
  // at the top of this very page. A tile that only switched the tab beside it
  // would be a second door into the same room.
  {
    key: "projects",
    label: "Projects",
    description: "Capital improvements & initiatives",
    icon: "i-lucide-kanban-square",
    path: "/projects",
    available: isEnabled("projects"),
  },
  {
    key: "rules",
    label: "Rules & Bylaws",
    description: "Community rules & governing docs",
    icon: "i-lucide-scale",
    path: "/rules",
    available: isEnabled("rules"),
  },
  {
    key: "board",
    label: "Board",
    description: "Meet your board members",
    icon: "i-lucide-award",
    path: "/board",
    available: isEnabled("board") && showBoard.value,
  },
]);

// Primary resident tasks lifted to the top of the portal (≤2 taps). Only the
// ones the community actually enabled appear.
const primaryActions = computed(() =>
  [
    {
      key: "pay",
      label: "Pay dues",
      icon: "i-lucide-credit-card",
      path: "/payments",
      available: isEnabled("payments"),
    },
    {
      key: "request",
      label: "Submit a request",
      icon: "i-lucide-plus",
      path: "/requests",
      available: isEnabled("requests"),
    },
  ].filter((a) => a.available),
);

// Fetch recent documents (last 5 published)
const { data: recentDocuments, pending: docsPending, error: docsError } = await useAsyncData(
  `recent-documents-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "document_category.name",
        "date_published",
        "date_created",
        "file.id",
        "file.filename_download",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["-date_published", "-date_created"],
      limit: 5,
    });

    return (result || []) as HoaDocument[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch member stats for community overview (board members see this)
const { data: memberStats } = await useAsyncData(
  `member-stats-${orgId.value}`,
  async () => {
    if (!orgId.value) return { total: 0, owners: 0, tenants: 0 };
    try {
      const result = await listMembers({
        fields: ["id", "member_type"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _in: ["active", "inactive"] },
        },
      });
      const members = result || [];
      return {
        total: members.length,
        owners: members.filter((m: any) => m.member_type === "owner").length,
        tenants: members.filter((m: any) => m.member_type === "tenant").length,
      };
    } catch (e) {
      return { total: 0, owners: 0, tenants: 0 };
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch announcements (audience-aware)
const { data: announcements, pending: annPending, error: annError } = await useAsyncData(
  `member-announcements-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      const now = new Date().toISOString();
      const targetFilters: any[] = [
        { target_audience: { _null: true } },
        { target_audience: { _eq: "all" } },
      ];

      // Add audience-specific filters
      if (isOwner.value) {
        targetFilters.push({ target_audience: { _eq: "owners" } });
      }
      if (isTenant.value) {
        targetFilters.push({ target_audience: { _eq: "tenants" } });
      }
      if (isBoardMember.value) {
        targetFilters.push({ target_audience: { _eq: "board_members" } });
      }

      const result = await listAnnouncements({
        fields: ["id", "title", "content", "announcement_type", "is_pinned", "publish_date", "date_created", "target_audience"],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "published" },
          _and: [
            {
              _or: [
                { expiry_date: { _null: true } },
                { expiry_date: { _gte: now } },
              ],
            },
            {
              _or: targetFilters,
            },
          ],
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
        limit: 4,
      });
      return (result || []) as HoaAnnouncement[];
    } catch (e) {
      return [];
    }
  },
  {
    watch: [orgId],
    server: false,
  }
);

/**
 * Sent emails this resident is allowed to see. The server route owns the rule
 * (`visibility = 'public'` OR they were a recipient) because the HOA Member
 * policy cannot read `hoa_emails` at all, and because a filter the client sends
 * is a filter the client can change.
 *
 * Communities that came from an email-first system have their whole history
 * here rather than in `hoa_announcements` — 1033 has 106 emails and zero
 * announcements — so without this the card is empty for them no matter how much
 * the community has actually communicated.
 */
const { data: communityNews, pending: newsPending } = await useAsyncData(
  `community-news-${orgId.value}`,
  async () => {
    const s = organization.value?.slug;
    if (!s) return [];
    try {
      return await $fetch<any[]>("/api/hoa/community-news", {
        query: { slug: s, limit: 6 },
      });
    } catch {
      return [];
    }
  },
  { watch: [orgId], server: false }
);

/**
 * One list for the card: announcement posts and sent emails, newest first.
 * Normalised to a single shape so the template does not branch per source.
 */
const newsItems = computed(() => {
  const posts = (announcements.value || []).map((a: any) => ({
    key: `announcement-${a.id}`,
    title: a.title,
    excerpt: plainText(a.content, 90),
    date: a.publish_date || a.date_created,
    pinned: a.is_pinned === true,
    personal: false,
  }));
  const emails = (communityNews.value || []).map((e: any) => ({
    key: `email-${e.id}`,
    title: e.subject,
    excerpt: e.subtitle || "",
    date: e.sent_at,
    pinned: false,
    // Flagged so a resident can tell "sent to me" from "sent to everyone".
    personal: e.personal === true,
  }));
  return [...posts, ...emails]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    })
    .slice(0, 5);
});

// Fetch the resident's own household summary (vehicles, pets, pending changes).
// The full editor lives at /profile; here we just surface counts as a teaser.
const { data: household } = await useAsyncData(
  `my-household-summary-${orgId.value}`,
  async () => {
    if (!orgId.value) return null;
    try {
      return await fetchHousehold();
    } catch (e) {
      return null;
    }
  },
  { watch: [orgId], server: false }
);
// Both of these cards fetch with `server: false`, which means the request never
// STARTS during SSR — so `pending` is false on the server and only turns true
// once the client mounts. The template read that as "done, and there is
// nothing", so the server rendered the empty state and the client rendered the
// skeleton, and the two disagreed at hydration.
//
// It was also the wrong thing to show a resident: the first paint said "No
// documents published yet" before anything had looked. Treat "no data and no
// error yet" as still loading, which is what it actually is, and both sides
// agree on the skeleton. An error still falls through to the empty state
// rather than spinning forever.
const docsLoading = computed(
  () => docsPending.value || (!recentDocuments.value && !docsError.value)
);
const annLoading = computed(
  () => annPending.value || (!announcements.value && !annError.value)
);

const vehiclesEnabled = computed(() => isEnabled("vehicles"));
const petsEnabled = computed(() => isEnabled("pets"));
const householdStats = computed(() => ({
  vehicles: household.value?.vehicles?.length || 0,
  pets: household.value?.pets?.length || 0,
  pending: household.value?.pendingRequests?.length || 0,
  parkingSpots:
    household.value?.vehicles?.filter((v: any) => v?.parking_spot)?.length || 0,
}));

// ── Role home (docs/plan-unified-experience.md §5): the owner and tenant rows.
// `homeFor` picks which content each band holds; the reads below are the same
// collections the rest of the portal uses, so nothing new is queried per role.
const { context: serverContext, load: loadRoleContext } = useRoleContext();
await loadRoleContext();
const roleContext = computed(() => {
  // The server's context carries the hats and helper grants (manager, team).
  // The admin hat is dropped: this is the member view (an admin previewing it
  // sees what a resident sees); the admin's own home is DashboardPage.
  const server = serverContext.value;
  if (server && server.orgId === orgId.value) {
    return { ...server, hats: { ...server.hats, admin: false } };
  }
  const c = emptyRoleContext(orgId.value);
  c.residency = isOwner.value ? "owner" : isTenant.value ? "tenant" : "none";
  c.hats = { board: isBoardMember.value, manager: false, admin: false };
  return c;
});
const homeBands = computed(() => homeFor(roleContext.value));
const MEMBER_NEEDS = ["balance-due", "votes", "my-requests", "notices", "forms-to-sign"];
const MEMBER_GLANCE = ["paid-ring", "balance-sparkline", "next-meeting", "request-status-track", "next-event"];
const memberNeeds = computed(() => homeBands.value.needs.some((k) => MEMBER_NEEDS.includes(k)));
const memberGlance = computed(() => homeBands.value.glance.some((k) => MEMBER_GLANCE.includes(k)));
const otherNeeds = computed(() => ["approvals", "my-tasks", "delegated-queue"].some((k) => homeBands.value.needs.includes(k as any)));
const otherGlance = computed(() => ["arrears-meter", "team-ring", "community-load"].some((k) => homeBands.value.glance.includes(k as any)));
const has = {
  needs: (k: string) => (homeBands.value.needs as string[]).includes(k),
  glance: (k: string) => (homeBands.value.glance as string[]).includes(k),
  acts: (k: string) => (homeBands.value.acts as string[]).includes(k),
};
// Team role: the tasks assigned to this person (only read when the role is held).
const { list: listTasks } = useTasks();
const { data: myTasksData, refresh: refreshTasks } = useAsyncData(
  () => `home-my-tasks-${orgId.value}`,
  async () => (orgId.value && has.needs("my-tasks") ? await listTasks({ assignee: "me", parent: "none" }).catch(() => []) : []),
  { watch: [orgId], server: false, default: () => [] as any[] },
);
const myTasks = computed(() => myTasksData.value ?? []);

const { items: upNext } = await useUpNextGlance(() => selectedOrgId.value, {
  memberId: () => currentOrg.value?.id,
  userId: () => user.value?.id,
});
const nextByKind = (kind: string) => upNext.value.filter((i) => i.kind === kind);

const { list: listCharges } = useDirectusItems("payment_requests");
const { list: listMyRequests } = useDirectusItems("hoa_requests");
const memberId = computed(() => currentOrg.value?.id || null);

const { data: homeCharges } = await useAsyncData(
  `home-charges-${orgId.value}-${memberId.value}`,
  async () => {
    if (!orgId.value || !memberId.value || !isEnabled("payments")) return [];
    try {
      return ((await listCharges({
        fields: ["amount", "amount_paid", "amount_remaining", "status", "due_date", "paid_at"],
        filter: { organization: { _eq: orgId.value }, member: { _eq: memberId.value } },
        sort: ["-due_date"],
        limit: 60,
      })) || []) as HomeCharge[];
    } catch {
      return [];
    }
  },
  { watch: [orgId, memberId], server: false, default: () => [] as HomeCharge[] },
);

const { data: homeRequests } = await useAsyncData(
  `home-requests-${orgId.value}-${user.value?.id}`,
  async () => {
    if (!orgId.value || !user.value?.id || !isEnabled("requests")) return [];
    try {
      const rows = (await listMyRequests({
        fields: ["id", "title", "status"],
        filter: { organization: { _eq: orgId.value }, submitted_by: { _eq: user.value.id } },
        sort: ["-date_updated"],
        limit: 20,
      })) || [];
      return openRequests(rows as HomeRequest[]).slice(0, 4);
    } catch {
      return [];
    }
  },
  { watch: [orgId], server: false, default: () => [] as HomeRequest[] },
);

const nowYear = new Date().getFullYear();
const paidYear = computed(() => paidThisYear(homeCharges.value || [], nowYear));
const balancePoints = computed(() => balanceSeries(homeCharges.value || [], new Date()));
const nextMeeting = computed(() => nextByKind("meeting")[0] || null);
const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const showNewRequest = ref(false);
async function onRequestCreated() {
  showNewRequest.value = false;
  await refreshNuxtData(`home-requests-${orgId.value}-${user.value?.id}`);
}

// Format date for display
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Get category display name
function getCategoryName(doc: HoaDocument): string {
  if (doc.document_category) {
    return typeof doc.document_category === "string"
      ? doc.document_category
      : doc.document_category.name || "Document";
  }
  return "Document";
}

// Strip HTML from announcement content for a one-line preview.
function plainText(html: string | null | undefined, max = 140): string {
  if (!html) return "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Download document
const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file;
    if (!file) return;

    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getAuthUrl(fileId);
    const response = await fetch(fileUrl);

    if (!response.ok) throw new Error("Failed to fetch file");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = typeof file === "object" ? file.filename_download : doc.title || "document";
    link.download = filename || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download document:", error);
  }
};

// Welcome message based on time of day
const welcomeMessage = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
});

const userName = computed(() => {
  return user.value?.firstName || "Member";
});

// Get member type display text
const memberTypeDisplay = computed(() => {
  if (memberType.value === "owner") return "Owner";
  if (memberType.value === "tenant") return "Resident";
  return "Member";
});

// Format date for board term display
function formatBoardTermDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer class="space-y-10">
        <!-- Editorial hero — left-aligned, type-led. Eyebrow + greeting carry it;
             member status and the primary tasks ride below as pills. -->
        <header class="pt-2">
          <img
            v-if="orgLogoUrl"
            :src="orgLogoUrl"
            :alt="organization?.name || 'Organization'"
            class="h-10 mb-5 object-contain"
          />
          <p class="t-eyebrow mb-3">Resident portal</p>
          <h1 class="t-heading text-3xl sm:text-4xl font-medium tracking-tight t-text">
            {{ welcomeMessage }}, {{ userName }}
          </h1>

          <div class="flex items-center flex-wrap gap-2 mt-4">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full t-bg-subtle t-text-secondary">
              <Icon :name="isOwner ? 'i-lucide-home' : 'i-lucide-user'" class="w-3.5 h-3.5" />
              {{ memberTypeDisplay }}
            </span>
            <span
              v-if="isBoardMember && boardTitleDisplay"
              class="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full t-bg-accent/15 t-text-accent"
            >
              <Icon name="i-lucide-star" class="w-3.5 h-3.5" />
              Board {{ boardTitleDisplay }}
            </span>
          </div>

          <!-- Primary tasks — the highest-frequency resident actions, as pills. -->
          <div v-if="primaryActions.length" class="flex flex-wrap gap-2.5 mt-6">
            <AppButton
              v-for="(action, i) in primaryActions"
              :key="action.key"
              class="stagger-item"
              :variant="i === 0 ? 'default' : 'outline'"
              @click="navigateToOrg(action.path)"
            >
              <Icon :name="action.icon" class="w-4 h-4" />
              {{ action.label }}
            </AppButton>
          </div>
        </header>

        <AppSegmentedControl v-model="activeTab" :items="tabItems" label="Portal views" />

        <AppTabPanels :value="activeTab" :items="tabItems" class="mt-8">
          <div v-if="activeTab === 'overview'" class="space-y-10">
        <!-- Install (Phase 6): renders nothing unless this device can add the app and hasn't dismissed it on this build. -->
        <AppInstallCard />

        <!-- Role home (§5): Needs you · At a glance. The feed band is the
             announcements and documents cards below, so it is left empty here. -->
        <HomePage
          v-if="homeBands.roles.length"
          :role-context="roleContext"
          :organization-id="selectedOrgId"
          data-testid="member-home"
        >
          <template #needs>
            <HomeManagerQueue v-if="has.needs('delegated-queue')" :role-context="roleContext" />
            <HomeBoardNeeds v-if="has.needs('approvals')" />
            <HomeAckPending v-if="roleContext.hats.board" :organization-id="orgId" />
            <HomeAcknowledge :organization-id="orgId" :swipe="has.acts('swipe-acknowledge')" />
            <div v-if="has.needs('my-tasks')" class="space-y-3">
              <HomeTeamNeeds :tasks="myTasks" @done="() => refreshTasks()" />
              <HomeTeamQueue v-if="has.needs('area-queue')" :role-context="roleContext" />
            </div>
            <div v-if="memberNeeds" class="space-y-3">
              <h2 v-if="!otherNeeds" class="t-eyebrow">Needs you</h2>
              <AppCard class="overflow-hidden py-0">
                <ul class="divide-y">
                  <li v-for="item in nextByKind('dues')" v-show="has.needs('balance-due')" :key="item.key">
                    <div class="flex w-full items-center gap-3 px-4 py-3" data-testid="home-balance-due">
                      <Icon :name="item.icon" class="h-4 w-4 shrink-0 t-text-muted" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium t-text">{{ item.title }}</span>
                        <span class="block truncate text-sm t-text-muted">{{ item.sub }}</span>
                      </span>
                      <AppButton v-if="has.acts('pay-sheet')" size="sm" @click="navigateToOrg('/payments')">Pay</AppButton>
                    </div>
                  </li>
                  <li v-for="item in nextByKind('poll')" v-show="has.needs('votes')" :key="item.key">
                    <div class="flex w-full items-center gap-3 px-4 py-3" data-testid="home-vote">
                      <Icon :name="item.icon" class="h-4 w-4 shrink-0 t-text-muted" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium t-text">{{ item.title }}</span>
                        <span class="block truncate text-sm t-text-muted">{{ item.sub }}</span>
                      </span>
                      <AppButton v-if="has.acts('vote-in-card')" size="sm" variant="outline" @click="navigateToOrg(item.route)">Vote</AppButton>
                    </div>
                  </li>
                  <li v-for="r in homeRequests" v-show="has.needs('my-requests')" :key="r.id">
                    <NuxtLink
                      :to="buildOrgPath(`/requests/${r.id}`)"
                      class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      data-testid="home-request"
                    >
                      <Icon name="i-lucide-wrench" class="h-4 w-4 shrink-0 t-text-muted" />
                      <span class="min-w-0 flex-1 truncate text-sm font-medium t-text">{{ r.title }}</span>
                      <Icon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 t-text-muted" />
                    </NuxtLink>
                  </li>
                  <li
                    v-if="!(has.needs('balance-due') && nextByKind('dues').length) && !(has.needs('votes') && nextByKind('poll').length) && !(has.needs('my-requests') && homeRequests.length)"
                    class="px-4 py-3 text-sm t-text-muted"
                  >
                    Nothing needs you right now.
                  </li>
                </ul>
              </AppCard>
              <AppButton
                v-if="has.acts('new-request-sheet') && isEnabled('requests')"
                variant="outline"
                size="sm"
                data-testid="home-new-request"
                @click="showNewRequest = true"
              >
                <Icon name="i-lucide-plus" class="mr-1.5 h-4 w-4" />
                New request
              </AppButton>
            </div>
          </template>

          <template #glance>
            <HomeManagerGlance v-if="has.glance('community-load')" :role-context="roleContext" />
            <HomeBoardGlance v-if="has.glance('arrears-meter')" />
            <HomeTeamGlance v-if="has.glance('team-ring')" :tasks="myTasks" />
            <div v-if="memberGlance" class="space-y-3">
              <h2 v-if="!otherGlance" class="t-eyebrow">At a glance</h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AppCard v-if="has.glance('paid-ring') && isEnabled('payments')" class="flex items-center gap-4 p-4" data-testid="home-paid-ring">
                  <AppChartRing :value="paidYear.paid" :max="paidYear.charged || 1" :size="84" label="Paid this year" />
                  <div>
                    <p class="text-sm font-medium t-text">Paid this year</p>
                    <p class="text-xs t-text-muted">{{ fmtMoney(paidYear.paid) }} of {{ fmtMoney(paidYear.charged) }}</p>
                  </div>
                </AppCard>
                <AppCard v-if="has.glance('balance-sparkline') && isEnabled('payments')" class="p-4" data-testid="home-balance-spark">
                  <p class="text-sm font-medium t-text">Balance, last 12 months</p>
                  <AppChartSparkline :values="balancePoints" :width="220" :height="40" label="Balance owed, last 12 months" />
                </AppCard>
                <AppCard v-if="has.glance('next-meeting') && nextMeeting" class="p-4" data-testid="home-next-meeting">
                  <p class="t-eyebrow mb-1">Next meeting</p>
                  <p class="text-sm font-medium t-text">{{ nextMeeting.title }}</p>
                  <p class="text-xs t-text-muted">{{ nextMeeting.sub }}</p>
                  <AppButton v-if="has.acts('rsvp')" class="mt-3" size="sm" variant="outline" @click="navigateToOrg('/meetings')">RSVP</AppButton>
                </AppCard>
                <AppCard
                  v-if="has.glance('request-status-track') && homeRequests.length"
                  class="space-y-4 p-4 sm:col-span-2"
                  data-testid="home-status-tracks"
                >
                  <div v-for="r in homeRequests" :key="r.id">
                    <p class="mb-2 truncate text-sm font-medium t-text">{{ r.title }}</p>
                    <AppChartStatusTrack :steps="[...REQUEST_STEPS]" :current="requestTrackKey(r.status)" />
                  </div>
                </AppCard>
                <AppCard v-if="has.glance('next-event') && nextMeeting && !has.glance('next-meeting')" class="p-4" data-testid="home-next-event">
                  <p class="t-eyebrow mb-1">Next in your building</p>
                  <p class="text-sm font-medium t-text">{{ nextMeeting.title }}</p>
                  <p class="text-xs t-text-muted">{{ nextMeeting.sub }}</p>
                </AppCard>
              </div>
            </div>
          </template>

          <template #feed><span class="hidden" /></template>
        </HomePage>
        <HomeUpNext v-else :org-id="selectedOrgId" :member-id="currentOrg?.id" :user-id="user?.id" />

        <AppBottomSheet v-model:open="showNewRequest" title="New request">
          <RequestsRequestForm
            :organization-id="selectedOrgId"
            :allowed-types="['question', 'maintenance', 'arc', 'complaint']"
            @created="onRequestCreated"
            @cancel="showNewRequest = false"
          />
        </AppBottomSheet>

        <!-- Board Member Stats (only for board members) -->
        <div v-if="isBoardMember" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AppStatCard
            title="Total Members"
            :value="memberStats?.total || 0"
            description="Active community members"
            icon="i-lucide-users"
          />
          <AppStatCard
            title="Owners"
            :value="memberStats?.owners || 0"
            description="Property owners"
            icon="i-lucide-home"
          />
          <AppStatCard
            title="Residents"
            :value="memberStats?.tenants || 0"
            description="Tenants"
            icon="i-lucide-users-round"
          />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Recent Announcements -->
          <AppCard>
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle>Announcements</CardTitle>
                  <CardDescription>Latest community news</CardDescription>
                </div>
                <AppButton
                  v-if="feedEnabled"
                  variant="outline"
                  size="sm"
                  @click="activeTab = 'building'"
                >
                  Building feed
                </AppButton>
              </div>
            </CardHeader>
            <CardContent>
              <WidgetRowSkeleton v-if="annLoading || newsPending" :rows="4" avatar-shape="square" :trailing="false" />
              <div v-else-if="newsItems.length > 0" class="space-y-3">
                <!-- A row opens the Building tab, which is on this same page —
                     so it's a tab switch, not a navigation. With the feed module
                     off there is no tab to open, and the rows render inert
                     rather than as buttons that do nothing. -->
                <component
                  :is="feedEnabled ? 'button' : 'div'"
                  v-for="a in newsItems"
                  :key="a.key"
                  :type="feedEnabled ? 'button' : undefined"
                  class="stagger-item w-full flex items-start gap-3 p-3 rounded-lg text-left"
                  :class="feedEnabled ? 'hover:t-bg-subtle transition-colors' : ''"
                  @click="feedEnabled && (activeTab = 'building')"
                >
                  <div class="t-icon-chip w-9 h-9 flex-shrink-0">
                    <Icon
                      :name="a.pinned ? 'i-lucide-pin' : a.personal ? 'i-lucide-mail' : 'i-lucide-megaphone'"
                      class="h-4 w-4"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h4 class="font-medium t-text truncate">{{ a.title }}</h4>
                      <span
                        v-if="a.pinned"
                        class="text-[10px] uppercase tracking-wide t-text-accent font-semibold"
                        >Pinned</span
                      >
                      <!-- "Sent to you" rather than to the community — so a
                           resident can tell the two apart at a glance. -->
                      <span
                        v-else-if="a.personal"
                        class="text-[10px] uppercase tracking-wide t-text-muted font-semibold"
                        >To you</span
                      >
                    </div>
                    <p v-if="a.excerpt" class="text-sm t-text-muted truncate">{{ a.excerpt }}</p>
                    <p class="text-xs t-text-muted mt-0.5">{{ formatDate(a.date) }}</p>
                  </div>
                </component>
              </div>
              <div v-else class="py-8 text-center t-text-muted">
                <Icon name="i-lucide-megaphone" class="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p class="text-sm">No announcements yet.</p>
              </div>
            </CardContent>
          </AppCard>

          <!-- Recent Documents -->
          <AppCard>
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Documents</CardTitle>
                  <CardDescription>Latest community documents</CardDescription>
                </div>
                <AppButton variant="outline" size="sm" @click="navigateToOrg('/documents')">
                  View All
                </AppButton>
              </div>
            </CardHeader>
            <CardContent>
              <WidgetRowSkeleton v-if="docsLoading" :rows="4" avatar-shape="square" :trailing="false" />
              <div v-else-if="recentDocuments && recentDocuments.length > 0" class="space-y-3">
                <button
                  v-for="doc in recentDocuments"
                  :key="doc.id"
                  @click="downloadDocument(doc)"
                  class="stagger-item w-full flex items-center gap-4 p-3 rounded-lg hover:t-bg-subtle transition-colors text-left group"
                >
                  <div class="t-icon-chip w-9 h-9 flex-shrink-0">
                    <Icon name="i-lucide-file-text" class="h-4 w-4" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="font-medium t-text truncate">{{ doc.title }}</h4>
                    <div class="flex items-center gap-2 text-sm t-text-muted">
                      <span>{{ getCategoryName(doc) }}</span>
                      <span v-if="doc.date_published || doc.date_created">
                        &middot; {{ formatDate(doc.date_published || doc.date_created) }}
                      </span>
                    </div>
                  </div>
                  <Icon
                    name="i-lucide-download"
                    class="h-4 w-4 t-text-muted group-hover:t-text-accent transition-colors"
                  />
                </button>
              </div>
              <div v-else class="py-8 text-center t-text-muted">
                <Icon name="i-lucide-file" class="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p class="text-sm">No documents published yet.</p>
              </div>
            </CardContent>
          </AppCard>
        </div>

        <!-- Portal sections — where to go next, AFTER what is happening.
             This used to open the Overview tab, so a resident signing in was met
             by a menu of eight cards and had to pick one before seeing anything.
             The announcements and documents they came for now come first and the
             navigation follows, which is also the order the two primary action
             pills in the hero already imply.

             All sections are shown; ones the community hasn't enabled render
             greyed + non-navigating. Classic / luxury render as full-width
             hairline rows; modern as soft cards. -->
        <section>
          <p class="t-eyebrow mb-4">Your portal</p>
          <div class="portal-grid">
            <component
              :is="section.available ? 'button' : 'div'"
              v-for="section in portalSections"
              :key="section.key"
              :type="section.available ? 'button' : undefined"
              class="stagger-item portal-item group"
              :class="section.available ? 'portal-item--on' : 'portal-item--off'"
              :aria-disabled="section.available ? undefined : 'true'"
              @click="section.available && navigateToOrg(section.path)"
            >
              <span class="t-icon-chip portal-item__icon">
                <Icon :name="section.icon" class="h-5 w-5" />
              </span>
              <span class="portal-item__body">
                <span class="portal-item__label t-heading t-text">{{ section.label }}</span>
                <span class="portal-item__desc t-text-muted">
                  {{ section.available ? section.description : "Not available for your community" }}
                </span>
              </span>
              <Icon name="i-lucide-chevron-right" class="portal-item__chev" />
            </component>
          </div>
        </section>

        <!-- My Household summary -->
        <AppCard>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>My Household</CardTitle>
                <CardDescription>Your unit record on file</CardDescription>
              </div>
              <AppButton variant="outline" size="sm" @click="navigateToOrg('/profile')">
                Manage
              </AppButton>
            </div>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.parkingSpots }}</p>
                <p class="text-xs t-text-muted mt-0.5">Parking spots</p>
              </div>
              <div v-if="vehiclesEnabled" class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.vehicles }}</p>
                <p class="text-xs t-text-muted mt-0.5">Vehicles</p>
              </div>
              <div v-if="petsEnabled" class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.pets }}</p>
                <p class="text-xs t-text-muted mt-0.5">Pets</p>
              </div>
              <div class="rounded-lg t-bg-subtle p-4 text-center">
                <p class="text-2xl font-semibold t-text">{{ householdStats.pending }}</p>
                <p class="text-xs t-text-muted mt-0.5">Pending changes</p>
              </div>
            </div>
            <p class="text-sm t-text-muted mt-4">
              Keep your contact info, mailing address, vehicles and pets up to date —
              changes are sent to your community manager for review.
            </p>
          </CardContent>
        </AppCard>

        <!-- Board Member Status (only shown if user is a board member) -->
        <AppCard v-if="isBoardMember && activeBoardTerms.length > 0">
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full t-bg-accent/20 flex items-center justify-center">
                <Icon name="i-lucide-star" class="h-5 w-5 t-text-accent" />
              </div>
              <div>
                <CardTitle>Board Member Status</CardTitle>
                <CardDescription>Your current board position(s)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div
                v-for="term in activeBoardTerms"
                :key="term.id"
                class="flex items-center justify-between p-3 t-bg-subtle rounded-lg t-border"
              >
                <div class="flex items-center gap-3">
                  <Icon name="i-lucide-badge-check" class="h-5 w-5 t-text-accent" />
                  <div>
                    <p class="font-medium t-text capitalize">
                      {{ term.title?.replace('_', ' ') || 'Board Member' }}
                    </p>
                    <p class="text-sm t-text-muted">
                      <span v-if="term.term_start">{{ formatBoardTermDate(term.term_start) }}</span>
                      <span v-if="term.term_start && term.term_end"> - </span>
                      <span v-if="term.term_end">{{ formatBoardTermDate(term.term_end) }}</span>
                      <span v-if="!term.term_end && term.term_start">- Present</span>
                    </p>
                  </div>
                </div>
                <span class="px-2.5 py-1 text-xs font-medium rounded-full t-bg-accent/15 t-text-accent">
                  Active
                </span>
              </div>
            </div>
          </CardContent>
        </AppCard>

        <!-- Contact Information -->
        <AppCard v-if="organization?.phone || organization?.email">
          <CardHeader>
            <CardTitle>Contact Management</CardTitle>
            <CardDescription>Get in touch with your HOA management team</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                v-if="organization?.phone"
                :href="`tel:${organization.phone}`"
                class="flex items-center gap-3 p-4 rounded-lg t-bg-subtle hover:t-bg transition-colors"
              >
                <div class="w-10 h-10 rounded-full t-bg-accent/15 flex items-center justify-center">
                  <Icon name="i-lucide-phone" class="h-5 w-5 t-text-accent" />
                </div>
                <div>
                  <p class="text-sm t-text-muted">Phone</p>
                  <p class="font-medium t-text">{{ organization.phone }}</p>
                </div>
              </a>
              <a
                v-if="organization?.email"
                :href="`mailto:${organization.email}`"
                class="flex items-center gap-3 p-4 rounded-lg t-bg-subtle hover:t-bg transition-colors"
              >
                <div class="w-10 h-10 rounded-full t-bg-accent/15 flex items-center justify-center">
                  <Icon name="i-lucide-mail" class="h-5 w-5 t-text-accent" />
                </div>
                <div>
                  <p class="text-sm t-text-muted">Email</p>
                  <p class="font-medium t-text">{{ organization.email }}</p>
                </div>
              </a>
            </div>
          </CardContent>
        </AppCard>

        <!-- Admin Link (only for admins previewing the member view) -->
        <div v-if="isAdmin" class="text-center">
          <AppButton variant="outline" @click="navigateToOrg('/')">
            <Icon name="i-lucide-layout-dashboard" class="h-4 w-4 mr-2" />
            Go to Admin Dashboard
          </AppButton>
        </div>
          </div>

          <!-- Building feed tab -->
          <div v-else-if="activeTab === 'building' && feedEnabled" class="space-y-6">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h2 class="text-xl font-semibold t-text">Building</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Everything happening in your community — react and join the conversation.
                </p>
              </div>
              <NuxtLink :to="buildOrgPath('/polls')">
                <AppButton variant="outline" class="rounded-full">
                  <Icon name="i-lucide-bar-chart-3" class="w-4 h-4 mr-1.5" />
                  Polls
                </AppButton>
              </NuxtLink>
            </div>
            <FeedActivityFeed
              :organization-id="selectedOrgId"
              :is-board="isBoard"
              :is-member="isMember"
            />
          </div>
        </AppTabPanels>
      </PageContainer>
  </div>
</template>
