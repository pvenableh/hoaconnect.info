<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { list: listDocuments, remove: removeDocument } = useDirectusItems("hoa_documents");
const { getFileUrl } = useDirectusFiles();

// Await to ensure org is loaded during SSR
const { selectedOrgId } = await useSelectedOrg();

const orgId = computed(() => selectedOrgId.value);

// Filter state
const category = ref("all");
const status = ref("published");

// Fetch documents
const { data: documents, refresh } = await useAsyncData(
  `documents-${orgId.value}-${category.value}-${status.value}`,
  async () => {
    if (!orgId.value) return [];
    const result = await listDocuments({
      fields: ["id", "title", "category", "status", "date_published", "file.*"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: [status.value] },
        ...(category.value !== "all" && { category: { _eq: category.value } }),
      },
      sort: ["sort", "-date_published"],
    });
    return result || [];
  },
  {
    watch: [category, status, orgId],
    server: false, // Fetch client-side only to ensure auth session is available
  }
);

// Delete document
const handleDelete = async (id: string) => {
  if (!confirm("Delete this document?")) return;

  try {
    await removeDocument(id);
    await refresh();
    toast.success("Document deleted");
  } catch (error) {
    toast.error("Failed to delete document");
  }
};
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-7xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
          <h1 class="text-3xl font-bold">Documents</h1>
          <Button @click="navigateTo('/documents/upload')">
            Upload Document
          </Button>
        </div>

        <!-- Filters -->
        <Card>
          <CardContent class="pt-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium mb-2 block">Category</label>
                <select v-model="category" class="w-full p-2 border rounded">
                  <option value="all">All Categories</option>
                  <option value="bylaws">Bylaws</option>
                  <option value="financials">Financials</option>
                  <option value="meeting_minutes">Meeting Minutes</option>
                  <option value="notices">Notices</option>
                </select>
              </div>

              <div>
                <label class="text-sm font-medium mb-2 block">Status</label>
                <select v-model="status" class="w-full p-2 border rounded">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Documents List -->
        <div class="grid grid-cols-1 gap-4">
          <Card v-for="doc in documents" :key="doc.id">
            <CardHeader>
              <div class="flex justify-between items-start">
                <div>
                  <CardTitle>{{ doc.title }}</CardTitle>
                  <CardDescription>
                    {{ doc.category }} •
                    {{ new Date(doc.date_published).toLocaleDateString() }}
                  </CardDescription>
                </div>
                <div class="flex gap-2">
                  <Button
                    v-if="doc.file"
                    @click="window.open(getFileUrl(doc.file.id), '_blank')"
                    variant="outline"
                    size="sm"
                  >
                    View
                  </Button>
                  <Button
                    @click="handleDelete(doc.id)"
                    variant="destructive"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div
            v-if="!documents?.length"
            class="text-center py-12 text-stone-500"
          >
            No documents found
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
