<script setup lang="ts">
/**
 * StorageManagerPage — the org's Dropbox-style file manager.
 *
 * Admin tool for browsing and organizing the organization's storage: folder
 * navigation with breadcrumbs, grid/list views, drag-and-drop upload, create /
 * rename / move / delete for folders and files, a Quick-Look style preview
 * drawer, and the per-org browse-access ("Sharing") control.
 *
 * All data flows through useOrgStorage → the org-scoped, permission-checked
 * /api/org/storage/* routes (never the raw global file routes).
 */
import { toast } from "vue-sonner";
import { useStorageFormat } from "#core/app/composables/useStorageFormat";
import type {
  StorageAccess,
  StorageFile,
  StorageFolder,
  StorageMeter,
  OptimizeResult,
} from "#core/app/composables/useOrgStorage";

type ViewMode = "grid" | "list";

const storage = useOrgStorage();
const { formatFileSize, fileKind, isImage, iconForKind, colorForKind, fileLabel } =
  useStorageFormat();

const loading = ref(true);
const busy = ref(false);
const viewMode = ref<ViewMode>("grid");
const search = ref("");

const rootId = ref<string | null>(null);
const access = ref<StorageAccess | null>(null);
const map = ref<Record<string, string>>({});

const currentFolderId = ref<string | null>(null);
const isRoot = ref(true);
const breadcrumb = ref<{ id: string; name: string }[]>([]);
const folders = ref<StorageFolder[]>([]);
const files = ref<StorageFile[]>([]);

const selected = ref<Set<string>>(new Set()); // file ids
const dragOver = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);

// dialogs
const showNewFolder = ref(false);
const newFolderName = ref("");
const renameTarget = ref<{ type: "folder" | "file"; id: string; name: string } | null>(null);
const renameValue = ref("");
const deleteTarget = ref<{ type: "folder" | "file"; id: string; name: string } | null>(null);
const moveTarget = ref<{ type: "folder" | "file"; id: string; name: string } | null>(null);
const showSharing = ref(false);

// preview drawer
const previewFile = ref<StorageFile | null>(null);

const canManage = computed(() => !!access.value?.canManage);

// ---- data loading ----
async function init() {
  loading.value = true;
  try {
    const res = await storage.ensure();
    rootId.value = res.rootId;
    access.value = res.access;
    map.value = res.map;
    currentFolderId.value = res.rootId;
    await load(res.rootId);
    loadMeter();
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || "Could not open storage");
  } finally {
    loading.value = false;
  }
}

async function load(folderId: string | null) {
  const res = await storage.list({
    folderId,
    scope: "library",
    search: search.value.trim() || undefined,
  });
  if (res.mode !== "folder") return;
  currentFolderId.value = res.folderId || rootId.value;
  isRoot.value = !!res.isRoot;
  breadcrumb.value = res.breadcrumb || [];
  folders.value = res.folders || [];
  files.value = res.files || [];
  selected.value = new Set();
}

async function reload() {
  if (currentFolderId.value) await load(currentFolderId.value);
}

let searchTimer: any;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reload, 250);
});

onMounted(init);

// ---- navigation ----
function openFolder(f: StorageFolder) {
  search.value = "";
  load(f.id);
}
function goCrumb(id: string) {
  search.value = "";
  load(id);
}

// ---- selection ----
function toggleSelect(id: string) {
  const next = new Set(selected.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selected.value = next;
}
function clearSelection() {
  selected.value = new Set();
}

// ---- upload ----
function pickFiles() {
  uploadInput.value?.click();
}
async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) await uploadFiles(Array.from(input.files));
  input.value = "";
}
async function onDrop(e: DragEvent) {
  dragOver.value = false;
  if (!canManage.value) return;
  const list = e.dataTransfer?.files;
  if (list?.length) await uploadFiles(Array.from(list));
}
async function uploadFiles(fileList: File[]) {
  if (!currentFolderId.value) return;
  busy.value = true;
  let done = 0;
  const total = fileList.length;
  const id = toast.loading(`Uploading 0/${total}…`);
  try {
    for (const f of fileList) {
      await storage.upload(f, { folderId: currentFolderId.value, title: f.name });
      done++;
      toast.loading(`Uploading ${done}/${total}…`, { id });
    }
    toast.success(`Uploaded ${done} file${done === 1 ? "" : "s"}`, { id });
    await reload();
    loadMeter();
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || "Upload failed", { id });
  } finally {
    busy.value = false;
  }
}

// ---- folder/file mutations ----
async function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  busy.value = true;
  try {
    await storage.createFolder(name, currentFolderId.value);
    showNewFolder.value = false;
    newFolderName.value = "";
    await reload();
    toast.success("Folder created");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Could not create folder");
  } finally {
    busy.value = false;
  }
}

function startRename(type: "folder" | "file", id: string, name: string) {
  renameTarget.value = { type, id, name };
  renameValue.value = name;
}
async function confirmRename() {
  if (!renameTarget.value) return;
  const name = renameValue.value.trim();
  if (!name) return;
  busy.value = true;
  try {
    if (renameTarget.value.type === "folder") await storage.renameFolder(renameTarget.value.id, name);
    else await storage.renameFile(renameTarget.value.id, name);
    renameTarget.value = null;
    await reload();
    toast.success("Renamed");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Rename failed");
  } finally {
    busy.value = false;
  }
}

function startDelete(type: "folder" | "file", id: string, name: string) {
  deleteTarget.value = { type, id, name };
}
// File delete. Folder deletes go through confirmDeleteFolder (keep vs contents).
async function confirmDelete() {
  if (!deleteTarget.value || deleteTarget.value.type !== "file") return;
  busy.value = true;
  try {
    await storage.deleteFile(deleteTarget.value.id);
    if (previewFile.value?.id === deleteTarget.value.id) previewFile.value = null;
    deleteTarget.value = null;
    await reload();
    loadMeter();
    toast.success("Deleted");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Delete failed");
  } finally {
    busy.value = false;
  }
}

// Folder delete — "keep" reparents contents up a level; "contents" deletes all.
async function confirmDeleteFolder(mode: "keep" | "contents") {
  if (!deleteTarget.value || deleteTarget.value.type !== "folder") return;
  busy.value = true;
  try {
    await storage.deleteFolder(deleteTarget.value.id, mode);
    deleteTarget.value = null;
    await reload();
    loadMeter();
    toast.success(mode === "contents" ? "Folder & contents deleted" : "Folder deleted");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Delete failed");
  } finally {
    busy.value = false;
  }
}

async function bulkDelete() {
  const ids = [...selected.value];
  if (!ids.length) return;
  busy.value = true;
  try {
    for (const id of ids) await storage.deleteFile(id);
    clearSelection();
    await reload();
    loadMeter();
    toast.success(`Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}`);
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Delete failed");
  } finally {
    busy.value = false;
  }
}

// ---- move (mini folder navigator) ----
const moveNav = ref<{ id: string; name: string; folders: StorageFolder[]; crumb: { id: string; name: string }[] } | null>(null);
function startMove(type: "folder" | "file", id: string, name: string) {
  moveTarget.value = { type, id, name };
  loadMoveNav(rootId.value!);
}
async function loadMoveNav(folderId: string) {
  const res = await storage.list({ folderId, scope: "library" });
  if (res.mode !== "folder") return;
  moveNav.value = {
    id: res.folderId || folderId,
    name: res.breadcrumb?.at(-1)?.name || "Files",
    folders: res.folders || [],
    crumb: res.breadcrumb || [],
  };
}
async function confirmMove() {
  if (!moveTarget.value || !moveNav.value) return;
  busy.value = true;
  try {
    if (moveTarget.value.type === "folder") await storage.moveFolder(moveTarget.value.id, moveNav.value.id);
    else await storage.moveFile(moveTarget.value.id, moveNav.value.id);
    moveTarget.value = null;
    moveNav.value = null;
    await reload();
    toast.success("Moved");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Move failed");
  } finally {
    busy.value = false;
  }
}

// ---- sharing setting ----
const browseAccess = ref<StorageAccess["browseAccess"]>("admins_board");
watch(showSharing, (open) => {
  if (open && access.value) browseAccess.value = access.value.browseAccess;
});
async function saveSharing() {
  busy.value = true;
  try {
    await storage.setBrowseAccess(browseAccess.value);
    if (access.value) access.value.browseAccess = browseAccess.value;
    showSharing.value = false;
    toast.success("Sharing updated");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Could not update sharing");
  } finally {
    busy.value = false;
  }
}

// ---- preview ----
function openFile(f: StorageFile) {
  previewFile.value = f;
}
function downloadUrl(f: StorageFile) {
  return `${storage.getUrl(f.id)}?download`;
}
function thumbUrl(f: StorageFile, size = 320) {
  return storage.getUrl(f.id, { width: size, height: size, fit: "cover", quality: 80 }) || "";
}

const SHARING_OPTIONS: { value: StorageAccess["browseAccess"]; label: string; hint: string }[] = [
  { value: "admins_board", label: "Admins & board", hint: "Admins and active board members can browse the library." },
  { value: "all_members", label: "All members", hint: "Any member can browse every file in the library." },
  { value: "admins_only", label: "Admins only", hint: "Only administrators can browse the library." },
];

function relativeDate(d?: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---- storage meter ----
const { public: { directusUrl } } = useRuntimeConfig();
const meter = ref<StorageMeter | null>(null);
async function loadMeter(recompute = false) {
  try {
    meter.value = await storage.getMeter(recompute);
  } catch {
    /* meter is best-effort — never block the manager on it */
  }
}
const storagePct = computed(() => {
  const m = meter.value;
  if (!m || m.limitBytes == null || m.limitBytes === 0) return 0;
  return Math.min(100, Math.round((m.usedBytes / m.limitBytes) * 100));
});
const meterBarClass = computed(() =>
  storagePct.value >= 90
    ? "bg-destructive"
    : storagePct.value >= 75
      ? "bg-amber-500"
      : "bg-primary"
);

// ---- copy link ----
const copiedId = ref<string | null>(null);
async function copyLink(file: StorageFile) {
  const url = `${directusUrl}/assets/${file.id}`;
  try {
    await navigator.clipboard.writeText(url);
    copiedId.value = file.id;
    setTimeout(() => {
      if (copiedId.value === file.id) copiedId.value = null;
    }, 1600);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy link");
  }
}

// ---- optimize (single file, in place) ----
const OPTIMIZABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/avif",
]);
function isOptimizable(file: StorageFile) {
  return !!file.type && OPTIMIZABLE_TYPES.has(file.type.toLowerCase());
}
const optimizeTarget = ref<StorageFile | null>(null);
const optimizeBusy = ref(false);
const optimizeResult = ref<OptimizeResult | null>(null);
function startOptimize(file: StorageFile) {
  optimizeTarget.value = file;
  optimizeResult.value = null;
}
async function runOptimize(format: "auto" | "webp") {
  if (!optimizeTarget.value) return;
  optimizeBusy.value = true;
  try {
    const res = await storage.optimizeFile(optimizeTarget.value.id, format);
    optimizeResult.value = res;
    if (res.optimized) {
      toast.success(`Saved ${formatFileSize(Math.max(0, res.before - res.after))}`);
      await reload();
      loadMeter();
    } else {
      toast.info("Already optimized — no smaller version.");
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Optimize failed");
  } finally {
    optimizeBusy.value = false;
  }
}

// ---- library optimize sweep ----
const showSweep = ref(false);
const sweepBusy = ref(false);
const sweepDone = ref(false);
const sweepProcessed = ref(0);
const sweepReclaimed = ref(0);
async function runSweep() {
  sweepBusy.value = true;
  sweepDone.value = false;
  sweepProcessed.value = 0;
  sweepReclaimed.value = 0;
  try {
    let offset = 0;
    // Loop the one-batch endpoint until it reports done (guarded).
    for (let guard = 0; guard < 2000; guard++) {
      const res = await storage.optimizeSweep(offset, 5);
      sweepProcessed.value += res.processed;
      sweepReclaimed.value += res.reclaimedBytes;
      offset = res.nextOffset;
      if (res.done || res.processed === 0) break;
    }
    sweepDone.value = true;
    await reload();
    loadMeter();
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || "Sweep failed");
  } finally {
    sweepBusy.value = false;
  }
}

// ---- on-demand folder size ----
// value: undefined = not loaded, null = loading, number = bytes
const folderSizes = ref<Record<string, number | null>>({});
async function loadFolderSize(id: string) {
  folderSizes.value = { ...folderSizes.value, [id]: null };
  try {
    const res = await storage.folderSize(id);
    folderSizes.value = { ...folderSizes.value, [id]: res.bytes };
  } catch {
    const next = { ...folderSizes.value };
    delete next[id];
    folderSizes.value = next;
    toast.error("Could not size folder");
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
    <!-- Header -->
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Files</h1>
        <p class="text-sm text-muted-foreground">
          Your organization's shared storage.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <Icon name="lucide:search" class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="Search this folder" class="h-9 w-44 pl-8 sm:w-56" />
        </div>
        <div class="flex items-center rounded-lg border bg-background p-0.5">
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md transition"
            :class="viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
            title="Grid view"
            @click="viewMode = 'grid'"
          >
            <Icon name="lucide:layout-grid" class="h-4 w-4" />
          </button>
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md transition"
            :class="viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
            title="List view"
            @click="viewMode = 'list'"
          >
            <Icon name="lucide:list" class="h-4 w-4" />
          </button>
        </div>
        <Button v-if="canManage" variant="outline" size="sm" class="h-9" @click="showSweep = true">
          <Icon name="lucide:sparkles" class="mr-1.5 h-4 w-4" /> Optimize
        </Button>
        <Button v-if="canManage" variant="outline" size="sm" class="h-9" @click="showSharing = true">
          <Icon name="lucide:users" class="mr-1.5 h-4 w-4" /> Sharing
        </Button>
        <Button v-if="canManage" variant="outline" size="sm" class="h-9" @click="showNewFolder = true">
          <Icon name="lucide:folder-plus" class="mr-1.5 h-4 w-4" /> New folder
        </Button>
        <Button v-if="canManage" size="sm" class="h-9" @click="pickFiles">
          <Icon name="lucide:upload" class="mr-1.5 h-4 w-4" /> Upload
        </Button>
        <input ref="uploadInput" type="file" multiple class="hidden" @change="onFilesChosen" />
      </div>
    </div>

    <!-- Breadcrumb -->
    <nav class="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
      <template v-for="(crumb, i) in breadcrumb" :key="crumb.id">
        <Icon v-if="i > 0" name="lucide:chevron-right" class="h-3.5 w-3.5 opacity-50" />
        <button
          class="rounded px-1.5 py-0.5 transition hover:bg-muted hover:text-foreground"
          :class="i === breadcrumb.length - 1 ? 'font-medium text-foreground' : ''"
          @click="goCrumb(crumb.id)"
        >
          {{ i === 0 ? "Files" : crumb.name }}
        </button>
      </template>
    </nav>

    <!-- Storage meter -->
    <div v-if="meter" class="mb-3 rounded-xl border bg-background/60 px-3.5 py-2.5">
      <div class="flex items-center justify-between text-xs">
        <span class="font-medium text-foreground">Storage</span>
        <span class="text-muted-foreground">
          <template v-if="meter.limitBytes == null">
            {{ formatFileSize(meter.usedBytes) }} used · Unlimited
          </template>
          <template v-else>
            {{ formatFileSize(meter.usedBytes) }} of {{ formatFileSize(meter.limitBytes) }}
            ({{ storagePct }}%)
          </template>
        </span>
      </div>
      <div v-if="meter.limitBytes != null" class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-all"
          :class="meterBarClass"
          :style="{ width: Math.max(2, storagePct) + '%' }"
        />
      </div>
      <p
        v-if="meter.limitBytes != null && storagePct >= 90"
        class="mt-1.5 text-xs text-destructive"
      >
        You're almost out of storage. Delete or optimize files, or add more storage in Settings → Subscription.
      </p>
    </div>

    <!-- Main panel -->
    <div
      class="glass-surface relative min-h-[60vh] rounded-2xl p-4 transition"
      :class="dragOver ? 'ring-2 ring-primary/60' : ''"
      @dragover.prevent="canManage && (dragOver = true)"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- drag overlay -->
      <div
        v-if="dragOver"
        class="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 text-primary"
      >
        <Icon name="lucide:upload-cloud" class="h-10 w-10" />
        <p class="mt-2 text-sm font-medium">Drop files to upload here</p>
      </div>

      <!-- loading -->
      <div v-if="loading" class="grid place-items-center py-24 text-muted-foreground">
        <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin" />
      </div>

      <!-- empty -->
      <div
        v-else-if="!folders.length && !files.length"
        class="grid place-items-center py-24 text-center"
      >
        <div class="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
          <Icon name="lucide:folder-open" class="h-8 w-8 text-muted-foreground" />
        </div>
        <p class="mt-4 font-medium">{{ search ? "No matches" : "This folder is empty" }}</p>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ search ? "Try a different search." : canManage ? "Upload files or create a folder to get started." : "Nothing here yet." }}
        </p>
        <Button v-if="canManage && !search" size="sm" class="mt-4" @click="pickFiles">
          <Icon name="lucide:upload" class="mr-1.5 h-4 w-4" /> Upload files
        </Button>
      </div>

      <!-- GRID -->
      <div
        v-else-if="viewMode === 'grid'"
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        <!-- folders -->
        <div
          v-for="folder in folders"
          :key="'f-' + folder.id"
          class="group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-transparent p-3 text-center transition hover:border-border hover:bg-muted/60"
          @dblclick="openFolder(folder)"
          @click="openFolder(folder)"
        >
          <Icon name="lucide:folder" class="h-12 w-12 text-amber-400" />
          <span class="line-clamp-2 w-full break-words text-xs font-medium">{{ folder.name }}</span>
          <div v-if="canManage" class="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100" @click.stop>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button class="grid h-7 w-7 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground">
                  <Icon name="lucide:ellipsis" class="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openFolder(folder)"><Icon name="lucide:folder-open" class="mr-2 h-4 w-4" />Open</DropdownMenuItem>
                <DropdownMenuItem @select="startRename('folder', folder.id, folder.name)"><Icon name="lucide:pencil" class="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                <DropdownMenuItem @select="startMove('folder', folder.id, folder.name)"><Icon name="lucide:folder-input" class="mr-2 h-4 w-4" />Move</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" @select="startDelete('folder', folder.id, folder.name)"><Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <!-- files -->
        <div
          v-for="file in files"
          :key="file.id"
          class="group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center transition hover:bg-muted/40"
          :class="selected.has(file.id) ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border'"
          @click="openFile(file)"
        >
          <div class="grid h-20 w-full place-items-center overflow-hidden rounded-lg bg-muted/50">
            <img v-if="isImage(file.type)" :src="thumbUrl(file)" :alt="fileLabel(file)" class="h-full w-full object-cover" loading="lazy" />
            <Icon v-else :name="iconForKind(fileKind(file.type, file.filename_download))" class="h-9 w-9" :class="colorForKind(fileKind(file.type, file.filename_download))" />
          </div>
          <span class="line-clamp-2 w-full break-words text-xs font-medium">{{ fileLabel(file) }}</span>
          <span class="text-[11px] text-muted-foreground">{{ formatFileSize(file.filesize) }}</span>

          <!-- select checkbox -->
          <button
            class="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border bg-background/90 transition"
            :class="selected.has(file.id) ? 'border-primary bg-primary text-primary-foreground opacity-100' : 'text-transparent opacity-0 group-hover:opacity-100'"
            @click.stop="toggleSelect(file.id)"
          >
            <Icon name="lucide:check" class="h-3 w-3" />
          </button>

          <div class="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100" @click.stop>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button class="grid h-7 w-7 place-items-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground">
                  <Icon name="lucide:ellipsis" class="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openFile(file)"><Icon name="lucide:eye" class="mr-2 h-4 w-4" />Preview</DropdownMenuItem>
                <DropdownMenuItem as-child><a :href="downloadUrl(file)" target="_blank" rel="noopener"><Icon name="lucide:download" class="mr-2 h-4 w-4" />Download</a></DropdownMenuItem>
                <DropdownMenuItem @select="copyLink(file)"><Icon name="lucide:link" class="mr-2 h-4 w-4" />Copy link</DropdownMenuItem>
                <template v-if="canManage">
                  <DropdownMenuItem v-if="isOptimizable(file)" @select="startOptimize(file)"><Icon name="lucide:sparkles" class="mr-2 h-4 w-4" />Optimize</DropdownMenuItem>
                  <DropdownMenuItem @select="startRename('file', file.id, fileLabel(file))"><Icon name="lucide:pencil" class="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                  <DropdownMenuItem @select="startMove('file', file.id, fileLabel(file))"><Icon name="lucide:folder-input" class="mr-2 h-4 w-4" />Move</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive" @select="startDelete('file', file.id, fileLabel(file))"><Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <!-- LIST -->
      <div v-else class="overflow-hidden rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="hidden px-3 py-2 font-medium sm:table-cell">Size</th>
              <th class="hidden px-3 py-2 font-medium md:table-cell">Modified</th>
              <th class="w-10 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr
              v-for="folder in folders"
              :key="'lf-' + folder.id"
              class="cursor-pointer transition hover:bg-muted/40"
              @click="openFolder(folder)"
            >
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:folder" class="h-5 w-5 text-amber-400" />
                  <span class="font-medium">{{ folder.name }}</span>
                </div>
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground sm:table-cell" @click.stop>
                <span v-if="folderSizes[folder.id] === null" class="inline-flex items-center gap-1 text-xs">
                  <Icon name="lucide:loader-2" class="h-3 w-3 animate-spin" /> Sizing…
                </span>
                <span v-else-if="typeof folderSizes[folder.id] === 'number'">{{ formatFileSize(folderSizes[folder.id]!) }}</span>
                <button
                  v-else
                  class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  @click="loadFolderSize(folder.id)"
                >
                  Size
                </button>
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground md:table-cell">—</td>
              <td class="px-3 py-2 text-right" @click.stop>
                <DropdownMenu v-if="canManage">
                  <DropdownMenuTrigger as-child>
                    <button class="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Icon name="lucide:ellipsis" class="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="startRename('folder', folder.id, folder.name)"><Icon name="lucide:pencil" class="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                    <DropdownMenuItem @select="startMove('folder', folder.id, folder.name)"><Icon name="lucide:folder-input" class="mr-2 h-4 w-4" />Move</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem class="text-destructive" @select="startDelete('folder', folder.id, folder.name)"><Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
            <tr
              v-for="file in files"
              :key="'lfi-' + file.id"
              class="cursor-pointer transition hover:bg-muted/40"
              :class="selected.has(file.id) ? 'bg-primary/5' : ''"
              @click="openFile(file)"
            >
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <img v-if="isImage(file.type)" :src="thumbUrl(file, 64)" class="h-7 w-7 rounded object-cover" loading="lazy" />
                  <Icon v-else :name="iconForKind(fileKind(file.type, file.filename_download))" class="h-5 w-5" :class="colorForKind(fileKind(file.type, file.filename_download))" />
                  <span class="font-medium">{{ fileLabel(file) }}</span>
                </div>
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground sm:table-cell">{{ formatFileSize(file.filesize) }}</td>
              <td class="hidden px-3 py-2 text-muted-foreground md:table-cell">{{ relativeDate(file.modified_on || file.uploaded_on) }}</td>
              <td class="px-3 py-2 text-right" @click.stop>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <button class="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Icon name="lucide:ellipsis" class="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="openFile(file)"><Icon name="lucide:eye" class="mr-2 h-4 w-4" />Preview</DropdownMenuItem>
                    <DropdownMenuItem as-child><a :href="downloadUrl(file)" target="_blank" rel="noopener"><Icon name="lucide:download" class="mr-2 h-4 w-4" />Download</a></DropdownMenuItem>
                    <DropdownMenuItem @select="copyLink(file)"><Icon name="lucide:link" class="mr-2 h-4 w-4" />Copy link</DropdownMenuItem>
                    <template v-if="canManage">
                      <DropdownMenuItem v-if="isOptimizable(file)" @select="startOptimize(file)"><Icon name="lucide:sparkles" class="mr-2 h-4 w-4" />Optimize</DropdownMenuItem>
                      <DropdownMenuItem @select="startRename('file', file.id, fileLabel(file))"><Icon name="lucide:pencil" class="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                      <DropdownMenuItem @select="startMove('file', file.id, fileLabel(file))"><Icon name="lucide:folder-input" class="mr-2 h-4 w-4" />Move</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem class="text-destructive" @select="startDelete('file', file.id, fileLabel(file))"><Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                    </template>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- bulk action bar -->
    <Transition name="fade">
      <div
        v-if="selected.size"
        class="glass-surface glass-surface--strong fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 shadow-lg"
      >
        <span class="text-sm font-medium">{{ selected.size }} selected</span>
        <Button v-if="canManage" variant="destructive" size="sm" class="h-8" @click="bulkDelete">
          <Icon name="lucide:trash-2" class="mr-1.5 h-4 w-4" /> Delete
        </Button>
        <Button variant="ghost" size="sm" class="h-8" @click="clearSelection">Clear</Button>
      </div>
    </Transition>

    <!-- New folder dialog -->
    <Dialog v-model:open="showNewFolder">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Create a folder in the current location.</DialogDescription>
        </DialogHeader>
        <Input v-model="newFolderName" placeholder="Folder name" autofocus @keyup.enter="createFolder" />
        <DialogFooter>
          <Button variant="ghost" @click="showNewFolder = false">Cancel</Button>
          <Button :disabled="busy || !newFolderName.trim()" @click="createFolder">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Rename dialog -->
    <Dialog :open="!!renameTarget" @update:open="(v) => !v && (renameTarget = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {{ renameTarget?.type }}</DialogTitle>
        </DialogHeader>
        <Input v-model="renameValue" autofocus @keyup.enter="confirmRename" />
        <DialogFooter>
          <Button variant="ghost" @click="renameTarget = null">Cancel</Button>
          <Button :disabled="busy || !renameValue.trim()" @click="confirmRename">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete confirm -->
    <Dialog :open="!!deleteTarget" @update:open="(v) => !v && (deleteTarget = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {{ deleteTarget?.type }}?</DialogTitle>
          <DialogDescription>
            <template v-if="deleteTarget?.type === 'folder'">
              What should happen to the contents of “{{ deleteTarget?.name }}”?
            </template>
            <template v-else>
              “{{ deleteTarget?.name }}” will be permanently deleted. This cannot be undone.
            </template>
          </DialogDescription>
        </DialogHeader>

        <!-- Folder: keep-or-delete choice -->
        <div v-if="deleteTarget?.type === 'folder'" class="space-y-2">
          <button
            class="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/40 disabled:opacity-50"
            :disabled="busy"
            @click="confirmDeleteFolder('keep')"
          >
            <Icon name="lucide:folder-up" class="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p class="text-sm font-medium">Keep the files</p>
              <p class="text-xs text-muted-foreground">Move everything inside up one level, then delete the empty folder.</p>
            </div>
          </button>
          <button
            class="flex w-full items-start gap-3 rounded-xl border border-destructive/30 p-3 text-left transition hover:bg-destructive/5 disabled:opacity-50"
            :disabled="busy"
            @click="confirmDeleteFolder('contents')"
          >
            <Icon name="lucide:trash-2" class="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p class="text-sm font-medium text-destructive">Delete everything</p>
              <p class="text-xs text-muted-foreground">Permanently delete the folder and all files and subfolders inside it. This cannot be undone.</p>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="deleteTarget = null">Cancel</Button>
          <Button
            v-if="deleteTarget?.type === 'file'"
            variant="destructive"
            :disabled="busy"
            @click="confirmDelete"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Optimize file dialog -->
    <Dialog :open="!!optimizeTarget" @update:open="(v) => !v && (optimizeTarget = null, optimizeResult = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Optimize image</DialogTitle>
          <DialogDescription>
            Shrink “{{ optimizeTarget ? fileLabel(optimizeTarget) : '' }}” in place — the file keeps the same link.
          </DialogDescription>
        </DialogHeader>

        <div v-if="!optimizeResult" class="space-y-2">
          <button
            class="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/40 disabled:opacity-50"
            :disabled="optimizeBusy"
            @click="runOptimize('auto')"
          >
            <Icon name="lucide:mail-check" class="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p class="text-sm font-medium">Optimize for web &amp; email</p>
              <p class="text-xs text-muted-foreground">Re-encodes to JPEG/PNG — safe everywhere, including Outlook and Gmail. Recommended.</p>
            </div>
          </button>
          <button
            class="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/40 disabled:opacity-50"
            :disabled="optimizeBusy"
            @click="runOptimize('webp')"
          >
            <Icon name="lucide:image" class="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p class="text-sm font-medium">Optimize as WebP (smaller)</p>
              <p class="text-xs text-amber-600">Smaller files, but WebP doesn't display in Outlook or Gmail email.</p>
            </div>
          </button>
          <p v-if="optimizeBusy" class="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" /> Optimizing…
          </p>
        </div>

        <div v-else class="rounded-xl border bg-muted/30 p-4 text-center">
          <template v-if="optimizeResult.optimized">
            <p class="text-sm font-medium text-green-600">
              Saved {{ formatFileSize(Math.max(0, optimizeResult.before - optimizeResult.after)) }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ formatFileSize(optimizeResult.before) }} → {{ formatFileSize(optimizeResult.after) }}
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">Already optimized — no smaller version available.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="optimizeTarget = null; optimizeResult = null">
            {{ optimizeResult ? "Done" : "Cancel" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Library optimize sweep dialog -->
    <Dialog v-model:open="showSweep">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Optimize the library</DialogTitle>
          <DialogDescription>
            Re-encode every image in this organization's storage to an email-safe, web-optimized size (JPEG/PNG). Files are shrunk in place, so all existing links keep working.
          </DialogDescription>
        </DialogHeader>

        <div v-if="sweepBusy || sweepDone" class="rounded-xl border bg-muted/30 p-4 text-center">
          <p v-if="sweepBusy" class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            Optimizing… {{ sweepProcessed }} processed
          </p>
          <template v-else>
            <p class="text-sm font-medium text-green-600">
              Reclaimed {{ formatFileSize(sweepReclaimed) }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ sweepProcessed }} image{{ sweepProcessed === 1 ? "" : "s" }} checked.
            </p>
          </template>
        </div>

        <DialogFooter>
          <Button variant="ghost" :disabled="sweepBusy" @click="showSweep = false">
            {{ sweepDone ? "Close" : "Cancel" }}
          </Button>
          <Button v-if="!sweepDone" :disabled="sweepBusy" @click="runSweep">
            <Icon name="lucide:sparkles" class="mr-1.5 h-4 w-4" /> Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Move dialog -->
    <Dialog :open="!!moveTarget" @update:open="(v) => !v && (moveTarget = null, moveNav = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move “{{ moveTarget?.name }}”</DialogTitle>
          <DialogDescription>Choose a destination folder.</DialogDescription>
        </DialogHeader>
        <div v-if="moveNav" class="rounded-xl border">
          <div class="flex items-center gap-1 border-b px-3 py-2 text-xs text-muted-foreground">
            <template v-for="(c, i) in moveNav.crumb" :key="c.id">
              <Icon v-if="i > 0" name="lucide:chevron-right" class="h-3 w-3 opacity-50" />
              <button class="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground" @click="loadMoveNav(c.id)">
                {{ i === 0 ? "Files" : c.name }}
              </button>
            </template>
          </div>
          <div class="max-h-60 overflow-y-auto p-1">
            <p v-if="!moveNav.folders.length" class="px-3 py-6 text-center text-sm text-muted-foreground">No subfolders here.</p>
            <button
              v-for="folder in moveNav.folders"
              :key="folder.id"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted"
              :disabled="folder.id === moveTarget?.id"
              :class="folder.id === moveTarget?.id ? 'cursor-not-allowed opacity-40' : ''"
              @click="loadMoveNav(folder.id)"
            >
              <Icon name="lucide:folder" class="h-4 w-4 text-amber-400" />
              {{ folder.name }}
              <Icon name="lucide:chevron-right" class="ml-auto h-4 w-4 opacity-40" />
            </button>
          </div>
        </div>
        <DialogFooter class="items-center sm:justify-between">
          <span class="text-sm text-muted-foreground">
            Destination: <span class="font-medium text-foreground">{{ moveNav?.crumb?.at(-1)?.name === undefined ? 'Files' : (moveNav?.crumb?.length === 1 ? 'Files' : moveNav?.crumb?.at(-1)?.name) }}</span>
          </span>
          <div class="flex gap-2">
            <Button variant="ghost" @click="moveTarget = null; moveNav = null">Cancel</Button>
            <Button :disabled="busy || moveNav?.id === moveTarget?.id" @click="confirmMove">Move here</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Sharing dialog -->
    <Dialog v-model:open="showSharing">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Library sharing</DialogTitle>
          <DialogDescription>Choose who can browse the organization's file library. Members can always see files they uploaded themselves.</DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <label
            v-for="opt in SHARING_OPTIONS"
            :key="opt.value"
            class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition hover:bg-muted/40"
            :class="browseAccess === opt.value ? 'border-primary ring-1 ring-primary' : ''"
          >
            <input v-model="browseAccess" type="radio" :value="opt.value" class="mt-1" />
            <div>
              <p class="text-sm font-medium">{{ opt.label }}</p>
              <p class="text-xs text-muted-foreground">{{ opt.hint }}</p>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" @click="showSharing = false">Cancel</Button>
          <Button :disabled="busy" @click="saveSharing">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Preview drawer -->
    <Sheet :open="!!previewFile" @update:open="(v) => !v && (previewFile = null)">
      <SheetContent side="right" class="w-full sm:max-w-md">
        <template v-if="previewFile">
          <SheetHeader>
            <SheetTitle class="truncate pr-6">{{ fileLabel(previewFile) }}</SheetTitle>
          </SheetHeader>
          <div class="mt-4 grid place-items-center overflow-hidden rounded-xl bg-muted/50 p-2">
            <img
              v-if="isImage(previewFile.type)"
              :src="thumbUrl(previewFile, 640)"
              :alt="fileLabel(previewFile)"
              class="max-h-72 w-full rounded-lg object-contain"
            />
            <div v-else class="grid h-44 w-full place-items-center">
              <Icon :name="iconForKind(fileKind(previewFile.type, previewFile.filename_download))" class="h-16 w-16" :class="colorForKind(fileKind(previewFile.type, previewFile.filename_download))" />
            </div>
          </div>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-muted-foreground">Type</dt><dd class="font-medium">{{ previewFile.type || "—" }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">Size</dt><dd class="font-medium">{{ formatFileSize(previewFile.filesize) }}</dd></div>
            <div v-if="previewFile.width" class="flex justify-between"><dt class="text-muted-foreground">Dimensions</dt><dd class="font-medium">{{ previewFile.width }}×{{ previewFile.height }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted-foreground">Uploaded</dt><dd class="font-medium">{{ relativeDate(previewFile.uploaded_on) }}</dd></div>
          </dl>
          <div class="mt-5 flex flex-wrap gap-2">
            <Button as-child variant="outline" size="sm">
              <a :href="downloadUrl(previewFile)" target="_blank" rel="noopener"><Icon name="lucide:download" class="mr-1.5 h-4 w-4" />Download</a>
            </Button>
            <Button variant="outline" size="sm" @click="copyLink(previewFile)">
              <Icon :name="copiedId === previewFile.id ? 'lucide:check' : 'lucide:link'" class="mr-1.5 h-4 w-4" />
              {{ copiedId === previewFile.id ? "Copied" : "Copy link" }}
            </Button>
            <template v-if="canManage">
              <Button v-if="isOptimizable(previewFile)" variant="outline" size="sm" @click="startOptimize(previewFile)"><Icon name="lucide:sparkles" class="mr-1.5 h-4 w-4" />Optimize</Button>
              <Button variant="outline" size="sm" @click="startRename('file', previewFile.id, fileLabel(previewFile))"><Icon name="lucide:pencil" class="mr-1.5 h-4 w-4" />Rename</Button>
              <Button variant="outline" size="sm" @click="startMove('file', previewFile.id, fileLabel(previewFile))"><Icon name="lucide:folder-input" class="mr-1.5 h-4 w-4" />Move</Button>
              <Button variant="destructive" size="sm" @click="startDelete('file', previewFile.id, fileLabel(previewFile))"><Icon name="lucide:trash-2" class="mr-1.5 h-4 w-4" />Delete</Button>
            </template>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
