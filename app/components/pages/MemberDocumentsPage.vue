<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { HoaDocument, HoaDocumentCategory } from "#core/types/directus";

const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listCategories } = useDirectusItems("hoa_document_categories");
const { getAuthUrl } = useDirectusFiles();

// Await to ensure org is loaded during SSR
const { selectedOrgId } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);

// Category icon mapping for default categories
const categoryIcons: Record<string, string> = {
  bylaws: "heroicons:scale",
  financials: "heroicons:currency-dollar",
  minutes: "heroicons:user-group",
  agendas: "heroicons:clipboard-document-list",
  notices: "heroicons:bell",
};

// Default category for fallback
const getIconForCategory = (category: HoaDocumentCategory | string | null) => {
  if (!category) return "heroicons:document";
  const slug = typeof category === "string" ? category : category.slug;
  return categoryIcons[slug || ""] || "heroicons:folder";
};

// Fetch document categories for the organization
const { data: categories } = await useAsyncData(
  `document-categories-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    const result = await listCategories({
      fields: ["id", "name", "slug", "description", "icon", "sort_by_date", "sort"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["sort", "name"],
    });

    return (result || []) as HoaDocumentCategory[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Fetch published documents for the organization
const { data: documents, pending, error: documentsError } = await useAsyncData(
  `member-documents-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    const result = await listDocuments({
      fields: [
        "id",
        "title",
        "document_category.id",
        "document_category.name",
        "document_category.slug",
        "document_category.sort_by_date",
        "date_published",
        "date_created",
        "file.id",
        "file.filename_download",
        "file.type",
      ],
      filter: {
        organization: { _eq: orgId.value },
        status: { _eq: "published" },
      },
      sort: ["-date_published", "-date_created"],
    });

    return (result || []) as HoaDocument[];
  },
  {
    watch: [orgId],
    server: false,
  }
);

// Group documents by category
const documentsByCategory = computed(() => {
  if (!documents.value) return new Map<string, { category: HoaDocumentCategory | null; documents: HoaDocument[] }>();

  const grouped = new Map<string, { category: HoaDocumentCategory | null; documents: HoaDocument[] }>();

  // First, add all known categories (even if empty)
  if (categories.value) {
    for (const cat of categories.value) {
      grouped.set(cat.id, { category: cat, documents: [] });
    }
  }

  // Group documents by document_category
  for (const doc of documents.value) {
    const docCategory = doc.document_category;

    if (docCategory) {
      const catId = typeof docCategory === "string" ? docCategory : docCategory.id;
      const existing = grouped.get(catId);
      if (existing) {
        existing.documents.push(doc);
      } else {
        // Category from document (might not be in our categories list)
        const categoryObj = typeof docCategory === "object" ? docCategory : null;
        grouped.set(catId, {
          category: categoryObj,
          documents: [doc]
        });
      }
    } else {
      // Uncategorized documents
      const uncatId = "uncategorized";
      const existing = grouped.get(uncatId);
      if (existing) {
        existing.documents.push(doc);
      } else {
        grouped.set(uncatId, {
          category: { id: uncatId, name: "Other Documents", slug: "other" } as HoaDocumentCategory,
          documents: [doc]
        });
      }
    }
  }

  // Sort documents within each category
  for (const [, group] of grouped) {
    if (group.category?.sort_by_date) {
      group.documents.sort((a, b) => {
        const dateA = new Date(a.date_published || a.date_created || 0);
        const dateB = new Date(b.date_published || b.date_created || 0);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });
    }
  }

  // Remove empty categories
  for (const [key, group] of grouped) {
    if (group.documents.length === 0) {
      grouped.delete(key);
    }
  }

  return grouped;
});

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

// Get file type icon
function getFileIcon(mimeType: string | undefined): string {
  if (!mimeType) return "heroicons:document";
  if (mimeType.includes("pdf")) return "heroicons:document-text";
  if (mimeType.includes("word") || mimeType.includes("document")) return "heroicons:document";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "heroicons:table-cells";
  if (mimeType.includes("image")) return "heroicons:photo";
  return "heroicons:document";
}

// Download document
const { trackDownload } = useActivityTracker();

const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file;
    if (!file) {
      toast.error("No file attached to this document");
      return;
    }

    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getAuthUrl(fileId);
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Use the document title or original filename for download
    const filename = typeof file === "object" ? file.filename_download : doc.title || "document";
    link.download = filename || "document";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    trackDownload({ targetId: doc.id, label: doc.title || filename || "document" });
  } catch (error) {
    console.error("Failed to download document:", error);
    toast.error("Failed to download document");
  }
};

// Every category opens by default: a resident arriving here should see the
// documents themselves, not a list of folders to go fishing in.
const defaultOpenCategories = computed(() => {
  return Array.from(documentsByCategory.value.keys());
});

// This page fetches with `server: false`, so the request never STARTS during
// SSR and `pending` is false on the server. The template read that as "done,
// and there is nothing" — the server rendered "No documents available" before
// anything had looked, and the client then rendered the skeleton, so the two
// disagreed at hydration. Treat "no data and no error yet" as loading, which
// is what it actually is. An error still falls through to the empty state
// rather than spinning forever.
const documentsLoading = computed(
  () => pending.value || (!documents.value && !documentsError.value)
);
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <!-- One header, one body. This page used to branch its entire body on the
           org's PUBLIC theme: "modern" orgs got a grid of category tiles whose
           only always-visible content was the category name — the document
           count was hover-only, so on a phone every tile was an unlabelled
           box — and reaching a document meant tile -> modal -> row, with no
           URL and no back button. The accordion below is the branch that
           actually shows people their documents, and it is the last admin-side
           read of themeStyle in the app. -->
      <AppPageHeader
        title="Documents"
        description="Access important community documents and resources."
      />

      <!-- Loading — content-shaped skeleton (client-only fetch) -->
      <div v-if="documentsLoading" class="ios-card p-2">
        <WidgetRowSkeleton :rows="6" avatar-shape="square" />
      </div>

      <Card v-else-if="documentsByCategory.size > 0" class="t-card-flat">
        <CardContent class="p-0">
          <Accordion type="multiple" :default-value="defaultOpenCategories" class="w-full">
            <AccordionItem
              v-for="[categoryId, group] in documentsByCategory"
              :key="categoryId"
              :value="categoryId"
              class="border-b t-border last:border-b-0"
            >
              <AccordionTrigger class="px-6 py-4 t-hover-bg">
                <div class="flex items-center gap-3">
                  <div class="icon-tile shrink-0 rounded-lg t-bg-accent/10 flex items-center justify-center">
                    <Icon
                      :name="group.category?.icon || getIconForCategory(group.category)"
                      class="t-text-accent"
                    />
                  </div>
                  <div class="text-left">
                    <span class="type-card t-text">
                      {{ group.category?.name || 'Documents' }}
                    </span>
                    <span class="ml-2 type-meta t-text-muted">
                      ({{ group.documents.length }})
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div class="px-6 pb-4">
                  <!-- Category description if available -->
                  <p
                    v-if="group.category?.description"
                    class="type-meta t-text-muted mb-4 pl-13"
                  >
                    {{ group.category.description }}
                  </p>

                  <!-- Document list -->
                  <div class="space-y-2">
                    <button
                      v-for="doc in group.documents"
                      :key="doc.id"
                      @click="downloadDocument(doc)"
                      class="w-full flex items-center gap-4 p-3 rounded-lg t-hover-bg transition-colors text-left group"
                    >
                      <!-- File icon -->
                      <div class="icon-tile rounded-lg t-bg-subtle flex items-center justify-center shrink-0 group-hover:t-bg-alt">
                        <Icon
                          :name="getFileIcon(typeof doc.file === 'object' ? doc.file?.type : undefined)"
                          class="t-text-secondary"
                        />
                      </div>

                      <!-- Document info -->
                      <div class="flex-1 min-w-0">
                        <h3 class="type-card t-text truncate">
                          {{ doc.title }}
                        </h3>
                        <p v-if="doc.date_published || doc.date_created" class="type-meta t-text-muted">
                          {{ formatDate(doc.date_published || doc.date_created) }}
                        </p>
                      </div>

                      <!-- Download affordance. This was hover-only, which means
                           it did not exist on a touch device — the row read as
                           inert. Always visible, muted until hover. -->
                      <div class="icon-glyph shrink-0">
                        <Icon
                          name="heroicons:arrow-down-tray"
                          class="t-text-muted group-hover:t-text-accent transition-colors"
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <!-- Empty state -->
      <Card v-else class="t-card-flat">
        <CardContent class="p-0">
          <AppEmptyState
            icon="lucide:file-text"
            title="No documents available"
            description="Community documents appear here once your board publishes them."
          />
        </CardContent>
      </Card>
    </PageContainer>
  </div>
</template>

<style scoped>
/* Nuxt Icon runs in CSS mode here, so `<Icon>` renders a masked
   `<span class="iconify">` that is 1em square and takes its size from
   `font-size` — the `h-5 w-5` these icons used to carry never applied at all
   (measured: 13.125px, i.e. the inherited font-size, where `w-5` would have
   given 18.75px). Same failure the empty-state icons had. Size the wrapper's
   font-size instead, which is the mechanism that actually works. */
.icon-tile {
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1.25rem;
}

.icon-glyph {
  font-size: 1.25rem;
  line-height: 0;
}
</style>
