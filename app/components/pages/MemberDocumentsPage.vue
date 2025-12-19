<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { HoaDocument, HoaDocumentCategory } from "~~/types/directus";

const { list: listDocuments } = useDirectusItems("hoa_documents");
const { list: listCategories } = useDirectusItems("hoa_document_categories");
const { getUrl } = useDirectusFiles();

// Await to ensure org is loaded during SSR
const { selectedOrgId, currentOrg } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);

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
const { data: documents } = await useAsyncData(
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
const downloadDocument = async (doc: HoaDocument) => {
  try {
    const file = doc.file;
    if (!file) {
      toast.error("No file attached to this document");
      return;
    }

    const fileId = typeof file === "string" ? file : file.id;
    const fileUrl = getUrl(fileId);
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
  } catch (error) {
    console.error("Failed to download document:", error);
    toast.error("Failed to download document");
  }
};

// Default open categories
const defaultOpenCategories = computed(() => {
  return Array.from(documentsByCategory.value.keys());
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-stone-900">Documents</h1>
          <p class="text-stone-600 mt-2">
            Access important community documents and resources
          </p>
        </div>

        <!-- Documents Accordion -->
        <Card v-if="documentsByCategory.size > 0">
          <CardContent class="p-0">
            <Accordion type="multiple" :default-value="defaultOpenCategories" class="w-full">
              <AccordionItem
                v-for="[categoryId, group] in documentsByCategory"
                :key="categoryId"
                :value="categoryId"
                class="border-b last:border-b-0"
              >
                <AccordionTrigger class="px-6 py-4 hover:bg-stone-50">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon
                        :name="group.category?.icon || getIconForCategory(group.category)"
                        class="h-5 w-5 text-primary"
                      />
                    </div>
                    <div class="text-left">
                      <span class="font-semibold text-stone-900">
                        {{ group.category?.name || 'Documents' }}
                      </span>
                      <span class="ml-2 text-sm text-stone-500">
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
                      class="text-sm text-stone-500 mb-4 pl-13"
                    >
                      {{ group.category.description }}
                    </p>

                    <!-- Document list -->
                    <div class="space-y-2">
                      <button
                        v-for="doc in group.documents"
                        :key="doc.id"
                        @click="downloadDocument(doc)"
                        class="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-stone-100 transition-colors text-left group"
                      >
                        <!-- File icon -->
                        <div class="w-10 h-10 rounded-lg bg-stone-100 group-hover:bg-stone-200 flex items-center justify-center flex-shrink-0">
                          <Icon
                            :name="getFileIcon(typeof doc.file === 'object' ? doc.file?.type : undefined)"
                            class="h-5 w-5 text-stone-600"
                          />
                        </div>

                        <!-- Document info -->
                        <div class="flex-1 min-w-0">
                          <h3 class="font-medium text-stone-900 truncate">
                            {{ doc.title }}
                          </h3>
                          <p v-if="doc.date_published || doc.date_created" class="text-sm text-stone-500">
                            {{ formatDate(doc.date_published || doc.date_created) }}
                          </p>
                        </div>

                        <!-- Download indicator -->
                        <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Icon name="heroicons:arrow-down-tray" class="h-5 w-5 text-primary" />
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
        <Card v-else>
          <CardContent class="py-16 text-center">
            <div class="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="heroicons:document" class="h-8 w-8 text-stone-400" />
            </div>
            <h3 class="text-lg font-medium text-stone-900 mb-2">No documents available</h3>
            <p class="text-stone-500">
              Community documents will appear here once they are published.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
