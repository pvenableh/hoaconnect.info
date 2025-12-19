<script setup lang="ts">
import type { HoaDocument, HoaOrganization } from "~~/types/directus";

const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { getUrl } = useDirectusFiles();
const { buildOrgPath, navigateToOrg } = useOrgNavigation();

// Get organization context including member type and board member status
const {
  selectedOrgId,
  currentOrg,
  isAdmin,
  memberType,
  isOwner,
  isTenant,
  isBoardMember,
  boardTitleDisplay,
  activeBoardTerms,
} = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed<HoaOrganization | null>(() => currentOrg.value?.organization || null);
const memberInfo = computed(() => currentOrg.value);

// Get org logo URL
const orgLogoUrl = computed(() => {
  const logoId = organization.value?.settings?.logo;
  if (!logoId) return null;
  const fileId = typeof logoId === "string" ? logoId : logoId?.id;
  if (!fileId) return null;
  return `${config.public.directus.url}/assets/${fileId}?key=medium-contain`;
});

// Fetch recent documents (last 5 published)
const { data: recentDocuments } = await useAsyncData(
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

// Download document
const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file;
    if (!file) return;

    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getUrl(fileId);
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

// Quick action cards for members
const quickActions = computed(() => [
  {
    title: "View Documents",
    description: "Access community bylaws, meeting minutes, and notices",
    icon: "heroicons:document-text",
    action: () => navigateToOrg("/documents"),
  },
]);

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

// Get member status description
const memberStatusDescription = computed(() => {
  const parts: string[] = [];
  parts.push(memberTypeDisplay.value);
  if (isBoardMember.value && boardTitleDisplay.value) {
    parts.push(`Board ${boardTitleDisplay.value}`);
  }
  return parts.join(" · ");
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
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-8">
        <!-- Welcome Header -->
        <div class="text-center py-8">
          <!-- Organization Logo -->
          <div v-if="orgLogoUrl" class="mb-6">
            <img
              :src="orgLogoUrl"
              :alt="organization?.name || 'Organization'"
              class="h-20 mx-auto object-contain"
            />
          </div>

          <h1 class="text-3xl font-bold text-stone-900">
            {{ welcomeMessage }}, {{ userName }}
          </h1>
          <p class="text-stone-600 mt-2">
            Welcome to the {{ organization?.name }} resident portal
          </p>

          <!-- Member Status Badge -->
          <div class="flex items-center justify-center gap-2 mt-4">
            <span
              class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full"
              :class="{
                'bg-emerald-100 text-emerald-800': isOwner,
                'bg-blue-100 text-blue-800': isTenant,
                'bg-stone-100 text-stone-700': !isOwner && !isTenant,
              }"
            >
              <Icon
                :name="isOwner ? 'heroicons:home' : 'heroicons:user'"
                class="w-4 h-4 mr-1.5"
              />
              {{ memberTypeDisplay }}
            </span>
            <span
              v-if="isBoardMember && boardTitleDisplay"
              class="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-amber-100 text-amber-800"
            >
              <Icon name="heroicons:star" class="w-4 h-4 mr-1.5" />
              Board {{ boardTitleDisplay }}
            </span>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            v-for="action in quickActions"
            :key="action.title"
            class="cursor-pointer hover:shadow-lg transition-shadow"
            @click="action.action"
          >
            <CardContent class="p-6 flex items-center gap-4">
              <div class="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon :name="action.icon" class="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 class="font-semibold text-stone-900">{{ action.title }}</h3>
                <p class="text-sm text-stone-500">{{ action.description }}</p>
              </div>
              <Icon name="heroicons:chevron-right" class="h-5 w-5 text-stone-400 ml-auto" />
            </CardContent>
          </Card>
        </div>

        <!-- Board Member Status (only shown if user is a board member) -->
        <Card v-if="isBoardMember && activeBoardTerms.length > 0" class="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Icon name="heroicons:star" class="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle class="text-amber-900">Board Member Status</CardTitle>
                <CardDescription class="text-amber-700">Your current board position(s)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-3">
              <div
                v-for="term in activeBoardTerms"
                :key="term.id"
                class="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100"
              >
                <div class="flex items-center gap-3">
                  <Icon name="heroicons:identification" class="h-5 w-5 text-amber-600" />
                  <div>
                    <p class="font-medium text-stone-900 capitalize">
                      {{ term.title?.replace('_', ' ') || 'Board Member' }}
                    </p>
                    <p class="text-sm text-stone-500">
                      <span v-if="term.term_start">{{ formatBoardTermDate(term.term_start) }}</span>
                      <span v-if="term.term_start && term.term_end"> - </span>
                      <span v-if="term.term_end">{{ formatBoardTermDate(term.term_end) }}</span>
                      <span v-if="!term.term_end && term.term_start">- Present</span>
                    </p>
                  </div>
                </div>
                <span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                  Active
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Recent Documents -->
        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <div>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>Latest community documents</CardDescription>
              </div>
              <Button variant="outline" size="sm" @click="navigateToOrg('/documents')">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="recentDocuments && recentDocuments.length > 0" class="space-y-3">
              <button
                v-for="doc in recentDocuments"
                :key="doc.id"
                @click="downloadDocument(doc)"
                class="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-stone-100 transition-colors text-left group"
              >
                <div class="w-10 h-10 rounded-lg bg-stone-100 group-hover:bg-stone-200 flex items-center justify-center flex-shrink-0">
                  <Icon name="heroicons:document-text" class="h-5 w-5 text-stone-600" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium text-stone-900 truncate">{{ doc.title }}</h4>
                  <div class="flex items-center gap-2 text-sm text-stone-500">
                    <span>{{ getCategoryName(doc) }}</span>
                    <span v-if="doc.date_published || doc.date_created">
                      &middot; {{ formatDate(doc.date_published || doc.date_created) }}
                    </span>
                  </div>
                </div>
                <Icon
                  name="heroicons:arrow-down-tray"
                  class="h-5 w-5 text-stone-400 group-hover:text-primary transition-colors"
                />
              </button>
            </div>
            <div v-else class="py-8 text-center text-stone-500">
              <Icon name="heroicons:document" class="h-12 w-12 mx-auto mb-3 text-stone-300" />
              <p>No documents have been published yet.</p>
            </div>
          </CardContent>
        </Card>

        <!-- Contact Information -->
        <Card v-if="organization?.phone || organization?.email">
          <CardHeader>
            <CardTitle>Contact Management</CardTitle>
            <CardDescription>Get in touch with your HOA management team</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                v-if="organization?.phone"
                :href="`tel:${organization.phone}`"
                class="flex items-center gap-3 p-4 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon name="heroicons:phone" class="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p class="text-sm text-stone-500">Phone</p>
                  <p class="font-medium text-stone-900">{{ organization.phone }}</p>
                </div>
              </a>
              <a
                v-if="organization?.email"
                :href="`mailto:${organization.email}`"
                class="flex items-center gap-3 p-4 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon name="heroicons:envelope" class="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p class="text-sm text-stone-500">Email</p>
                  <p class="font-medium text-stone-900">{{ organization.email }}</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>

        <!-- Admin Link (only for admins) -->
        <div v-if="isAdmin" class="text-center">
          <Button variant="outline" @click="navigateToOrg('/dashboard')">
            <Icon name="heroicons:cog-6-tooth" class="h-4 w-4 mr-2" />
            Go to Admin Dashboard
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
