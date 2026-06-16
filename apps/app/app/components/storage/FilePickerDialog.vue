<script setup lang="ts">
/**
 * FilePickerDialog — the universal "attach an existing file" picker.
 *
 * Drop it anywhere an approved user attaches files (chat, email, comments).
 * Three lanes, gated by the caller's access tier (resolved server-side):
 *   • Library     — browse the org's shared files (only if permitted)
 *   • My uploads  — files the current user uploaded (always available)
 *   • Upload      — add a new file, routed to the right subfolder via `source`
 *
 * Emits `select` with the chosen file(s) (id + metadata + asset url).
 */
import { toast } from "vue-sonner";
import { useStorageFormat } from "#core/app/composables/useStorageFormat";
import type { StorageAccess, StorageFile, StorageFolder, StorageSource, PickedFile } from "#core/app/composables/useOrgStorage";

const props = withDefaults(
  defineProps<{
    open: boolean;
    multiple?: boolean;
    /** "image" restricts to images; "all" allows everything. */
    accept?: "all" | "image";
    /** Routes new uploads into the matching standard subfolder. */
    source?: StorageSource;
    title?: string;
  }>(),
  { multiple: false, accept: "all", title: "Add a file" }
);

const emit = defineEmits<{
  "update:open": [boolean];
  select: [files: PickedFile[]];
}>();

const storage = useOrgStorage();
const { formatFileSize, fileKind, isImage, iconForKind, colorForKind, fileLabel } = useStorageFormat();

const access = ref<StorageAccess | null>(null);
const rootId = ref<string | null>(null);
const ready = ref(false);
const loading = ref(false);
const busy = ref(false);

const tab = ref<"library" | "mine" | "upload">("mine");
const search = ref("");

const folders = ref<StorageFolder[]>([]);
const files = ref<StorageFile[]>([]);
const breadcrumb = ref<{ id: string; name: string }[]>([]);
const currentFolderId = ref<string | null>(null);

const picked = ref<Map<string, StorageFile>>(new Map());
const uploadInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

const acceptAttr = computed(() => (props.accept === "image" ? "image/*" : undefined));

function matchesAccept(f: StorageFile) {
  return props.accept === "image" ? isImage(f.type) : true;
}
const visibleFiles = computed(() => files.value.filter(matchesAccept));

async function init() {
  loading.value = true;
  ready.value = false;
  try {
    const res = await storage.ensure();
    access.value = res.access;
    rootId.value = res.rootId;
    tab.value = res.access.canBrowseLibrary ? "library" : "mine";
    ready.value = true;
    await loadTab();
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Could not open files");
  } finally {
    loading.value = false;
  }
}

async function loadTab() {
  if (tab.value === "upload") return;
  loading.value = true;
  try {
    if (tab.value === "mine") {
      const res = await storage.list({ scope: "mine", search: search.value.trim() || undefined });
      files.value = res.files || [];
      folders.value = [];
      breadcrumb.value = [];
    } else {
      const res = await storage.list({
        folderId: currentFolderId.value,
        scope: "library",
        search: search.value.trim() || undefined,
      });
      if (res.mode === "folder") {
        currentFolderId.value = res.folderId || rootId.value;
        folders.value = res.folders || [];
        files.value = res.files || [];
        breadcrumb.value = res.breadcrumb || [];
      }
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Could not load files");
  } finally {
    loading.value = false;
  }
}

watch(() => props.open, (open) => {
  if (open) {
    picked.value = new Map();
    search.value = "";
    currentFolderId.value = null;
    init();
  }
});

watch(tab, () => {
  search.value = "";
  if (tab.value === "library" && !currentFolderId.value) currentFolderId.value = rootId.value;
  loadTab();
});

let t: any;
watch(search, () => {
  clearTimeout(t);
  t = setTimeout(loadTab, 250);
});

function openFolder(f: StorageFolder) {
  currentFolderId.value = f.id;
  loadTab();
}
function goCrumb(id: string) {
  currentFolderId.value = id;
  loadTab();
}

function toggle(f: StorageFile) {
  const next = new Map(picked.value);
  if (next.has(f.id)) next.delete(f.id);
  else {
    if (!props.multiple) next.clear();
    next.set(f.id, f);
  }
  picked.value = next;
}
function isPicked(id: string) {
  return picked.value.has(id);
}

function toPicked(f: StorageFile): PickedFile {
  return {
    id: f.id,
    title: fileLabel(f),
    filename_download: f.filename_download,
    type: f.type,
    filesize: f.filesize,
    url: storage.getUrl(f.id) || "",
  };
}

function confirm() {
  if (!picked.value.size) return;
  emit("select", [...picked.value.values()].map(toPicked));
  emit("update:open", false);
}

// ---- upload lane ----
function pickFiles() {
  uploadInput.value?.click();
}
async function onChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) await doUpload(Array.from(input.files));
  input.value = "";
}
async function onDrop(e: DragEvent) {
  dragOver.value = false;
  const list = e.dataTransfer?.files;
  if (list?.length) await doUpload(Array.from(list));
}
async function doUpload(list: File[]) {
  busy.value = true;
  const uploaded: PickedFile[] = [];
  const id = toast.loading(`Uploading 0/${list.length}…`);
  try {
    let n = 0;
    for (const f of list) {
      const res: any = await storage.upload(f, { source: props.source, title: f.name });
      uploaded.push(
        toPicked({
          id: res.id,
          title: res.title || f.name,
          filename_download: res.filename_download || f.name,
          type: res.type || f.type,
          filesize: res.filesize ?? f.size,
        } as StorageFile)
      );
      n++;
      toast.loading(`Uploading ${n}/${list.length}…`, { id });
    }
    toast.success(`Uploaded ${n} file${n === 1 ? "" : "s"}`, { id });
    // Auto-attach freshly uploaded files.
    if (!props.multiple) {
      emit("select", uploaded.slice(0, 1));
      emit("update:open", false);
    } else {
      emit("select", uploaded);
      emit("update:open", false);
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Upload failed", { id });
  } finally {
    busy.value = false;
  }
}

function thumbUrl(f: StorageFile, size = 160) {
  return storage.getUrl(f.id, { width: size, height: size, fit: "cover", quality: 80 }) || "";
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>Attach a file from your organization, or upload a new one.</DialogDescription>
      </DialogHeader>

      <!-- tabs -->
      <div class="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        <button
          v-if="access?.canBrowseLibrary"
          class="flex-1 rounded-md px-3 py-1.5 font-medium transition"
          :class="tab === 'library' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="tab = 'library'"
        >Library</button>
        <button
          class="flex-1 rounded-md px-3 py-1.5 font-medium transition"
          :class="tab === 'mine' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="tab = 'mine'"
        >My uploads</button>
        <button
          class="flex-1 rounded-md px-3 py-1.5 font-medium transition"
          :class="tab === 'upload' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="tab = 'upload'"
        >Upload</button>
      </div>

      <!-- search + breadcrumb (browse lanes) -->
      <div v-if="tab !== 'upload'" class="space-y-2">
        <div class="relative">
          <Icon name="lucide:search" class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="Search files" class="h-9 pl-8" />
        </div>
        <nav v-if="tab === 'library' && breadcrumb.length" class="flex items-center gap-1 text-xs text-muted-foreground">
          <template v-for="(c, i) in breadcrumb" :key="c.id">
            <Icon v-if="i > 0" name="lucide:chevron-right" class="h-3 w-3 opacity-50" />
            <button class="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground" @click="goCrumb(c.id)">{{ i === 0 ? "Files" : c.name }}</button>
          </template>
        </nav>
      </div>

      <!-- body -->
      <div class="min-h-[18rem]">
        <!-- upload lane -->
        <div
          v-if="tab === 'upload'"
          class="grid h-72 place-items-center rounded-xl border-2 border-dashed transition"
          :class="dragOver ? 'border-primary bg-primary/5' : 'border-border'"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <div class="text-center">
            <Icon name="lucide:upload-cloud" class="mx-auto h-12 w-12 text-muted-foreground" />
            <p class="mt-3 text-sm font-medium">Drag & drop a file here</p>
            <p class="text-xs text-muted-foreground">or</p>
            <Button size="sm" class="mt-2" :disabled="busy" @click="pickFiles">
              <Icon v-if="busy" name="lucide:loader-2" class="mr-1.5 h-4 w-4 animate-spin" />
              Choose file{{ multiple ? "s" : "" }}
            </Button>
            <input ref="uploadInput" type="file" :multiple="multiple" :accept="acceptAttr" class="hidden" @change="onChosen" />
          </div>
        </div>

        <!-- browse lanes -->
        <template v-else>
          <div v-if="loading" class="grid h-72 place-items-center text-muted-foreground">
            <Icon name="lucide:loader-2" class="h-7 w-7 animate-spin" />
          </div>
          <div v-else-if="!folders.length && !visibleFiles.length" class="grid h-72 place-items-center text-center text-sm text-muted-foreground">
            <div>
              <Icon name="lucide:folder-open" class="mx-auto h-10 w-10 opacity-50" />
              <p class="mt-2">{{ search ? "No matches" : "Nothing here yet" }}</p>
            </div>
          </div>
          <div v-else class="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3 md:grid-cols-4">
            <!-- folders (library only) -->
            <button
              v-for="folder in folders"
              :key="'f-' + folder.id"
              class="flex flex-col items-center gap-1.5 rounded-xl border border-transparent p-3 text-center transition hover:border-border hover:bg-muted/60"
              @click="openFolder(folder)"
            >
              <Icon name="lucide:folder" class="h-10 w-10 text-amber-400" />
              <span class="line-clamp-2 text-xs font-medium">{{ folder.name }}</span>
            </button>
            <!-- files -->
            <button
              v-for="file in visibleFiles"
              :key="file.id"
              class="relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition hover:bg-muted/40"
              :class="isPicked(file.id) ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border'"
              @click="toggle(file)"
              @dblclick="!multiple && (toggle(file), confirm())"
            >
              <div class="grid h-16 w-full place-items-center overflow-hidden rounded-lg bg-muted/50">
                <img v-if="isImage(file.type)" :src="thumbUrl(file)" :alt="fileLabel(file)" class="h-full w-full object-cover" loading="lazy" />
                <Icon v-else :name="iconForKind(fileKind(file.type, file.filename_download))" class="h-7 w-7" :class="colorForKind(fileKind(file.type, file.filename_download))" />
              </div>
              <span class="line-clamp-2 text-xs font-medium">{{ fileLabel(file) }}</span>
              <span class="text-[11px] text-muted-foreground">{{ formatFileSize(file.filesize) }}</span>
              <span
                v-if="isPicked(file.id)"
                class="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
              ><Icon name="lucide:check" class="h-3 w-3" /></span>
            </button>
          </div>
        </template>
      </div>

      <DialogFooter v-if="tab !== 'upload'" class="items-center sm:justify-between">
        <span class="text-sm text-muted-foreground">{{ picked.size }} selected</span>
        <div class="flex gap-2">
          <Button variant="ghost" @click="emit('update:open', false)">Cancel</Button>
          <Button :disabled="!picked.size" @click="confirm">
            Attach{{ picked.size > 1 ? ` ${picked.size}` : "" }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
