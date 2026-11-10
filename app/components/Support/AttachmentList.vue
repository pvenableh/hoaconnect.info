<script setup lang="ts">
// A support message's attachments. Every link goes through
// /api/support/attachments/:messageId/:fileId, which checks the viewer may see
// the message; raster images show as thumbnails, everything else downloads.
import { INLINE_ATTACHMENT_TYPES, formatBytes } from "#core/shared/support/attachments";

defineProps<{ attachments?: Array<{ id: string; name: string; type: string; size: number; url: string }> }>();
</script>

<template>
  <ul v-if="attachments?.length" class="mt-3 flex flex-wrap gap-2">
    <li v-for="a in attachments" :key="a.id">
      <a
        v-if="INLINE_ATTACHMENT_TYPES.has(a.type)"
        :href="a.url"
        target="_blank"
        rel="noopener"
        class="block overflow-hidden rounded-lg border border-[var(--theme-border-primary)]"
        :title="`${a.name} · ${formatBytes(a.size)}`"
      >
        <img :src="a.url" :alt="a.name" loading="lazy" class="h-24 w-32 object-cover" />
      </a>
      <a
        v-else
        :href="a.url"
        :download="a.name"
        class="flex items-center gap-1.5 rounded-full border border-[var(--theme-border-primary)] px-3 py-1 type-micro t-text hover:underline"
      >
        <Icon :name="a.type === 'application/pdf' || a.type.startsWith('text/') ? 'lucide:file-text' : 'lucide:file'" class="size-3.5 t-text-muted" />
        <span class="max-w-[14rem] truncate">{{ a.name }}</span>
        <span class="t-text-muted">{{ formatBytes(a.size) }}</span>
      </a>
    </li>
  </ul>
</template>
