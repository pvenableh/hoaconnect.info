<script setup lang="ts">
import { toast } from "vue-sonner";
import { useDropZone } from "@vueuse/core";

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
const route = useRoute();

const orgId = computed(() => selectedOrgId.value);
const organization = computed(() => currentOrg.value?.organization || null);
const orgFolder = computed(() => organization.value?.folder || null);
const subfolders = ref<any[]>([]);

// Get folder ID from query params
const parentFolderId = computed(() => route.query.folderId as string || "");

// Load subfolders when organization folder is available
watch(orgFolder, async (newFolder) => {
  if (newFolder) {
    // Set default folder to org folder if not already set
    if (!form.folder) {
      form.folder = newFolder;
    }
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

// Set the folder from query params
watch(parentFolderId, (newFolderId) => {
  if (newFolderId && !form.folder) {
    form.folder = newFolderId;
  }
}, { immediate: true });

const loading = ref(false);

// Drag and drop setup
const dropZoneRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => {
    if (files && files.length > 0) {
      form.file = files[0];
      if (!form.title) {
        form.title = files[0].name.replace(/\.[^/.]+$/, "");
      }
      toast.success(`File "${files[0].name}" ready to upload`);
    }
  },
});

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    form.file = target.files[0];
    if (!form.title) {
      form.title = target.files[0].name.replace(/\.[^/.]+$/, "");
    }
    toast.success(`File "${target.files[0].name}" ready to upload`);
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
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
      folder: selectedFolder || null,
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

            <div v-if="orgFolder">
              <label class="text-sm font-medium mb-2 block">Folder *</label>
              <select v-model="form.folder" class="w-full p-2 border rounded">
                <option :value="orgFolder">{{ organization?.name }} (Root)</option>
                <option v-for="folder in subfolders" :key="folder.id" :value="folder.id">
                  {{ folder.name }}
                </option>
              </select>
            </div>

            <!-- Dropbox-style drag-and-drop zone -->
            <div>
              <label class="text-sm font-medium mb-2 block">File *</label>
              <div
                ref="dropZoneRef"
                class="relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50"
                :class="{
                  'border-blue-500 bg-blue-50': isOverDropZone,
                  'border-stone-300 bg-stone-50': !isOverDropZone,
                }"
                @click="triggerFileInput"
              >
                <div class="flex flex-col items-center gap-3">
                  <!-- Upload Icon -->
                  <div
                    class="w-16 h-16 rounded-full flex items-center justify-center transition-colors"
                    :class="{
                      'bg-blue-100': isOverDropZone,
                      'bg-stone-200': !isOverDropZone,
                    }"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-8 w-8"
                      :class="{
                        'text-blue-600': isOverDropZone,
                        'text-stone-600': !isOverDropZone,
                      }"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>

                  <!-- Text -->
                  <div>
                    <p class="text-lg font-medium text-stone-700">
                      {{ isOverDropZone ? 'Drop your file here' : 'Drag and drop your file here' }}
                    </p>
                    <p class="text-sm text-stone-500 mt-1">
                      or click to browse
                    </p>
                  </div>

                  <!-- File info if selected -->
                  <div v-if="form.file" class="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div class="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span class="text-sm font-medium text-green-700">
                        {{ form.file.name }}
                      </span>
                      <span class="text-xs text-green-600">
                        ({{ (form.file.size / 1024 / 1024).toFixed(2) }} MB)
                      </span>
                    </div>
                  </div>

                  <!-- Accepted formats -->
                  <p class="text-xs text-stone-400 mt-2">
                    Accepted: PDF, Word, Excel
                  </p>
                </div>

                <!-- Hidden file input -->
                <input
                  ref="fileInputRef"
                  type="file"
                  @change="handleFileChange"
                  class="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                />
              </div>
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
