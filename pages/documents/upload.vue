<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { user } = useDirectusAuth();
const { create: createDocument } = useDirectusItems("hoa_documents");
const { upload: uploadFile } = useDirectusFiles();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const folderComposable = useDirectusFolders();
const router = useRouter();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
const orgFolder = computed(() => organization.value?.folder || null);
const subfolders = ref<any[]>([]);

// Load subfolders when organization folder is available
watch(orgFolder, async (newFolder) => {
  if (newFolder) {
    try {
      const folders = await folderComposable.getByParent(newFolder);
      subfolders.value = folders || [];
    } catch (error) {
      console.error("Failed to fetch subfolders:", error);
      subfolders.value = [];
    }
  }
}, { immediate: true });

// Form state
const form = reactive({
  title: "",
  category: "notices",
  status: "draft",
  file: null as File | null,
  folder: "" as string,
});

const loading = ref(false);

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  form.file = target.files?.[0] || null;
};

const handleSubmit = async () => {
  if (!form.file || !form.title) {
    toast.error("Please fill all required fields");
    return;
  }

  if (!orgId.value) {
    toast.error("No organization selected");
    return;
  }

  loading.value = true;

  try {
    // Upload file to selected folder or organization's default folder
    const selectedFolder = form.folder || orgFolder.value;
    const fileResult = (await uploadFile(form.file, {
      title: form.title,
      folder: selectedFolder || undefined,
    })) as any;

    // Create document record
    await createDocument({
      title: form.title,
      category: form.category,
      status: form.status,
      organization: orgId.value,
      file: fileResult.id,
      date_published:
        form.status === "published" ? new Date().toISOString() : null,
      sort: 0,
    });

    toast.success("Document uploaded successfully");
    router.push("/documents");
  } catch (error) {
    console.error(error);
    toast.error("Failed to upload document");
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Header -->
        <div>
          <Button
            @click="router.back()"
            variant="outline"
            size="sm"
            class="mb-4"
          >
            ← Back
          </Button>
          <h1 class="text-3xl font-bold">Upload Document</h1>
        </div>

        <!-- Upload Form -->
        <Card>
          <CardContent class="pt-6 space-y-4">
            <div>
              <label class="text-sm font-medium mb-2 block">Title *</label>
              <Input v-model="form.title" placeholder="Document title" />
            </div>

            <div>
              <label class="text-sm font-medium mb-2 block">Category *</label>
              <select v-model="form.category" class="w-full p-2 border rounded">
                <option value="bylaws">Bylaws</option>
                <option value="financials">Financials</option>
                <option value="meeting_minutes">Meeting Minutes</option>
                <option value="notices">Notices</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium mb-2 block">Status *</label>
              <select v-model="form.status" class="w-full p-2 border rounded">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div v-if="subfolders.length > 0">
              <label class="text-sm font-medium mb-2 block">Folder</label>
              <select v-model="form.folder" class="w-full p-2 border rounded">
                <option value="">{{ organization?.name }} (Root)</option>
                <option v-for="folder in subfolders" :key="folder.id" :value="folder.id">
                  {{ folder.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="text-sm font-medium mb-2 block">File *</label>
              <input
                type="file"
                @change="handleFileChange"
                class="w-full p-2 border rounded"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
              />
              <p class="text-xs text-stone-500 mt-1">
                Accepted: PDF, Word, Excel
              </p>
            </div>

            <Button @click="handleSubmit" :disabled="loading" class="w-full">
              {{ loading ? "Uploading..." : "Upload Document" }}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
