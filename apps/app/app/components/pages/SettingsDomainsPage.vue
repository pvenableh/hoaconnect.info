<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  normalizeLandingConfig,
  defaultLandingConfig,
  LANDING_WIDGET_REGISTRY,
  BUILTIN_BLOCK_TYPES,
  CONTENT_LAYOUTS,
  FEATURE_STYLES,
  newBlockId,
  type LandingConfig,
  type LandingWidgetKey,
  type ListingType,
  type LandingBlock,
  type LandingBlockType,
  type FeatureStyle,
} from "#core/shared/utils/landing";

const route = useRoute();
const { navigateToOrg } = useOrgNavigation();
const config = useRuntimeConfig();
const mainDomain = computed(() => (config.public.mainDomain as string) || "app.hoaconnect.info");
const slug = computed(() => route.params.slug as string);

const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);
const orgItems = useDirectusItems("hoa_organizations");
const settingsItems = useDirectusItems("block_settings");
const heroItems = useDirectusItems("block_hero");
const amenityItems = useDirectusItems("hoa_amenities");
const vendorItems = useDirectusItems("hoa_vendors");
const { upload: uploadFile } = useDirectusFiles();

// Whether the org has an active management vendor (gates the PM landing options).
const hasManagementVendor = ref(false);

const org = ref<any>(null);
const loading = ref(true);
const activeTab = ref("sections");

const WIDGET_DEFS = LANDING_WIDGET_REGISTRY;
const widgetLabel = (k: LandingWidgetKey) => WIDGET_DEFS.find((w) => w.key === k);

// ---- Editable state ----
const content = reactive({
  heroTitle: "",
  heroSubtitle: "",
  theme: "classic" as "classic" | "modern" | "luxury",
  type: "" as "" | "residential" | "commercial",
  description: "",
  phone: "",
  email: "",
  show_board: true,
});
const heroBgFile = ref<File | null>(null);
const heroFgFile = ref<File | null>(null);
const heroBgPreview = ref<string | null>(null);
const heroFgPreview = ref<string | null>(null);
const removedHeroBg = ref(false);
const removedHeroFg = ref(false);

interface AmenityRow {
  id?: string;
  title: string;
  icon: string;
  description: string;
}
const amenities = ref<AmenityRow[]>([]);
const removedAmenityIds = ref<string[]>([]);

const landing = ref<LandingConfig>(defaultLandingConfig());
const boardMembers = ref<{ id: string; name: string; email: string }[]>([]);

const getFileId = (f: any) => (f ? (typeof f === "object" ? f.id : f) : null);
const fileUrl = (id: string | null) =>
  id ? `${config.public.directus.url}/assets/${id}?key=small` : null;

// Live hero preview sources (pending upload preview → existing file).
const heroPreviewBg = computed(
  () => heroBgPreview.value || fileUrl(getFileId(org.value?.hero?.background_image))
);
const heroPreviewFg = computed(
  () => heroFgPreview.value || fileUrl(getFileId(org.value?.hero?.foreground_image))
);

// Basic landing insights (hoa_organizations.landing_stats).
const stats = computed(() => {
  const s = (org.value?.landing_stats && typeof org.value.landing_stats === "object"
    ? org.value.landing_stats
    : {}) as any;
  const views = Number(s.views) || 0;
  const inquiries = Number(s.inquiries) || 0;
  return { views, inquiries, conversion: views ? Math.round((inquiries / views) * 100) : 0 };
});

const THEME_OPTIONS = [
  { value: "classic", label: "Classic", hint: "Cream paper, terracotta, serif" },
  { value: "modern", label: "Modern", hint: "Clean white, cyan, sans-serif" },
  { value: "luxury", label: "Luxury", hint: "Gallery white, brass, refined" },
] as const;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  try {
    const o: any = await orgItems.get(orgId.value, {
      fields: [
        "*",
        {
          settings: ["*"],
          hero: ["*", { background_image: ["id"], foreground_image: ["id"] }],
          amenities: ["id", "title", "icon", "description", "sort"],
        },
      ],
    });
    org.value = o;

    content.heroTitle = o.hero?.title || "";
    content.heroSubtitle = o.hero?.subtitle || "";
    content.theme = (o.settings?.theme as any) || "classic";
    content.type = (o.type as any) || "";
    content.description = o.settings?.description || "";
    content.phone = o.phone || "";
    content.email = o.email || "";
    content.show_board = o.show_board !== false;

    heroBgFile.value = null;
    heroFgFile.value = null;
    heroBgPreview.value = null;
    heroFgPreview.value = null;
    removedHeroBg.value = false;
    removedHeroFg.value = false;

    amenities.value = (o.amenities || []).map((a: any) => ({
      id: a.id,
      title: a.title || "",
      icon: a.icon || "",
      description: a.description || "",
    }));
    removedAmenityIds.value = [];

    landing.value = normalizeLandingConfig(o.settings?.landing);
    // Materialize the single-instance section configs so their editors bind
    // (normalize leaves them null when the org hasn't configured them yet).
    if (landing.value.blocks.some((b) => b.type === "location")) ensureLocation();
    if (landing.value.blocks.some((b) => b.type === "gallery")) ensureGallery();

    externalUrlInput.value = o.external_url || "";
    externalMode.value = !!o.external_url;

    // Does the org have an active management vendor? Gates the PM landing options.
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
      hasManagementVendor.value = (mgmt?.length || 0) > 0;
    } catch {
      hasManagementVendor.value = false;
    }

    // Board members for the inquiry recipient picker (best-effort).
    try {
      const res: any = await $fetch("/api/hoa/board-members", { query: { slug: slug.value } });
      boardMembers.value = (res?.boardMembers || [])
        .map((b: any) => ({
          id: b.id,
          name: [b.hoa_member?.first_name, b.hoa_member?.last_name].filter(Boolean).join(" "),
          email: b.hoa_member?.email || "",
        }))
        .filter((b: any) => b.email);
    } catch {
      boardMembers.value = [];
    }
  } catch (e: any) {
    toast.error(e.message || "Failed to load public site settings");
  } finally {
    loading.value = false;
  }
};
watch(orgId, load, { immediate: true });

// ---------------------------------------------------------------------------
// Helpers: ensure related records exist
// ---------------------------------------------------------------------------
const ensureSettingsId = async (): Promise<string> => {
  if (org.value?.settings?.id) return org.value.settings.id;
  const created: any = await settingsItems.create({
    organization: orgId.value,
    status: "published",
  } as any);
  await orgItems.update(orgId.value!, { settings: created.id } as any);
  org.value.settings = { ...(org.value.settings || {}), id: created.id };
  return created.id;
};

// ---------------------------------------------------------------------------
// Save: Content tab (hero + theme/description + org contact + amenities)
// ---------------------------------------------------------------------------
const savingContent = ref(false);
const onHeroBg = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    heroBgFile.value = f;
    heroBgPreview.value = URL.createObjectURL(f);
    removedHeroBg.value = false;
  }
};
const onHeroFg = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) {
    heroFgFile.value = f;
    heroFgPreview.value = URL.createObjectURL(f);
    removedHeroFg.value = false;
  }
};

const saveContent = async () => {
  if (!orgId.value) return;
  savingContent.value = true;
  try {
    const folderId =
      typeof org.value?.folder === "object" ? org.value?.folder?.id : org.value?.folder;

    let bgId = removedHeroBg.value ? null : getFileId(org.value?.hero?.background_image);
    if (heroBgFile.value) {
      const up: any = await uploadFile(heroBgFile.value, {
        title: `${org.value?.name} Hero Background`,
        folder: folderId || undefined,
      });
      bgId = up?.id || null;
    }
    let fgId = removedHeroFg.value ? null : getFileId(org.value?.hero?.foreground_image);
    if (heroFgFile.value) {
      const up: any = await uploadFile(heroFgFile.value, {
        title: `${org.value?.name} Hero Logo`,
        folder: folderId || undefined,
      });
      fgId = up?.id || null;
    }

    const heroData: any = {
      title: content.heroTitle || null,
      subtitle: content.heroSubtitle || null,
      background_image: bgId,
      foreground_image: fgId,
      status: "published",
    };
    if (org.value?.hero?.id) {
      await heroItems.update(org.value.hero.id, heroData);
    } else {
      const nh: any = await heroItems.create(heroData);
      await orgItems.update(orgId.value, { hero: nh.id } as any);
    }

    const settingsId = await ensureSettingsId();
    await settingsItems.update(settingsId, {
      theme: content.theme,
      description: content.description || null,
      // Persist the property-manager landing flags (they live in landing config).
      landing: landing.value,
    } as any);
    org.value.settings = { ...(org.value.settings || { id: settingsId }), landing: landing.value };

    await orgItems.update(orgId.value, {
      type: content.type || null,
      phone: content.phone || null,
      email: content.email || null,
      show_board: content.show_board,
    } as any);

    // Amenities: upsert + delete removed.
    for (const a of amenities.value) {
      if (!a.title.trim()) continue;
      const payload = {
        title: a.title.trim(),
        icon: a.icon.trim() || null,
        description: a.description.trim() || null,
      };
      if (a.id) await amenityItems.update(a.id, payload as any);
      else
        await amenityItems.create({
          ...payload,
          organization: orgId.value,
          status: "published",
        } as any);
    }
    for (const id of removedAmenityIds.value) {
      try {
        await amenityItems.remove(id);
      } catch {
        /* ignore */
      }
    }

    toast.success("Landing content saved");
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to save content");
  } finally {
    savingContent.value = false;
  }
};

const addAmenity = () => amenities.value.push({ title: "", icon: "lucide:sparkles", description: "" });
const removeAmenity = (i: number) => {
  const a = amenities.value[i];
  if (a.id) removedAmenityIds.value.push(a.id);
  amenities.value.splice(i, 1);
};

// ---------------------------------------------------------------------------
// Save: landing JSON (widgets / listings / inquiry)
// ---------------------------------------------------------------------------
const savingLanding = ref(false);
const saveLanding = async () => {
  if (!orgId.value) return;
  savingLanding.value = true;
  try {
    const settingsId = await ensureSettingsId();
    await settingsItems.update(settingsId, { landing: landing.value } as any);
    org.value.settings = { ...(org.value.settings || { id: settingsId }), landing: landing.value };
    toast.success("Saved");
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to save");
  } finally {
    savingLanding.value = false;
  }
};

// Widgets reorder
const moveWidget = (i: number, dir: -1 | 1) => {
  const j = i + dir;
  const arr = landing.value.widgets;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};

// Location places
const addPlace = () => landing.value.places.items.push({ name: "", walk_time: "", distance: "" });
const removePlace = (i: number) => landing.value.places.items.splice(i, 1);

// Listings
const addListing = () =>
  landing.value.listings.push({ type: "sale" as ListingType, title: "", url: "", price: "", image: null });
const removeListing = (i: number) => landing.value.listings.splice(i, 1);
const onListingImage = async (i: number, e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const folderId =
      typeof org.value?.folder === "object" ? org.value?.folder?.id : org.value?.folder;
    const up: any = await uploadFile(f, { title: `Listing image`, folder: folderId || undefined });
    landing.value.listings[i].image = up?.id || null;
  } catch (e2: any) {
    toast.error("Image upload failed");
  }
};

// FAQ
const addFaq = () => landing.value.faq.push({ question: "", answer: "" });
const removeFaq = (i: number) => landing.value.faq.splice(i, 1);
const moveFaq = (i: number, dir: -1 | 1) => {
  const j = i + dir;
  const arr = landing.value.faq;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};

// ---- Sections (the unified, ordered block list) ----
const BLOCK_META: Record<LandingBlockType, { label: string; icon: string; hint: string }> = {
  about: { label: "About", icon: "lucide:text", hint: "Text lives in the Content tab (Description)." },
  content: { label: "Custom section", icon: "lucide:layout-template", hint: "" },
  amenities: { label: "Amenities", icon: "lucide:sparkles", hint: "Amenities are edited in the Content tab." },
  listings: { label: "Listings", icon: "lucide:home", hint: "Listings are edited in the Listings tab." },
  faq: { label: "FAQ", icon: "lucide:circle-help", hint: "Questions are edited in the FAQ tab." },
  board: { label: "Board", icon: "lucide:users", hint: "Roster lives under Members; toggle visibility here." },
  contact: { label: "Contact", icon: "lucide:mail", hint: "Phone/email are edited in the Content tab." },
  location: { label: "Location", icon: "lucide:map-pin", hint: "" },
  gallery: { label: "Gallery", icon: "lucide:images", hint: "" },
};
const LAYOUT_LABELS: Record<string, string> = {
  "text-image": "Text + image (image right)",
  "image-text": "Image + text (image left)",
  "image-grid": "Image grid",
  stats: "Stat band",
  gallery: "Gallery / marquee",
};

const blockTitle = (b: LandingBlock) =>
  b.type === "content" ? b.title || "Custom section" : BLOCK_META[b.type].label;
const blockSubtitle = (b: LandingBlock) =>
  b.type === "content" ? LAYOUT_LABELS[b.layout || "text-image"] : BLOCK_META[b.type].hint;

const missingBuiltins = computed(() =>
  BUILTIN_BLOCK_TYPES.filter((t) => !landing.value.blocks.some((b) => b.type === t))
);

const addContentBlock = () =>
  landing.value.blocks.push({
    id: newBlockId(),
    type: "content",
    enabled: true,
    layout: "text-image",
    number_label: "",
    category: "",
    eyebrow: "",
    title: "",
    body: "",
    tagline: "",
    images: [],
    stats: [],
    features: [],
    feature_style: "list",
    feature_columns: 2,
    show_in_menu: true,
    menu_icon: "",
  });

const FEATURE_STYLE_LABELS: Record<FeatureStyle, string> = {
  list: "List (icon + text)",
  bullets: "Bullets (dot + text)",
  cards: "Cards (icon + title + text)",
  tiles: "Icon tiles",
};
const addFeature = (b: LandingBlock) => {
  if (!Array.isArray(b.features)) b.features = [];
  b.features.push({ icon: "", title: "", text: "", wide: false });
};
const removeFeature = (b: LandingBlock, idx: number) => b.features?.splice(idx, 1);
const moveFeature = (b: LandingBlock, idx: number, dir: -1 | 1) => {
  const arr = b.features;
  if (!arr) return;
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
};

// Quick-pick icons for a section's menu link (any lucide name also works).
const MENU_ICON_SUGGESTIONS = [
  "lucide:sparkles",
  "lucide:home",
  "lucide:building-2",
  "lucide:image",
  "lucide:map-pin",
  "lucide:scroll-text",
  "lucide:heart",
  "lucide:star",
  "lucide:leaf",
  "lucide:waves",
  "lucide:sun",
  "lucide:key-round",
];
const addBuiltinBlock = (type: LandingBlockType) => {
  if (type === "location") ensureLocation();
  if (type === "gallery") ensureGallery();
  landing.value.blocks.push({ id: `b_${type}`, type, enabled: true });
};

// ---- Location section config (single instance; lives on landing.location) ----
const ensureLocation = () => {
  if (!landing.value.location)
    landing.value.location = {
      heading: "",
      intro: "",
      walk_score: null,
      bike_score: null,
      transit_score: null,
      highlights: [],
      stats: [],
    };
  return landing.value.location;
};
const addLocationHighlight = () =>
  ensureLocation().highlights.push({ name: "", walk_time: "", distance: "" });
const removeLocationHighlight = (i: number) => landing.value.location?.highlights.splice(i, 1);
const addLocationStat = () => ensureLocation().stats.push({ value: "", unit: "", label: "" });
const removeLocationStat = (i: number) => landing.value.location?.stats.splice(i, 1);

// ---- Gallery section config (single instance; lives on landing.gallery) ----
const ensureGallery = () => {
  if (!landing.value.gallery)
    landing.value.gallery = { source: "manual", folder: null, images: [], caption: "" };
  return landing.value.gallery;
};
const onGalleryImage = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const folderId =
      typeof org.value?.folder === "object" ? org.value?.folder?.id : org.value?.folder;
    const up: any = await uploadFile(f, { title: "Gallery image", folder: folderId || undefined });
    if (up?.id) ensureGallery().images.push(up.id);
  } catch {
    toast.error("Image upload failed");
  }
};
const removeGalleryImage = (i: number) => landing.value.gallery?.images.splice(i, 1);
const removeBlock = (i: number) => landing.value.blocks.splice(i, 1);
const moveBlock = (i: number, dir: -1 | 1) => {
  const j = i + dir;
  const arr = landing.value.blocks;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};

const onBlockImage = async (b: LandingBlock, e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const folderId =
      typeof org.value?.folder === "object" ? org.value?.folder?.id : org.value?.folder;
    const up: any = await uploadFile(f, { title: "Section image", folder: folderId || undefined });
    if (!Array.isArray(b.images)) b.images = [];
    b.images.push({ file: up?.id || null, caption_title: "", caption_body: "", fit: "cover" });
  } catch {
    toast.error("Image upload failed");
  }
};
const removeBlockImage = (b: LandingBlock, idx: number) => b.images?.splice(idx, 1);
const addStat = (b: LandingBlock) => {
  if (!Array.isArray(b.stats)) b.stats = [];
  b.stats.push({ value: "", unit: "", label: "" });
};
const removeStat = (b: LandingBlock, idx: number) => b.stats?.splice(idx, 1);

// Inquiry recipient picker mode
const inquiryMode = ref<"email" | "member">("email");
watch(
  () => activeTab.value,
  (t) => {
    if (t === "inquiries") {
      const matchesMember = boardMembers.value.some((b) => b.email === landing.value.inquiry.email);
      inquiryMode.value = matchesMember ? "member" : "email";
    }
  }
);

// ===========================================================================
// Existing domain logic (unchanged)
// ===========================================================================
const externalMode = ref(false);
const externalUrlInput = ref("");
const savingExternal = ref(false);

const appBase = computed(() =>
  ((config.public.appUrl as string) || `https://${mainDomain.value}`).replace(/\/$/, "")
);
const portalUrl = computed(() => `${appBase.value}/${slug.value}`);

const saveExternalUrl = async () => {
  if (!orgId.value) return;
  const url = externalMode.value ? externalUrlInput.value.trim() : "";
  if (externalMode.value && url && !/^https?:\/\//i.test(url)) {
    toast.error("Enter a full URL, e.g. https://yourbuilding.com");
    return;
  }
  savingExternal.value = true;
  try {
    await orgItems.update(orgId.value, { external_url: url || null } as any);
    toast.success(
      url ? "External site saved — built-in landing disabled" : "Built-in landing enabled"
    );
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to save");
  } finally {
    savingExternal.value = false;
  }
};

const domainInput = ref("");
const connecting = ref(false);
const verifying = ref(false);
const disconnecting = ref(false);

const hasDomain = computed(() => !!org.value?.custom_domain);
const isVerified = computed(() => !!org.value?.domain_verified);
const cfg = computed<any>(() => org.value?.domain_config || {});
const domainType = computed(() => org.value?.domain_type || "apex");
const isApex = computed(() => domainType.value === "apex");

const statusLabel = computed(() => {
  if (!hasDomain.value) return "Not connected";
  return isVerified.value ? "Live" : "Pending verification";
});
const statusClass = computed(() => {
  if (!hasDomain.value) return "t-bg-subtle t-text-secondary";
  return isVerified.value ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
});

const connect = async () => {
  if (!orgId.value || !domainInput.value.trim()) return;
  connecting.value = true;
  try {
    await $fetch("/api/domains/connect", {
      method: "POST",
      body: { organizationId: orgId.value, domain: domainInput.value.trim() },
    });
    toast.success("Domain connected — add the DNS records, then verify");
    domainInput.value = "";
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to connect domain");
  } finally {
    connecting.value = false;
  }
};

const verify = async () => {
  if (!orgId.value) return;
  verifying.value = true;
  try {
    const res: any = await $fetch("/api/domains/verify", {
      method: "POST",
      body: { organizationId: orgId.value },
    });
    if (res.verified) {
      toast.success("Domain verified — your site is going live");
    } else {
      toast.warning(res.message || "Verification record not found yet");
    }
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Verification failed");
  } finally {
    verifying.value = false;
  }
};

const showDisconnectConfirm = ref(false);
const disconnect = async () => {
  if (!orgId.value) return;
  disconnecting.value = true;
  try {
    await $fetch("/api/domains/disconnect", {
      method: "POST",
      body: { organizationId: orgId.value },
    });
    toast.success("Domain disconnected");
    showDisconnectConfirm.value = false;
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to disconnect");
  } finally {
    disconnecting.value = false;
  }
};

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    /* ignore */
  }
};

const tabs = [
  { id: "sections", label: "Sections", icon: "lucide:layout-list" },
  { id: "content", label: "Content", icon: "lucide:layout-template" },
  { id: "widgets", label: "Widgets", icon: "lucide:layout-grid" },
  { id: "listings", label: "Listings", icon: "lucide:home" },
  { id: "faq", label: "FAQ", icon: "lucide:circle-help" },
  { id: "inquiries", label: "Inquiries", icon: "lucide:mail" },
  { id: "domain", label: "Domain", icon: "lucide:globe" },
];

useSeoMeta({ title: "Public site" });
</script>

<template>
  <div class="min-h-screen t-bg t-text">
    <PageContainer class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            class="mb-2 -ml-2"
            @click="navigateToOrg('/admin/settings/organization')"
          >
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
            Settings
          </Button>
          <h1 class="text-2xl font-semibold t-text">Public site</h1>
          <p class="text-sm t-text-muted mt-0.5">
            Edit your community's public landing page, choose which widgets show, add listings, route
            inquiries, and connect a custom domain.
          </p>
        </div>
        <a :href="`/${slug}`" target="_blank" rel="noopener" class="shrink-0">
          <Button variant="outline" size="sm" class="rounded-full">
            <Icon name="lucide:external-link" class="w-4 h-4 mr-1.5" />
            View site
          </Button>
        </a>
      </div>

      <div v-if="loading" class="flex justify-center py-16"><div class="spinner-ios" /></div>

      <Tabs v-else v-model="activeTab">
        <TabsList class="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger v-for="t in tabs" :key="t.id" :value="t.id" class="whitespace-nowrap">
            <Icon :name="t.icon" class="h-4 w-4 mr-2" />
            {{ t.label }}
          </TabsTrigger>
        </TabsList>

        <!-- ============================ SECTIONS ============================ -->
        <TabsContent value="sections" class="space-y-6">
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold t-text">Page sections</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Add, reorder, and show/hide every section of your landing page. Custom sections let
                  you write your own copy and add imagery.
                </p>
              </div>
              <Button variant="outline" size="sm" @click="addContentBlock">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add custom section
              </Button>
            </div>

            <div v-if="missingBuiltins.length" class="flex flex-wrap items-center gap-2">
              <span class="text-xs t-text-muted">Re-add built-in:</span>
              <button
                v-for="t in missingBuiltins"
                :key="t"
                type="button"
                class="text-xs rounded-full border t-border px-3 py-1 t-text-secondary hover:t-bg-subtle transition-colors"
                @click="addBuiltinBlock(t)"
              >
                + {{ BLOCK_META[t].label }}
              </button>
            </div>

            <div v-if="!landing.blocks.length" class="text-sm t-text-muted">No sections yet.</div>

            <div v-for="(b, i) in landing.blocks" :key="b.id" class="rounded-xl border t-border overflow-hidden">
              <!-- Row header -->
              <div class="flex items-center gap-3 p-3">
                <div class="flex flex-col">
                  <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === 0" @click="moveBlock(i, -1)">
                    <Icon name="lucide:chevron-up" class="w-4 h-4" />
                  </button>
                  <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === landing.blocks.length - 1" @click="moveBlock(i, 1)">
                    <Icon name="lucide:chevron-down" class="w-4 h-4" />
                  </button>
                </div>
                <Icon :name="BLOCK_META[b.type].icon" class="w-5 h-5 t-text-accent shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="font-medium t-text truncate">{{ blockTitle(b) }}</div>
                  <div class="text-xs t-text-muted truncate">{{ blockSubtitle(b) }}</div>
                </div>
                <Switch v-model="b.enabled" />
                <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeBlock(i)">
                  <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                </Button>
              </div>

              <!-- Custom content editor -->
              <div v-if="b.type === 'content'" class="border-t t-border p-4 space-y-3 t-bg-subtle">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <Label>Layout</Label>
                    <select
                      v-model="b.layout"
                      class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option v-for="l in CONTENT_LAYOUTS" :key="l" :value="l">{{ LAYOUT_LABELS[l] }}</option>
                    </select>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <Label>Number</Label>
                      <Input v-model="b.number_label" placeholder="01" />
                    </div>
                    <div class="space-y-1.5">
                      <Label>Category</Label>
                      <Input v-model="b.category" placeholder="Philosophy" />
                    </div>
                  </div>
                </div>
                <div class="space-y-1.5">
                  <Label>Eyebrow</Label>
                  <Input v-model="b.eyebrow" placeholder="Fully renovated — turnkey" />
                </div>
                <div class="space-y-1.5">
                  <Label>Title</Label>
                  <Input v-model="b.title" placeholder="The Anti-High-Rise" />
                </div>
                <div class="space-y-1.5">
                  <Label>Body</Label>
                  <textarea
                    v-model="b.body"
                    rows="4"
                    placeholder="Write the section copy…"
                    class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div class="space-y-1.5">
                  <Label>Tagline</Label>
                  <Input v-model="b.tagline" placeholder="Boutique scale. Big beach lifestyle." />
                </div>

                <!-- Menu link — surface this section in the public nav menu, with
                     an optional lucide icon. -->
                <div class="rounded-lg border t-border p-3 space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <Label class="block">Show as menu link</Label>
                      <p class="text-xs t-text-muted">Add this section to the public navigation menu.</p>
                    </div>
                    <Switch v-model="b.show_in_menu" />
                  </div>
                  <div v-if="b.show_in_menu" class="space-y-2">
                    <Label>Menu icon</Label>
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center justify-center w-9 h-9 rounded-md border t-border shrink-0">
                        <Icon :name="b.menu_icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
                      </span>
                      <Input v-model="b.menu_icon" placeholder="lucide:sparkles" />
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="ic in MENU_ICON_SUGGESTIONS"
                        :key="ic"
                        type="button"
                        class="inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors"
                        :class="b.menu_icon === ic ? 't-border-accent t-text-accent' : 't-border t-text-muted hover:t-bg-subtle'"
                        :title="ic"
                        @click="b.menu_icon = ic"
                      >
                        <Icon :name="ic" class="w-4 h-4" />
                      </button>
                    </div>
                    <p class="text-xs t-text-muted">
                      Pick one or type any
                      <a href="https://lucide.dev/icons" target="_blank" rel="noopener" class="t-link">lucide</a>
                      name. Leave blank for no icon.
                    </p>
                  </div>
                </div>

                <!-- Images (every layout except the stat band) -->
                <div v-if="b.layout !== 'stats'" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <Label>Images</Label>
                    <label class="text-sm t-link cursor-pointer">
                      <input type="file" accept="image/*" class="hidden" @change="(e) => onBlockImage(b, e)" />
                      Add image
                    </label>
                  </div>
                  <div v-if="!b.images?.length" class="text-xs t-text-muted">No images yet.</div>
                  <div v-for="(img, j) in b.images" :key="j" class="flex items-start gap-3 rounded-lg border t-border p-3">
                    <img v-if="img.file" :src="fileUrl(img.file) || ''" class="h-16 w-24 object-cover rounded shrink-0" />
                    <div class="flex-1 space-y-2 min-w-0">
                      <Input v-model="img.caption_title" placeholder="Caption title (optional)" />
                      <Input v-model="img.caption_body" placeholder="Caption description (optional)" />
                      <label class="text-xs t-text-muted inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          :checked="img.fit === 'contain'"
                          @change="img.fit = ($event.target as HTMLInputElement).checked ? 'contain' : 'cover'"
                        />
                        Fit whole image (contain) instead of fill
                      </label>
                    </div>
                    <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeBlockImage(b, j)">
                      <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <!-- Stats (stat-band layout only) -->
                <div v-if="b.layout === 'stats'" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <Label>Stats</Label>
                    <Button variant="outline" size="sm" @click="addStat(b)">
                      <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add stat
                    </Button>
                  </div>
                  <div v-if="!b.stats?.length" class="text-xs t-text-muted">No stats yet.</div>
                  <div v-for="(s, k) in b.stats" :key="k" class="flex items-center gap-2">
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-md border t-border shrink-0">
                      <Icon :name="s.icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
                    </span>
                    <Input v-model="s.icon" placeholder="lucide: (optional)" class="w-32" />
                    <Input v-model="s.value" placeholder="6" class="w-16" />
                    <Input v-model="s.unit" placeholder="min" class="w-20" />
                    <Input v-model="s.label" placeholder="Beach" class="flex-1" />
                    <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeStat(b, k)">
                      <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <!-- Feature list — icon-able points that break into columns. -->
                <div class="space-y-3 rounded-lg border t-border p-3">
                  <div class="flex items-center justify-between gap-2">
                    <Label class="block">Feature list</Label>
                    <Button variant="outline" size="sm" @click="addFeature(b)">
                      <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add feature
                    </Button>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1.5">
                      <Label>Style</Label>
                      <select
                        v-model="b.feature_style"
                        class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option v-for="s in FEATURE_STYLES" :key="s" :value="s">{{ FEATURE_STYLE_LABELS[s] }}</option>
                      </select>
                    </div>
                    <div class="space-y-1.5">
                      <Label>Columns</Label>
                      <select
                        v-model.number="b.feature_columns"
                        class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option :value="1">1</option>
                        <option :value="2">2</option>
                        <option :value="3">3</option>
                        <option :value="4">4</option>
                      </select>
                    </div>
                  </div>
                  <div v-if="!b.features?.length" class="text-xs t-text-muted">No features yet.</div>
                  <div v-for="(f, k) in b.features" :key="k" class="rounded-md border t-border p-2.5 space-y-2">
                    <div class="flex items-center gap-2">
                      <div class="flex flex-col">
                        <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="k === 0" @click="moveFeature(b, k, -1)">
                          <Icon name="lucide:chevron-up" class="w-4 h-4" />
                        </button>
                        <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="k === (b.features?.length || 0) - 1" @click="moveFeature(b, k, 1)">
                          <Icon name="lucide:chevron-down" class="w-4 h-4" />
                        </button>
                      </div>
                      <span class="inline-flex items-center justify-center w-8 h-8 rounded-md border t-border shrink-0">
                        <Icon :name="f.icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
                      </span>
                      <Input v-model="f.icon" placeholder="lucide:sparkles" class="w-40" />
                      <label class="ml-auto flex items-center gap-1.5 text-xs t-text-muted whitespace-nowrap">
                        <input type="checkbox" :checked="f.wide" @change="f.wide = ($event.target as HTMLInputElement).checked" />
                        Wide
                      </label>
                      <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeFeature(b, k)">
                        <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <Input v-model="f.title" placeholder="Title (optional — used by cards & tiles)" />
                    <Input v-model="f.text" placeholder="Feature text" />
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span class="text-xs t-text-muted self-center mr-1">Quick icons:</span>
                    <button
                      v-for="ic in MENU_ICON_SUGGESTIONS"
                      :key="ic"
                      type="button"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-md border t-border t-text-muted hover:t-bg-subtle"
                      :title="ic"
                      @click="b.features?.length ? (b.features[b.features.length - 1].icon = ic) : null"
                    >
                      <Icon :name="ic" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p class="text-xs t-text-muted">Icons use any <a href="https://lucide.dev/icons" target="_blank" rel="noopener" class="t-link">lucide</a> name. Quick-icons apply to the last feature. "Wide" spans all columns.</p>
                </div>
              </div>

              <!-- Location section editor -->
              <div v-else-if="b.type === 'location' && landing.location" class="border-t t-border p-4 space-y-4 t-bg-subtle">
                <p class="text-xs t-text-muted">
                  Map, walk/bike/transit scores, and curated nearby places. Scores and places left
                  blank fall back to your Neighborhood widget settings. The map appears once your
                  address has been geocoded.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <Label>Heading</Label>
                    <Input v-model="landing.location.heading" placeholder="The Flamingo Park Neighborhood" />
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div class="space-y-1.5">
                      <Label>Walk</Label>
                      <Input v-model.number="landing.location.walk_score" type="number" min="0" max="100" placeholder="94" />
                    </div>
                    <div class="space-y-1.5">
                      <Label>Bike</Label>
                      <Input v-model.number="landing.location.bike_score" type="number" min="0" max="100" placeholder="89" />
                    </div>
                    <div class="space-y-1.5">
                      <Label>Transit</Label>
                      <Input v-model.number="landing.location.transit_score" type="number" min="0" max="100" placeholder="72" />
                    </div>
                  </div>
                </div>
                <div class="space-y-1.5">
                  <Label>Intro</Label>
                  <textarea
                    v-model="landing.location.intro"
                    rows="2"
                    placeholder="A short editorial line about the location…"
                    class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div class="flex items-center justify-between">
                  <Label>Nearby places</Label>
                  <Button variant="outline" size="sm" @click="addLocationHighlight">
                    <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add place
                  </Button>
                </div>
                <div v-for="(p, j) in landing.location.highlights" :key="j" class="flex items-center gap-2">
                  <Input v-model="p.name" placeholder="The Beach" class="flex-1" />
                  <Input v-model="p.walk_time" placeholder="6 min" class="w-24" />
                  <Input v-model="p.distance" placeholder="0.5 mi" class="w-24" />
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeLocationHighlight(j)">
                    <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                  </Button>
                </div>
                <div class="flex items-center justify-between">
                  <Label>Editorial stats</Label>
                  <Button variant="outline" size="sm" @click="addLocationStat">
                    <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add stat
                  </Button>
                </div>
                <div v-for="(s, k) in landing.location.stats" :key="k" class="flex items-center gap-2">
                  <Input v-model="s.value" placeholder="12" class="w-20" />
                  <Input v-model="s.unit" placeholder="min" class="w-24" />
                  <Input v-model="s.label" placeholder="to the beach" class="flex-1" />
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeLocationStat(k)">
                    <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>

              <!-- Gallery section editor -->
              <div v-else-if="b.type === 'gallery' && landing.gallery" class="border-t t-border p-4 space-y-4 t-bg-subtle">
                <div class="space-y-1.5">
                  <Label>Caption</Label>
                  <Input v-model="landing.gallery.caption" placeholder="A Closer Look" />
                </div>
                <div class="space-y-1.5">
                  <Label>Image source</Label>
                  <div class="inline-flex rounded-lg border t-border p-0.5">
                    <button
                      v-for="src in (['manual', 'folder'] as const)"
                      :key="src"
                      type="button"
                      class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                      :class="landing.gallery.source === src ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
                      @click="landing.gallery.source = src"
                    >
                      {{ src === "manual" ? "Hand-picked" : "From a folder" }}
                    </button>
                  </div>
                </div>

                <!-- Manual: upload + manage image list -->
                <template v-if="landing.gallery.source === 'manual'">
                  <div class="flex items-center justify-between">
                    <Label>Images</Label>
                    <label class="text-sm t-link cursor-pointer">
                      <input type="file" accept="image/*" class="hidden" @change="onGalleryImage" />
                      Add image
                    </label>
                  </div>
                  <div v-if="!landing.gallery.images.length" class="text-xs t-text-muted">No images yet.</div>
                  <div class="flex flex-wrap gap-3">
                    <div v-for="(id, j) in landing.gallery.images" :key="id" class="relative">
                      <img :src="fileUrl(id) || ''" class="h-20 w-28 object-cover rounded border t-border" />
                      <button
                        type="button"
                        class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                        @click="removeGalleryImage(j)"
                      >
                        <Icon name="lucide:x" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </template>

                <!-- Folder: pull live from a storage folder -->
                <template v-else>
                  <div class="space-y-1.5">
                    <Label>Folder ID (optional)</Label>
                    <Input v-model="landing.gallery.folder" placeholder="Leave blank for your main folder" class="font-mono text-xs" />
                    <p class="text-xs t-text-muted">
                      Pulls images live from this folder in your file library (and its subfolders).
                      Leave blank to use your organization's main folder. Find a folder's ID under
                      Settings → Files.
                    </p>
                  </div>
                </template>
              </div>

              <!-- Built-in hint -->
              <div v-else-if="BLOCK_META[b.type].hint" class="border-t t-border px-4 py-2 text-xs t-text-muted">
                {{ BLOCK_META[b.type].hint }}
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingLanding" @click="saveLanding">
              <Icon v-if="savingLanding" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save sections
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ CONTENT ============================ -->
        <TabsContent value="content" class="space-y-6">
          <!-- Live hero preview -->
          <div class="ios-card overflow-hidden">
            <div
              class="relative aspect-[16/7] bg-cover bg-center flex items-center justify-center text-center"
              :style="heroPreviewBg ? { backgroundImage: `url(${heroPreviewBg})` } : { background: '#15130f' }"
            >
              <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" />
              <div class="relative z-10 px-6">
                <img
                  v-if="heroPreviewFg"
                  :src="heroPreviewFg"
                  class="max-h-20 mx-auto object-contain drop-shadow-lg mb-3"
                />
                <h3
                  v-else
                  class="text-white text-2xl font-light uppercase tracking-[0.25em]"
                >
                  {{ content.heroTitle || org?.name }}
                </h3>
                <p class="text-white/80 text-[10px] uppercase tracking-[0.25em] mt-1">
                  {{ content.heroSubtitle || [org?.street_address, org?.city, org?.state].filter(Boolean).join(", ") }}
                </p>
              </div>
            </div>
            <div class="px-4 py-2.5 flex items-center gap-2 text-xs t-text-muted">
              <Icon name="lucide:eye" class="w-3.5 h-3.5" />
              Live preview — updates as you edit. Open <span class="font-medium t-text">View site</span> for the full page.
            </div>
          </div>

          <!-- Insights -->
          <div class="ios-card p-6">
            <h2 class="font-semibold t-text mb-4">Insights</h2>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <div class="text-2xl font-semibold t-text">{{ stats.views }}</div>
                <div class="text-[11px] t-text-muted uppercase tracking-wide mt-1">Views</div>
              </div>
              <div>
                <div class="text-2xl font-semibold t-text">{{ stats.inquiries }}</div>
                <div class="text-[11px] t-text-muted uppercase tracking-wide mt-1">Inquiries</div>
              </div>
              <div>
                <div class="text-2xl font-semibold t-text">{{ stats.conversion }}%</div>
                <div class="text-[11px] t-text-muted uppercase tracking-wide mt-1">Conversion</div>
              </div>
            </div>
            <p class="text-xs t-text-muted mt-3">
              Landing views (once per visitor session) and inquiry-form submissions.
            </p>
          </div>

          <!-- Theme -->
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Theme</h2>
              <p class="text-sm t-text-muted mt-0.5">The look of your public landing page.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                type="button"
                class="text-left rounded-xl border p-4 transition-colors"
                :class="content.theme === opt.value ? 'border-primary ring-1 ring-primary' : 't-border hover:t-bg-subtle'"
                @click="content.theme = opt.value"
              >
                <div class="font-medium t-text">{{ opt.label }}</div>
                <div class="text-xs t-text-muted mt-1">{{ opt.hint }}</div>
              </button>
            </div>
          </div>

          <!-- Hero -->
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Hero</h2>
              <p class="text-sm t-text-muted mt-0.5">
                The full-screen header. A background photo with your logo or title over it.
              </p>
            </div>
            <div class="space-y-1.5">
              <Label for="hero-title">Title <span class="t-text-muted">(optional — defaults to community name)</span></Label>
              <Input id="hero-title" v-model="content.heroTitle" placeholder="Welcome to…" />
            </div>
            <div class="space-y-1.5">
              <Label for="hero-sub">Subtitle <span class="t-text-muted">(optional — defaults to address)</span></Label>
              <Input id="hero-sub" v-model="content.heroSubtitle" placeholder="A boutique community in…" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <Label>Background photo</Label>
                <label class="block border-2 border-dashed t-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50">
                  <input type="file" accept="image/*" class="hidden" @change="onHeroBg" />
                  <img
                    v-if="heroBgPreview || fileUrl(getFileId(org?.hero?.background_image))"
                    :src="heroBgPreview || fileUrl(getFileId(org?.hero?.background_image)) || ''"
                    class="max-h-28 mx-auto object-cover rounded"
                  />
                  <div v-else class="py-4 t-text-muted text-sm">
                    <Icon name="lucide:image" class="w-8 h-8 mx-auto mb-1" />
                    Click to upload
                  </div>
                </label>
              </div>
              <div class="space-y-1.5">
                <Label>Hero logo <span class="t-text-accent font-medium">— transparent PNG recommended</span></Label>
                <label
                  class="block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
                  :class="heroFgPreview || getFileId(org?.hero?.foreground_image) ? 't-border hover:border-primary/50' : 't-border-accent hover:t-bg-accent/10'"
                >
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/*" class="hidden" @change="onHeroFg" />
                  <img
                    v-if="heroFgPreview || fileUrl(getFileId(org?.hero?.foreground_image))"
                    :src="heroFgPreview || fileUrl(getFileId(org?.hero?.foreground_image)) || ''"
                    class="max-h-28 mx-auto object-contain rounded"
                  />
                  <div v-else class="py-4 t-text-accent text-sm">
                    <Icon name="lucide:image-plus" class="w-8 h-8 mx-auto mb-1" />
                    <span class="font-medium">Upload a transparent PNG</span>
                  </div>
                </label>
                <p class="text-xs t-text-muted leading-relaxed">
                  Your community wordmark/logo, placed over the hero photo. A
                  <strong class="t-text">transparent PNG</strong> (or SVG) looks sharpest — it
                  reads cleanly on any background. Aim for ~1200px wide.
                </p>
              </div>
            </div>
          </div>

          <!-- About -->
          <div class="ios-card p-6 space-y-3">
            <div>
              <h2 class="font-semibold t-text">About</h2>
              <p class="text-sm t-text-muted mt-0.5">A short description of your community.</p>
            </div>
            <textarea
              v-model="content.description"
              rows="4"
              placeholder="Tell visitors about your community…"
              class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Amenities -->
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-semibold t-text">Amenities</h2>
                <p class="text-sm t-text-muted mt-0.5">Highlights shown in a grid on the landing.</p>
              </div>
              <Button variant="outline" size="sm" @click="addAmenity">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add
              </Button>
            </div>
            <div v-if="!amenities.length" class="text-sm t-text-muted">No amenities yet.</div>
            <div v-for="(a, i) in amenities" :key="i" class="rounded-xl border t-border p-3 space-y-2">
              <div class="flex items-center gap-2">
                <Icon :name="a.icon || 'lucide:sparkles'" class="w-5 h-5 shrink-0 t-text-accent" />
                <Input v-model="a.title" placeholder="Title (e.g. Rooftop Pool)" class="flex-1" />
                <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeAmenity(i)">
                  <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                </Button>
              </div>
              <Input v-model="a.icon" placeholder="Icon name (e.g. lucide:waves)" class="font-mono text-xs" />
              <Input v-model="a.description" placeholder="Short description" />
            </div>
          </div>

          <!-- Contact -->
          <div class="ios-card p-6 space-y-4">
            <h2 class="font-semibold t-text">Contact &amp; visibility</h2>
            <div class="space-y-1.5">
              <Label for="org-type">Community type</Label>
              <select
                id="org-type"
                v-model="content.type"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Residential (default)</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
              <p class="text-xs t-text-muted">
                Sets the wording across your public site — residential says
                "Residents" / "Households"; commercial says "Members".
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <Label for="c-phone">Phone</Label>
                <Input id="c-phone" v-model="content.phone" placeholder="(555) 555-5555" />
              </div>
              <div class="space-y-1.5">
                <Label for="c-email">Email</Label>
                <Input id="c-email" v-model="content.email" placeholder="info@yourbuilding.com" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium t-text">Show board of directors</p>
                <p class="text-sm t-text-muted">Display the "Meet the board" section.</p>
              </div>
              <Switch v-model="content.show_board" />
            </div>
          </div>

          <!-- Property management (needs a management vendor in Settings → Vendors) -->
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Property management</h2>
              <p class="text-sm t-text-muted mt-1">
                Surface your management company on the public landing. Pulls from the primary active
                <strong>Management</strong> vendor in
                <NuxtLink :to="`/${slug}/admin/settings/property-management`" class="t-text-accent hover:underline">
                  Settings → Vendors
                </NuxtLink>.
              </p>
            </div>
            <div v-if="!hasManagementVendor" class="rounded-lg border t-border bg-amber-50 text-amber-800 text-sm px-3 py-2">
              No active management vendor found yet. Add one under Vendors to use these options.
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium t-text">Feature on landing</p>
                <p class="text-sm t-text-muted">Adds a "Professionally managed by…" callout and a footer line.</p>
              </div>
              <Switch v-model="landing.feature_pm" :disabled="!hasManagementVendor" />
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium t-text">Use manager's contact in "Get in Touch"</p>
                <p class="text-sm t-text-muted">Shows the manager's phone/email in the contact section instead of the org's.</p>
              </div>
              <Switch v-model="landing.pm_contact" :disabled="!hasManagementVendor" />
            </div>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingContent" @click="saveContent">
              <Icon v-if="savingContent" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save content
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ WIDGETS ============================ -->
        <TabsContent value="widgets" class="space-y-6">
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Hero widgets</h2>
              <p class="text-sm t-text-muted mt-0.5">
                Frosted info cards over the hero. Toggle and reorder them; the row scrolls if it
                overflows.
              </p>
            </div>
            <div
              v-for="(w, i) in landing.widgets"
              :key="w.key"
              class="flex items-center gap-3 rounded-xl border t-border p-3"
            >
              <div class="flex flex-col">
                <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === 0" @click="moveWidget(i, -1)">
                  <Icon name="lucide:chevron-up" class="w-4 h-4" />
                </button>
                <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === landing.widgets.length - 1" @click="moveWidget(i, 1)">
                  <Icon name="lucide:chevron-down" class="w-4 h-4" />
                </button>
              </div>
              <Icon :name="widgetLabel(w.key)?.icon || 'lucide:square'" class="w-5 h-5 t-text-accent" />
              <div class="flex-1 min-w-0">
                <div class="font-medium t-text">{{ widgetLabel(w.key)?.label || w.key }}</div>
                <div class="text-xs t-text-muted truncate">{{ widgetLabel(w.key)?.description }}</div>
              </div>
              <Switch v-model="w.enabled" />
            </div>
            <p class="text-xs t-text-muted">
              The Weather widget needs the platform's weather key configured; if it's unset the card
              hides automatically.
            </p>
          </div>

          <!-- Neighborhood / walk-score editor -->
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Neighborhood widget</h2>
              <p class="text-sm t-text-muted mt-0.5">Walk score and nearby places you curate.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-1.5">
                <Label>Neighborhood</Label>
                <Input v-model="landing.places.neighborhood" placeholder="e.g. Flamingo Park" />
              </div>
              <div class="space-y-1.5">
                <Label>Walk score</Label>
                <Input v-model.number="landing.places.walk_score" type="number" min="0" max="100" placeholder="94" />
              </div>
              <div class="space-y-1.5">
                <Label>Bike score</Label>
                <Input v-model.number="landing.places.bike_score" type="number" min="0" max="100" placeholder="89" />
              </div>
            </div>
            <div class="flex items-center justify-between">
              <p class="font-medium t-text text-sm">Nearby places</p>
              <Button variant="outline" size="sm" @click="addPlace">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add place
              </Button>
            </div>
            <div v-for="(p, i) in landing.places.items" :key="i" class="flex items-center gap-2">
              <Input v-model="p.name" placeholder="The Beach" class="flex-1" />
              <Input v-model="p.walk_time" placeholder="6 min" class="w-24" />
              <Input v-model="p.distance" placeholder="0.5 mi" class="w-24" />
              <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removePlace(i)">
                <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>

          <!-- Community news teaser -->
          <div class="ios-card p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold t-text">Community news</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Show your most recent sent announcements on the public landing. Off by default —
                  only enable if those announcements are okay to show publicly.
                </p>
              </div>
              <Switch v-model="landing.show_announcements" />
            </div>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingLanding" @click="saveLanding">
              <Icon v-if="savingLanding" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save widgets
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ LISTINGS ============================ -->
        <TabsContent value="listings" class="space-y-6">
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-semibold t-text">Real-estate listings</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Link units for sale or rent. They appear in a "For Sale &amp; Rent" section.
                </p>
              </div>
              <Button variant="outline" size="sm" @click="addListing">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add listing
              </Button>
            </div>
            <div v-if="!landing.listings.length" class="text-sm t-text-muted">No listings yet.</div>
            <div v-for="(l, i) in landing.listings" :key="i" class="rounded-xl border t-border p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="inline-flex rounded-lg border t-border p-0.5">
                  <button
                    v-for="ty in (['sale','rental'] as ListingType[])"
                    :key="ty"
                    type="button"
                    class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                    :class="l.type === ty ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
                    @click="l.type = ty"
                  >
                    {{ ty === "sale" ? "For Sale" : "For Rent" }}
                  </button>
                </div>
                <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeListing(i)">
                  <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                </Button>
              </div>
              <Input v-model="l.title" placeholder="Unit 4B — 2BR / 2BA" />
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input v-model="l.url" placeholder="https://listing-url.com" class="font-mono text-xs" />
                <Input v-model="l.price" placeholder="$650,000 or $3,200/mo" />
              </div>
              <div class="flex items-center gap-3">
                <img v-if="l.image" :src="fileUrl(l.image) || ''" class="h-14 w-20 object-cover rounded" />
                <label class="text-sm t-link cursor-pointer">
                  <input type="file" accept="image/*" class="hidden" @change="(e) => onListingImage(i, e)" />
                  {{ l.image ? "Change photo" : "Add photo" }}
                </label>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingLanding" @click="saveLanding">
              <Icon v-if="savingLanding" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save listings
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ FAQ ============================ -->
        <TabsContent value="faq" class="space-y-6">
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-semibold t-text">Frequently asked questions</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Answer common questions from prospective residents. They appear as an accordion
                  section on your landing page.
                </p>
              </div>
              <Button variant="outline" size="sm" @click="addFaq">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add question
              </Button>
            </div>
            <div v-if="!landing.faq.length" class="text-sm t-text-muted">No questions yet.</div>
            <div v-for="(f, i) in landing.faq" :key="i" class="rounded-xl border t-border p-4 space-y-3">
              <div class="flex items-start gap-2">
                <span class="mt-2 text-sm font-medium t-text-muted w-5 text-right">{{ i + 1 }}.</span>
                <div class="flex-1 space-y-3">
                  <Input v-model="f.question" placeholder="How do I reserve the rooftop?" />
                  <textarea
                    v-model="f.answer"
                    rows="3"
                    placeholder="Answer…"
                    class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0" :disabled="i === 0" @click="moveFaq(i, -1)">
                    <Icon name="lucide:chevron-up" class="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0" :disabled="i === landing.faq.length - 1" @click="moveFaq(i, 1)">
                    <Icon name="lucide:chevron-down" class="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeFaq(i)">
                    <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingLanding" @click="saveLanding">
              <Icon v-if="savingLanding" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save FAQ
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ INQUIRIES ============================ -->
        <TabsContent value="inquiries" class="space-y-6">
          <div class="ios-card p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="font-semibold t-text">Inquiry form</h2>
                <p class="text-sm t-text-muted mt-0.5">
                  Let visitors submit purchase / rental / general interest from the landing page.
                </p>
              </div>
              <Switch v-model="landing.inquiry.enabled" />
            </div>

            <template v-if="landing.inquiry.enabled">
              <div class="space-y-1.5">
                <Label>Send inquiries to</Label>
                <div class="inline-flex rounded-lg border t-border p-0.5">
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                    :class="inquiryMode === 'email' ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
                    @click="inquiryMode = 'email'"
                  >
                    An email address
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                    :class="inquiryMode === 'member' ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
                    @click="inquiryMode = 'member'"
                  >
                    A board member
                  </button>
                </div>
              </div>

              <div v-if="inquiryMode === 'email'" class="space-y-1.5">
                <Label for="inq-to">Email address</Label>
                <Input
                  id="inq-to"
                  v-model="landing.inquiry.email"
                  type="email"
                  :placeholder="org?.email || 'info@yourbuilding.com'"
                />
                <p class="text-xs t-text-muted">
                  Leave blank to use your community contact email ({{ org?.email || "not set" }}).
                </p>
              </div>

              <div v-else class="space-y-1.5">
                <Label for="inq-member">Board member</Label>
                <select
                  id="inq-member"
                  v-model="landing.inquiry.email"
                  class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select a board member…</option>
                  <option v-for="b in boardMembers" :key="b.id" :value="b.email">
                    {{ b.name }} — {{ b.email }}
                  </option>
                </select>
                <p v-if="!boardMembers.length" class="text-xs t-text-muted">
                  No board members with an email on file. Add them under Governance, or use an email address.
                </p>
              </div>
            </template>
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="savingLanding" @click="saveLanding">
              <Icon v-if="savingLanding" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save inquiries
            </Button>
          </div>
        </TabsContent>

        <!-- ============================ DOMAIN ============================ -->
        <TabsContent value="domain" class="space-y-6">
          <!-- Public landing: built-in vs external marketing site -->
          <div class="ios-card p-6 space-y-4">
            <div>
              <h2 class="font-semibold t-text">Landing page</h2>
              <p class="text-sm t-text-muted mt-0.5">
                Use HOA Connect's built-in landing, or host your own marketing site and use HOA Connect
                as the resident portal only.
              </p>
            </div>

            <div class="inline-flex rounded-lg border t-border p-0.5">
              <button
                type="button"
                @click="externalMode = false"
                :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-colors', !externalMode ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text']"
              >
                Built-in
              </button>
              <button
                type="button"
                @click="externalMode = true"
                :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-colors', externalMode ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text']"
              >
                External site
              </button>
            </div>

            <div v-if="externalMode" class="space-y-3">
              <div class="space-y-1.5">
                <Label for="ext-url">External site URL</Label>
                <Input id="ext-url" v-model="externalUrlInput" placeholder="https://yourbuilding.com" class="font-mono" />
                <p class="text-xs t-text-muted">
                  When set, the built-in landing is disabled — visitors at your HOA Connect address are
                  sent to the resident login.
                </p>
              </div>

              <div class="rounded-xl t-bg-subtle p-3 text-sm">
                <p class="t-text-muted mb-1.5">Add this "Resident Login" link to your external site:</p>
                <div class="flex items-center gap-2">
                  <span class="font-mono break-all t-text">{{ portalUrl }}</span>
                  <Button variant="ghost" size="sm" class="w-8 h-8 p-0 shrink-0" @click="copy(portalUrl)">
                    <Icon name="lucide:copy" class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            <p v-else class="text-xs t-text-muted">
              The built-in editorial landing is shown at your HOA Connect address.
            </p>

            <Button class="rounded-full" :disabled="savingExternal" @click="saveExternalUrl">
              <Icon v-if="savingExternal" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4 mr-2" />
              Save landing setting
            </Button>
          </div>

          <!-- Custom domain -->
          <div class="pt-2 flex items-center gap-3">
            <h2 class="text-lg font-semibold t-text">Custom domain</h2>
            <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" :class="statusClass">
              {{ statusLabel }}
            </span>
          </div>

          <!-- Connect form -->
          <div v-if="!hasDomain" class="ios-card p-6 space-y-4">
            <div class="space-y-1.5">
              <Label for="domain">Your domain</Label>
              <Input id="domain" v-model="domainInput" placeholder="yourbuilding.com" class="font-mono" />
              <p class="text-xs t-text-muted">
                Use your root domain (<span class="font-mono">yourbuilding.com</span>) or a subdomain
                (<span class="font-mono">portal.yourbuilding.com</span>). You'll add a couple of DNS records next.
              </p>
            </div>
            <Button class="rounded-full" :disabled="connecting || !domainInput.trim()" @click="connect">
              <Icon v-if="connecting" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:globe" class="w-4 h-4 mr-2" />
              Connect domain
            </Button>
          </div>

          <!-- Connected: instructions + status -->
          <template v-else>
            <div class="ios-card p-6 space-y-2">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <Icon name="lucide:globe" class="w-5 h-5 t-text-muted shrink-0" />
                  <span class="font-mono font-medium truncate">{{ org?.custom_domain }}</span>
                  <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" :class="statusClass">{{ statusLabel }}</span>
                </div>
                <Button variant="ghost" size="sm" :disabled="disconnecting" @click="showDisconnectConfirm = true">
                  <Icon name="lucide:unlink" class="w-4 h-4 mr-1.5" />
                  Disconnect
                </Button>
              </div>
              <p v-if="isVerified" class="text-sm text-green-700 flex items-center gap-1.5">
                <Icon name="lucide:check-circle" class="w-4 h-4" />
                Verified — your public site is served at this domain.
              </p>
            </div>

            <div class="ios-card p-6 space-y-5">
              <div>
                <h2 class="font-semibold t-text">1. Point your domain to us</h2>
                <p class="text-sm t-text-muted mt-0.5">Add this at your DNS provider (GoDaddy, Cloudflare, Namecheap, Route 53…).</p>
              </div>

              <div v-if="isApex" class="space-y-3">
                <div class="rounded-xl t-bg-subtle p-3 text-sm space-y-2">
                  <p class="font-medium t-text">Root domain — pick whichever your provider supports:</p>
                  <ul class="space-y-1.5 t-text-muted">
                    <li><strong class="t-text">ALIAS / ANAME</strong> record: <span class="font-mono">@ → {{ mainDomain }}</span> (Cloudflare, Route 53, DNSimple…)</li>
                    <li><strong class="t-text">A</strong> record: <span class="font-mono">@ → your platform's IP</span> (ask your operator for the address)</li>
                    <li><strong class="t-text">Or</strong> CNAME <span class="font-mono">www → {{ mainDomain }}</span> and 301-redirect the root to <span class="font-mono">www</span></li>
                  </ul>
                </div>
              </div>
              <div v-else class="rounded-xl t-bg-subtle p-3 text-sm">
                <p class="font-medium t-text mb-1">Subdomain</p>
                <p class="t-text-muted">Add a <strong class="t-text">CNAME</strong> record: <span class="font-mono">{{ (org?.custom_domain||'').split('.')[0] }} → {{ mainDomain }}</span></p>
              </div>

              <template v-if="cfg.record_name">
                <div>
                  <h2 class="font-semibold t-text">2. Add the verification record</h2>
                  <p class="text-sm t-text-muted mt-0.5">Proves you own the domain. We check this when you verify.</p>
                </div>
                <div class="rounded-xl border t-border divide-y t-border text-sm">
                  <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
                    <span class="t-text-muted">Type</span><span class="font-mono">TXT</span><span />
                  </div>
                  <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
                    <span class="t-text-muted">Name</span>
                    <span class="font-mono break-all">{{ cfg.record_name }}</span>
                    <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="copy(cfg.record_name)"><Icon name="lucide:copy" class="w-4 h-4" /></Button>
                  </div>
                  <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
                    <span class="t-text-muted">Value</span>
                    <span class="font-mono break-all">{{ cfg.record_value }}</span>
                    <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="copy(cfg.record_value)"><Icon name="lucide:copy" class="w-4 h-4" /></Button>
                  </div>
                </div>

                <div class="flex items-center gap-3 pt-1">
                  <Button class="rounded-full" :disabled="verifying" @click="verify">
                    <Icon v-if="verifying" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
                    <Icon v-else name="lucide:badge-check" class="w-4 h-4 mr-2" />
                    {{ isVerified ? "Re-check" : "Verify domain" }}
                  </Button>
                  <p class="text-xs t-text-muted">DNS changes can take a few minutes to propagate. SSL is issued automatically once verified.</p>
                </div>
              </template>
            </div>
          </template>
        </TabsContent>
      </Tabs>
    </PageContainer>

    <!-- Disconnect confirmation -->
    <Dialog v-model:open="showDisconnectConfirm">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect this domain?</DialogTitle>
          <DialogDescription>
            <template v-if="isVerified">
              Your public site will stop being served at
              <span class="font-mono">{{ org?.custom_domain }}</span>. You can reconnect it later,
              but you'll need to re-verify.
            </template>
            <template v-else>
              This removes <span class="font-mono">{{ org?.custom_domain }}</span> and its pending
              verification.
            </template>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2">
          <Button variant="outline" :disabled="disconnecting" @click="showDisconnectConfirm = false">Cancel</Button>
          <Button variant="destructive" :disabled="disconnecting" @click="disconnect">
            <Icon v-if="disconnecting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
