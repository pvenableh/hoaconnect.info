<script setup lang="ts">
import { toast } from "vue-sonner";
import type { HoaDocument } from "~~/types/directus";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { list: listDocuments } = useDirectusItems("hoa_documents");
const { getUrl } = useDirectusFiles();
const { initTheme } = useTheme();

onMounted(() => {
  initTheme();
});

const { selectedOrgId, isAdmin, isBoardMember, isMember } = await useSelectedOrg();
const isBoard = computed(() => isAdmin.value || isBoardMember.value);
const documentId = computed(() => route.params.id as string);

const { data: doc, pending } = await useAsyncData(
  `document-${documentId.value}`,
  async () => {
    if (!selectedOrgId.value || !documentId.value) return null;
    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "status",
        "date_published",
        "date_created",
        "document_category.id",
        "document_category.name",
        "document_category.slug",
        "file.id",
        "file.filename_download",
        "file.type",
        "file.filesize",
      ],
      filter: {
        id: { _eq: documentId.value },
        organization: { _eq: selectedOrgId.value },
        status: { _eq: "published" },
      },
      limit: 1,
    });
    return ((result || [])[0] as HoaDocument) || null;
  },
  { watch: [documentId, selectedOrgId], server: false }
);

const categoryName = computed(() => {
  const cat = doc.value?.document_category;
  return typeof cat === "object" && cat ? cat.name : null;
});

const fileMeta = computed(() =>
  typeof doc.value?.file === "object" ? doc.value?.file : null
);

const isImage = computed(() => fileMeta.value?.type?.startsWith("image/"));
const isPdf = computed(() => fileMeta.value?.type?.includes("pdf"));

const previewUrl = computed(() => {
  const fileId = fileMeta.value?.id;
  return fileId ? getUrl(fileId) : null;
});

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileIcon(mimeType: string | undefined): string {
  if (!mimeType) return "heroicons:document";
  if (mimeType.includes("pdf")) return "heroicons:document-text";
  if (mimeType.includes("word") || mimeType.includes("document"))
    return "heroicons:document";
  if (mimeType.includes("sheet") || mimeType.includes("excel"))
    return "heroicons:table-cells";
  if (mimeType.includes("image")) return "heroicons:photo";
  return "heroicons:document";
}

const { trackDownload } = useActivityTracker();

const downloadDocument = async () => {
  try {
    const file = doc.value?.file;
    if (!file) {
      toast.error("No file attached to this document");
      return;
    }
    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getUrl(fileId);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Failed to fetch file");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename =
      typeof file === "object"
        ? file.filename_download
        : doc.value?.title || "document";
    link.download = filename || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (doc.value?.id) {
      trackDownload({ targetId: doc.value.id, label: doc.value.title || filename || "document" });
    }
  } catch (error) {
    console.error("Failed to download document:", error);
    toast.error("Failed to download document");
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
        <!-- Back link -->
        <BackLink :to="buildOrgPath('/documents')" label="All documents" />

        <!-- Loading -->
        <div v-if="pending" class="py-24 flex justify-center">
          <div class="spinner-ios" />
        </div>

        <!-- Not found -->
        <Card v-else-if="!doc" class="t-card-flat">
          <CardContent class="py-16 text-center">
            <div
              class="w-16 h-16 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-4"
            >
              <Icon name="heroicons:document" class="h-8 w-8 t-text-muted" />
            </div>
            <h3 class="text-lg font-medium t-text t-heading mb-2">
              Document not found
            </h3>
            <p class="t-text-muted">
              This document may have been removed or is no longer available.
            </p>
          </CardContent>
        </Card>

        <!-- Document detail -->
        <template v-else>
          <div class="ios-card p-6">
            <div class="flex items-start gap-4">
              <div
                class="w-12 h-12 rounded-xl t-bg-subtle flex items-center justify-center flex-shrink-0"
              >
                <Icon
                  :name="getFileIcon(fileMeta?.type)"
                  class="h-6 w-6 t-text-accent"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h1 class="text-xl font-semibold t-text t-heading">
                  {{ doc.title }}
                </h1>
                <div
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm t-text-muted"
                >
                  <span v-if="categoryName">{{ categoryName }}</span>
                  <span v-if="doc.date_published || doc.date_created">
                    {{ formatDate(doc.date_published || doc.date_created) }}
                  </span>
                  <span v-if="fileMeta?.filesize">
                    {{ formatSize(fileMeta.filesize) }}
                  </span>
                </div>
              </div>
              <Button
                @click="downloadDocument"
                class="rounded-full flex-shrink-0"
              >
                <Icon name="heroicons:arrow-down-tray" class="h-4 w-4 mr-1.5" />
                Download
              </Button>
            </div>
          </div>

          <!-- Inline preview -->
          <div v-if="previewUrl && isImage" class="ios-card p-2 overflow-hidden">
            <img
              :src="previewUrl"
              :alt="doc.title || 'Document'"
              class="w-full h-auto rounded-xl"
            />
          </div>
          <div
            v-else-if="previewUrl && isPdf"
            class="ios-card p-0 overflow-hidden"
          >
            <iframe
              :src="previewUrl"
              :title="doc.title || 'Document'"
              class="w-full h-[70vh] rounded-2xl"
            />
          </div>

          <!-- Conversation (Phase 5 substrate on an existing entity) -->
          <div class="ios-card p-6">
            <CommentsCommentThread
              :target-collection="'hoa_documents'"
              :target-id="doc.id"
              :organization-id="selectedOrgId"
              :is-board="isBoard"
              :is-member="isMember"
            />
          </div>
        </template>
    </PageContainer>
  </div>
</template>
