<script setup lang="ts">
// Rich link-preview card for URLs in a channel message. Fetches Open Graph
// metadata via /api/link-preview (auth-gated + SSRF-guarded) on mount and
// renders a themed card; silently renders nothing if the URL has no usable
// preview. Ported from Earnest, restyled to HOA Connect's t-* theme tokens.
const props = defineProps<{ url: string }>();

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const preview = ref<Preview | null>(null);
const failed = ref(false);

onMounted(async () => {
  try {
    const data = await $fetch<Preview>("/api/link-preview", { params: { url: props.url } });
    if (data?.title || data?.description || data?.image) preview.value = data;
    else failed.value = true;
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <a
    v-if="preview && !failed"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    class="ios-card mt-2 flex gap-3 max-w-[480px] rounded-xl t-bg-subtle p-2.5 no-underline hover:t-bg transition-colors overflow-hidden"
  >
    <img
      v-if="preview.image"
      :src="preview.image"
      :alt="preview.title || ''"
      class="w-20 h-16 object-cover rounded-lg shrink-0"
      loading="lazy"
    />
    <div class="flex flex-col gap-0.5 min-w-0">
      <span
        v-if="preview.siteName"
        class="text-[9px] font-bold uppercase tracking-wider t-text-muted truncate"
      >
        {{ preview.siteName }}
      </span>
      <span v-if="preview.title" class="text-[13px] font-semibold t-text truncate">
        {{ preview.title }}
      </span>
      <span v-if="preview.description" class="text-[11px] t-text-muted line-clamp-2">
        {{ preview.description }}
      </span>
    </div>
  </a>
</template>
