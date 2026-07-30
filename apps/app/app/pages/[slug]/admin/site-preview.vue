<script setup lang="ts">
// Admin-only live-preview host for the landing builder. Renders the REAL public
// landing (OrgPublicLanding) from an in-progress draft pushed over postMessage by
// the builder's Preview iframe. Because theming is global on <html>, running the
// preview in its own document (this route, in an iframe) keeps the forced
// classic/modern theme isolated from the admin chrome. Never persists anything.
definePageMeta({ middleware: ["admin"], layout: "auth-blank" });

const route = useRoute();
const slug = computed(() => route.params.slug as string);
const { forceThemeStyle } = useTheme();

// Theme is forced via the iframe URL (?theme=classic|modern|luxury) so the
// preview renders in the selected theme deterministically on load — the builder
// reloads this frame with the new ?theme when the toggle changes, which is far
// more reliable than depending on a postMessage arriving. (The draft still
// arrives over postMessage; only the theme is URL-driven.)
if (route.query.theme) forceThemeStyle(String(route.query.theme) as any);

const previewOrg = ref<any>(null);

const { data: loaded } = await useAsyncData(`site-preview-${slug.value}`, () =>
  $fetch(`/api/hoa/find?slug=${slug.value}`)
);
if (loaded.value) previewOrg.value = structuredClone(toRaw(loaded.value));

// Apply a draft payload from the builder onto the cloned org (reactive → the
// landing re-renders). Only the fields the builder edits are overridden.
function applyDraft(p: any) {
  const org = previewOrg.value;
  if (!org || !p) return;
  org.settings = org.settings || {};
  if (p.theme) {
    org.settings.theme = p.theme;
    forceThemeStyle(p.theme);
  }
  if (typeof p.description === "string") org.settings.description = p.description;
  if (p.landing) org.settings.landing = p.landing;
  if (p.hero) {
    org.hero = {
      ...(org.hero || {}),
      title: p.hero.title || null,
      subtitle: p.hero.subtitle || null,
      background_image: p.hero.bgId ? { id: p.hero.bgId } : null,
      foreground_image: p.hero.fgId ? { id: p.hero.fgId } : null,
    };
  }
  if (typeof p.phone === "string") org.phone = p.phone || null;
  if (typeof p.email === "string") org.email = p.email || null;
  if (typeof p.type === "string") org.type = p.type || null;
  if (typeof p.show_board === "boolean") org.show_board = p.show_board;
  if (Array.isArray(p.amenities)) {
    org.amenities = p.amenities
      .filter((a: any) => a && a.title)
      .map((a: any, i: number) => ({
        id: a.id || `preview-${i}`,
        title: a.title,
        icon: a.icon || null,
        description: a.description || null,
        sort: i,
      }));
  }
  // Reassign so downstream computeds (cfg) definitely re-run.
  previewOrg.value = { ...org };
}

function onMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "landing-preview") applyDraft(e.data.payload);
}

onMounted(() => {
  window.addEventListener("message", onMessage);
  // Tell the builder we're ready to receive the initial draft.
  window.parent?.postMessage({ type: "landing-preview-ready" }, window.location.origin);
});
onBeforeUnmount(() => window.removeEventListener("message", onMessage));

useSeoMeta({ title: "Site preview", robots: "noindex" });
</script>

<template>
  <div>
    <OrgPublicLanding
      v-if="previewOrg"
      :organization="previewOrg"
      :slug="slug"
      :preview="true"
    />
    <div v-else class="min-h-screen flex items-center justify-center t-text-muted">
      <Icon name="lucide:loader-circle" class="w-6 h-6 animate-spin" />
    </div>
  </div>
</template>
