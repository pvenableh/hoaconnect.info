<script setup lang="ts">
/**
 * ChannelAttachments — renders a channel message's file attachments.
 * Images show as thumbnails (click to open); other files as download chips.
 * Fetches metadata for the given file ids in one request.
 */
import { useStorageFormat } from "#core/app/composables/useStorageFormat";

const props = defineProps<{ ids?: string[] | null }>();

const { getUrl } = useDirectusFiles();
const { formatFileSize, fileKind, isImage, iconForKind, colorForKind, fileLabel } = useStorageFormat();

interface Meta {
  id: string;
  title?: string | null;
  filename_download?: string;
  type?: string | null;
  filesize?: number | null;
}
const files = ref<Meta[]>([]);

const idList = computed(() => (Array.isArray(props.ids) ? props.ids.filter(Boolean) : []));

async function load() {
  if (!idList.value.length) {
    files.value = [];
    return;
  }
  try {
    const res = await $fetch<Meta[]>("/api/directus/files", {
      method: "POST",
      body: {
        operation: "list",
        query: {
          filter: { id: { _in: idList.value } },
          fields: ["id", "title", "filename_download", "type", "filesize"],
          limit: idList.value.length,
        },
      },
    });
    // Preserve original order.
    const byId = new Map((res || []).map((f) => [f.id, f]));
    files.value = idList.value.map((id) => byId.get(id)).filter(Boolean) as Meta[];
  } catch {
    files.value = [];
  }
}

watch(idList, load, { immediate: true });

const thumb = (id: string) => getUrl(id, { width: 240, height: 240, fit: "cover", quality: 80 }) || "";
const open = (id: string) => getUrl(id) || "";
const download = (id: string) => `${getUrl(id)}?download`;
</script>

<template>
  <div v-if="files.length" class="mt-2 flex flex-wrap gap-2">
    <template v-for="file in files" :key="file.id">
      <!-- image -->
      <a
        v-if="isImage(file.type)"
        :href="open(file.id)"
        target="_blank"
        rel="noopener"
        class="block overflow-hidden rounded-lg border bg-muted/40 transition hover:opacity-90"
      >
        <img :src="thumb(file.id)" :alt="fileLabel(file)" class="h-28 w-28 object-cover" loading="lazy" />
      </a>
      <!-- file chip -->
      <a
        v-else
        :href="download(file.id)"
        target="_blank"
        rel="noopener"
        class="inline-flex max-w-[16rem] items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 transition hover:bg-muted"
      >
        <Icon
          :name="iconForKind(fileKind(file.type, file.filename_download))"
          class="h-5 w-5 shrink-0"
          :class="colorForKind(fileKind(file.type, file.filename_download))"
        />
        <span class="min-w-0">
          <span class="block truncate text-xs font-medium">{{ fileLabel(file) }}</span>
          <span class="block text-[11px] text-muted-foreground">{{ formatFileSize(file.filesize) }}</span>
        </span>
        <Icon name="lucide:download" class="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    </template>
  </div>
</template>
