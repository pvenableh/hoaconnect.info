<script setup lang="ts">
// "Design your site" — the public-site (landing) builder. A palette + drag-drop
// section canvas + live WYSIWYG preview + an AI wizard, all editing the single
// LandingConfig on settings.landing plus the org fields that shape the page
// (hero, theme, amenities). Replaces the old SettingsDomainsPage editor; domains
// stay under Settings → Public site.
import { toast } from "vue-sonner";
import {
  normalizeLandingConfig,
  defaultLandingConfig,
  type LandingConfig,
} from "#core/shared/utils/landing";
import {
  useLandingBuilder,
  LandingBuilderKey,
  type LandingBuilderSite,
} from "#core/app/composables/useLandingBuilder";
import type { AiLandingResult } from "#core/shared/landing/ai";

const route = useRoute();
const { navigateToOrg } = useOrgNavigation();
const config = useRuntimeConfig();
const slug = computed(() => route.params.slug as string);

const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);
const orgItems = useDirectusItems("hoa_organizations");
const settingsItems = useDirectusItems("block_settings");
const heroItems = useDirectusItems("block_hero");
const amenityItems = useDirectusItems("hoa_amenities");
const vendorItems = useDirectusItems("hoa_vendors");
const { upload: uploadFile } = useDirectusFiles();

const org = ref<any>(null);
const loading = ref(true);
const saving = ref(false);

const landing = ref<LandingConfig>(defaultLandingConfig());
const site = reactive<LandingBuilderSite>({
  theme: "classic",
  type: "",
  description: "",
  phone: "",
  email: "",
  show_board: true,
  hero: { title: "", subtitle: "", bgId: null, fgId: null },
  amenities: [],
  removedAmenityIds: [],
  boardMembers: [],
  hasManagementVendor: false,
});

const builder = useLandingBuilder(landing);

// ── Context (provide/inject for the editor tree) ───────────────────────────
const getFileId = (f: any) => (f ? (typeof f === "object" ? f.id : f) : null);
function fileUrl(id: string | null | undefined, key?: string) {
  if (!id) return "";
  const base = `${config.public.directus.url}/assets/${id}`;
  // "small" is a convenience for a builder thumbnail. This Directus has no named
  // transform presets (?key=small → 400), but dynamic transforms are allowed, so
  // map it to a width param that actually resolves.
  if (key === "small") return `${base}?width=400&quality=75`;
  return key ? `${base}?key=${key}` : base;
}
async function uploadImage(file: File, title = "Landing image"): Promise<string | null> {
  const folderId = typeof org.value?.folder === "object" ? org.value?.folder?.id : org.value?.folder;
  const up: any = await uploadFile(file, { title, folder: folderId || undefined });
  return up?.id || null;
}
provide(LandingBuilderKey, { org, landing, site, builder, uploadImage, fileUrl });

// ── UI state ────────────────────────────────────────────────────────────────
const expandedId = ref<string | null>(null);
const showPalette = ref(false);
const showSettings = ref(false);
const showWizard = ref(false);
const previewTheme = ref<string>("classic");

// The serializable draft handed to the preview iframe.
const draft = computed(() => ({
  landing: landing.value,
  description: site.description,
  hero: { ...site.hero },
  phone: site.phone,
  email: site.email,
  type: site.type,
  show_board: site.show_board,
  amenities: site.amenities.map((a) => ({
    id: a.id,
    title: a.title,
    icon: a.icon,
    description: a.description,
  })),
}));

// ── Dirty tracking ───────────────────────────────────────────────────────────
function snapshot() {
  return JSON.stringify({
    landing: landing.value,
    theme: site.theme,
    type: site.type,
    description: site.description,
    phone: site.phone,
    email: site.email,
    show_board: site.show_board,
    hero: site.hero,
    amenities: site.amenities,
    removed: site.removedAmenityIds,
  });
}
const baseline = ref("");
const dirty = computed(() => snapshot() !== baseline.value);

// Hold off the silent background update while this form is dirty — a
// backgrounded client reloads itself, and that must never eat unsaved input.
useUnsavedWork().guardUnsaved(dirty);

// ── Load ──────────────────────────────────────────────────────────────────
const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  try {
    // Load through the server route (service token) — the same source the public
    // page + preview use. A client-side SDK read returns the hero/amenity image
    // relations as null under the user's token, which would wipe those images on
    // save. This returns the full hero/settings/amenities/folder reliably.
    const o: any = await $fetch("/api/hoa/find", { query: { slug: slug.value } });
    org.value = o;

    site.theme = (o.settings?.theme as any) || "classic";
    site.type = (o.type as any) || "";
    site.description = o.settings?.description || "";
    site.phone = o.phone || "";
    site.email = o.email || "";
    site.show_board = o.show_board !== false;
    site.hero = {
      title: o.hero?.title || "",
      subtitle: o.hero?.subtitle || "",
      bgId: getFileId(o.hero?.background_image),
      fgId: getFileId(o.hero?.foreground_image),
    };
    site.amenities = (o.amenities || []).map((a: any) => ({
      id: a.id,
      title: a.title || "",
      icon: a.icon || "",
      description: a.description || "",
    }));
    site.removedAmenityIds = [];

    landing.value = normalizeLandingConfig(o.settings?.landing);
    if (landing.value.blocks.some((b) => b.type === "location")) builder.ensureLocation();
    if (landing.value.blocks.some((b) => b.type === "gallery")) builder.ensureGallery();

    previewTheme.value = ["classic", "modern", "luxury"].includes(site.theme) ? site.theme : "classic";

    // Active management vendor? Gates the PM landing options.
    try {
      const mgmt = await vendorItems.list({
        filter: {
          organization: { _eq: orgId.value },
          category: { _eq: "management" },
          status: { _eq: "active" },
        },
        fields: ["id"],
        limit: 1,
      });
      site.hasManagementVendor = (mgmt?.length || 0) > 0;
    } catch {
      site.hasManagementVendor = false;
    }

    // Board members for the inquiry recipient picker (best-effort).
    try {
      const res: any = await $fetch("/api/hoa/board-members", { query: { slug: slug.value } });
      site.boardMembers = (res?.boardMembers || [])
        .map((b: any) => ({
          id: b.id,
          name: [b.hoa_member?.first_name, b.hoa_member?.last_name].filter(Boolean).join(" "),
          email: b.hoa_member?.email || "",
        }))
        .filter((b: any) => b.email);
    } catch {
      site.boardMembers = [];
    }

    await nextTick();
    baseline.value = snapshot();
  } catch (e: any) {
    toast.error(e.message || "Failed to load your site");
  } finally {
    loading.value = false;
  }
};
watch(orgId, load, { immediate: true });

// ── Save ──────────────────────────────────────────────────────────────────
const ensureSettingsId = async (): Promise<string> => {
  if (org.value?.settings?.id) return org.value.settings.id;
  const created: any = await settingsItems.create({ organization: orgId.value, status: "published" } as any);
  await orgItems.update(orgId.value!, { settings: created.id } as any);
  org.value.settings = { ...(org.value.settings || {}), id: created.id };
  return created.id;
};

const save = async () => {
  if (!orgId.value) return;
  saving.value = true;
  try {
    // Hero (images already uploaded to ids via the image fields).
    const heroData: any = {
      title: site.hero.title || null,
      subtitle: site.hero.subtitle || null,
      background_image: site.hero.bgId,
      foreground_image: site.hero.fgId,
      status: "published",
    };
    if (org.value?.hero?.id) {
      await heroItems.update(org.value.hero.id, heroData);
    } else {
      const nh: any = await heroItems.create(heroData);
      await orgItems.update(orgId.value, { hero: nh.id } as any);
      org.value.hero = { ...heroData, id: nh.id };
    }

    const settingsId = await ensureSettingsId();
    await settingsItems.update(settingsId, {
      theme: site.theme,
      description: site.description || null,
      landing: landing.value,
    } as any);
    org.value.settings = {
      ...(org.value.settings || { id: settingsId }),
      theme: site.theme,
      description: site.description,
      landing: landing.value,
    };

    await orgItems.update(orgId.value, {
      type: site.type || null,
      phone: site.phone || null,
      email: site.email || null,
      show_board: site.show_board,
    } as any);

    // Amenities: upsert + delete removed.
    for (const a of site.amenities) {
      if (!a.title.trim()) continue;
      const payload = {
        title: a.title.trim(),
        icon: a.icon.trim() || null,
        description: a.description.trim() || null,
      };
      if (a.id) await amenityItems.update(a.id, payload as any);
      else {
        const created: any = await amenityItems.create({
          ...payload,
          organization: orgId.value,
          status: "published",
        } as any);
        a.id = created?.id;
      }
    }
    for (const id of site.removedAmenityIds) {
      try {
        await amenityItems.remove(id);
      } catch {
        /* ignore */
      }
    }
    site.removedAmenityIds = [];

    baseline.value = snapshot();
    toast.success("Your site is saved");
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to save");
  } finally {
    saving.value = false;
  }
};

// ── Canvas + AI handlers ───────────────────────────────────────────────────
function onAdded(id: string) {
  expandedId.value = id;
}
function onReset() {
  if (!window.confirm("Reset to the default section layout? This replaces your current sections. Your saved page isn't changed until you press Save.")) return;
  builder.resetToDefault();
  expandedId.value = null;
}
function onApplyAi(result: AiLandingResult) {
  if (result.hero?.title) site.hero.title = result.hero.title;
  if (result.hero?.subtitle) site.hero.subtitle = result.hero.subtitle;
  if (result.about) site.description = result.about;
  builder.populateFromAI(result);
  expandedId.value = null;
  toast.success("AI draft applied — refine it, then Save");
}

// Warn before navigating away with unsaved changes.
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm("You have unsaved changes. Leave without saving?")) return false;
});

useSeoMeta({ title: "Design your site" });
</script>

<template>
  <div class="min-h-screen t-bg t-text">
    <PageContainer class="space-y-5">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" class="mb-2 -ml-2" @click="navigateToOrg('/admin/settings/organization')">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" /> Settings
          </Button>
          <h1 class="text-2xl font-semibold t-text flex items-center gap-2">
            Design your site
            <span v-if="dirty" class="w-2 h-2 rounded-full bg-warning" title="Unsaved changes" />
          </h1>
          <p class="text-sm t-text-muted mt-0.5">
            Build your community's public landing page — add sections, drag to reorder, and watch it
            update live.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="showWizard = true">
            <Icon name="lucide:sparkles" class="w-4 h-4 mr-1.5" /> Generate with AI
          </Button>
          <Button variant="outline" size="sm" @click="showSettings = true">
            <Icon name="lucide:settings-2" class="w-4 h-4 mr-1.5" /> Site settings
          </Button>
          <Button as="a" :href="`/${slug}`" target="_blank" rel="noopener" variant="ghost" size="sm">
            <Icon name="lucide:external-link" class="w-4 h-4 mr-1.5" /> View
          </Button>
          <Button size="sm" class="rounded-full" :disabled="saving || !dirty" @click="save">
            <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            <Icon v-else name="lucide:check" class="w-4 h-4 mr-1.5" />
            Save
          </Button>
        </div>
      </div>

      <div v-if="loading" class="flex justify-center py-16"><div class="spinner-ios" /></div>

      <div v-else class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] gap-6 items-start">
        <!-- Builder -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold t-text">Sections</h2>
            <div class="flex items-center gap-2">
              <Button
                v-if="!builder.isEmpty.value"
                variant="ghost"
                size="sm"
                class="t-text-muted"
                title="Restore the default section layout"
                @click="onReset"
              >
                <Icon name="lucide:rotate-ccw" class="w-4 h-4 mr-1.5" /> Reset
              </Button>
              <Button variant="outline" size="sm" @click="showPalette = true">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add section
              </Button>
            </div>
          </div>
          <LandingBuilderHeroCard />
          <LandingBuilderCanvas
            :blocks="landing.blocks"
            v-model:expanded-id="expandedId"
            @remove="builder.removeBlock($event)"
            @move="builder.moveBlock($event.id, $event.direction)"
            @duplicate="builder.duplicateBlock($event)"
            @reorder="builder.setOrder($event)"
          />
        </div>

        <!-- Preview -->
        <div class="xl:sticky xl:top-4 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs t-text-muted">Preview as</span>
            <div class="inline-flex rounded-lg border t-border p-0.5">
              <button
                v-for="t in (['classic', 'modern'] as const)"
                :key="t"
                type="button"
                class="px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                :class="previewTheme === t ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
                @click="previewTheme = t"
              >
                {{ t }}
              </button>
            </div>
          </div>
          <LandingBuilderPreview :slug="slug" :draft="draft" :theme="previewTheme" style="height: calc(100vh - 8rem)" />
        </div>
      </div>
    </PageContainer>

    <!-- Dialogs -->
    <LandingBuilderPalette v-model:open="showPalette" @added="onAdded" />
    <LandingBuilderSiteSettings v-model:open="showSettings" />
    <LandingBuilderAiWizard
      v-model:open="showWizard"
      :org-id="orgId"
      :has-content="!builder.isEmpty.value"
      @apply="onApplyAi"
    />
  </div>
</template>
