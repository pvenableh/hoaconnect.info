<script setup lang="ts">
/**
 * The workspace design system, on one page.
 *
 * This is the contract: every primitive and composite the admin and auth
 * surfaces are built from, rendered in the real theme, in both light and dark.
 * When a phase of the refresh changes a primitive, it changes here in the same
 * commit — so "did that break anything?" is one page away rather than a crawl
 * through eighty screens.
 *
 * View at /ui-kit on the main domain. Standalone (no app shell, no org context).
 */
import {
  BRAND_ACCENT_HEX,
  getAdminAccent,
  accentCssVars,
} from "#core/shared/branding/accent";

definePageMeta({ layout: false });
useHead({ title: "UI Kit — HOA Connect design system" });

// The showcase renders the real workspace theme, so what you see here is what
// admin and auth actually get — that is the whole point of it as a contract.
const appearance = useWorkspaceAppearance();

// The swatches drive the REAL resolver, not a decorative-only override, so this
// row is a live preview of what per-organization accents would look like: both
// the glass tier (rims, halos, the active thumb) and the ink tier (buttons,
// links, focus rings) move together, exactly as they would if getAdminAccent()
// started reading an org's colour.
const accents = [
  { id: "brand", label: "HOA Connect", hex: BRAND_ACCENT_HEX },
  { id: "blue", label: "Blue", hex: "#3B82F6" },
  { id: "violet", label: "Violet", hex: "#8B5CF6" },
  { id: "emerald", label: "Emerald", hex: "#10B981" },
  { id: "amber", label: "Amber", hex: "#F59E0B" },
  { id: "rose", label: "Rose", hex: "#F43F5E" },
  { id: "gold", label: "Gold", hex: "#B8956C" },
] as const;

const accent = ref<string>("brand");

const previewAccent = computed(() => {
  const found = accents.find((a) => a.id === accent.value) ?? accents[0];
  return getAdminAccent(found.hex);
});

// Written onto <html>, exactly where the appearance layer writes them — NOT onto
// this page's root div. Custom properties resolve at their DECLARATION site, and
// `--primary` is declared on `html` as `var(--theme-accent-primary)`; overriding
// that variable on a descendant re-tints the glass but leaves every button and
// focus ring on the old colour. Writing to <html> is both correct and the honest
// test, since it exercises the real code path.
watchEffect(() => {
  if (!import.meta.client) return;
  const dark = appearance.isDark.value;
  const vars = accentCssVars(
    dark ? previewAccent.value.dark : previewAccent.value.light,
    dark ? previewAccent.value.ink.dark : previewAccent.value.ink.light,
  );
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
});

// Hand the accent back when leaving, or the preview colour follows the user out
// of the style guide and into the app.
onUnmounted(() => appearance.apply());

const demoLoading = ref(true);
const replayLoad = () => {
  demoLoading.value = true;
  setTimeout(() => (demoLoading.value = false), 2600);
};
onMounted(() => setTimeout(() => (demoLoading.value = false), 2600));

// ── Live demos ──────────────────────────────────────────────────────────────
// The page-level control keeps its selection in `?tab=` via router.replace, so
// the view is linkable and survives a refresh, but Back still leaves the page
// instead of walking through tabs the user merely glanced at.
const segment = useTabQuery({
  values: ["overview", "activity", "spend", "archived"],
  fallback: "overview",
});
const segmentItems = [
  { value: "overview", label: "Overview", icon: "lucide:layout-dashboard" },
  { value: "activity", label: "Activity", icon: "lucide:activity", count: 12 },
  { value: "spend", label: "AI spend", icon: "lucide:sparkles" },
  { value: "archived", label: "Archived", disabled: true },
];

const filterSegment = ref("all");
const filterItems = [
  { value: "all", label: "All" },
  { value: "owners", label: "Owners" },
  { value: "tenants", label: "Tenants" },
];

const sheetOpen = ref(false);
const switchOn = ref(true);
const showEmpty = ref(false);

const columns = [
  { key: "name", label: "Member", sortable: true },
  { key: "unit", label: "Unit", sortable: true },
  { key: "type", label: "Type", hideOnMobile: true },
  { key: "balance", label: "Balance", align: "right" as const, sortable: true },
];
// `row-class` is for the case where the row's state, not one cell's, is the
// point — an overdue balance tints the whole line rather than one number.
const memberRowClass = (row: (typeof members)[number]) =>
  row.balance < 0 ? "bg-destructive/[0.06]" : undefined;

const members = [
  { id: 1, name: "Dana Whitfield", unit: "4B", type: "Owner", balance: 0 },
  { id: 2, name: "Marcus Lee", unit: "2A", type: "Tenant", balance: 240 },
  { id: 3, name: "Priya Raman", unit: "7C", type: "Owner", balance: -120 },
  { id: 4, name: "Tom Alvarez", unit: "1D", type: "Owner", balance: 85 },
];

const stats = [
  { label: "Collected this month", value: "$18,420", icon: "lucide:dollar-sign", trend: 8 },
  { label: "Outstanding dues", value: "$4,200", icon: "lucide:alert-circle", trend: 12, trendPositive: false },
  { label: "Active units", value: "28", icon: "lucide:home" },
  { label: "Open requests", value: "3", icon: "lucide:inbox", trend: -5, trendPositive: false },
];

const settingsRows = [
  { icon: "lucide:building-2", label: "Association profile", hint: "Name, logo, address" },
  { icon: "lucide:credit-card", label: "Billing & subscription", hint: "Studio plan" },
  { icon: "lucide:users", label: "Members & roles", hint: "34 members" },
];

const typeLadder = [
  { cls: "type-display", name: "type-display", note: "Page title — one per page" },
  { cls: "type-section", name: "type-section", note: "Section heading" },
  { cls: "type-card", name: "type-card", note: "Card & panel titles" },
  { cls: "type-body", name: "type-body", note: "Running text" },
  { cls: "type-meta", name: "type-meta", note: "Timestamps, secondary lines" },
  { cls: "type-micro", name: "type-micro", note: "Metadata labels only" },
  { cls: "type-label", name: "type-label", note: "Form & field labels" },
];

const materials = [
  { cls: "glass-surface", label: "glass-surface" },
  { cls: "glass-surface glass-surface--strong", label: "--strong" },
  { cls: "ios-card", label: "ios-card" },
  { cls: "glass-edge", label: "glass-edge" },
  { cls: "glass glass-edge", label: "glass" },
  { cls: "glass-active-thumb", label: "active-thumb" },
];
</script>

<template>
  <div class="ui-kit min-h-screen t-bg t-text">
    <div class="mx-auto max-w-5xl px-5 py-10 space-y-12">
      <!-- ── Header ───────────────────────────────────────────────────── -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="type-micro type-flush">HOA Connect</p>
          <h1 class="type-display type-flush">Design system</h1>
          <p class="type-body type-flush">
            The workspace surface: liquid glass, one accent, light and dark.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="appearance.toggle()">
            <Icon :name="appearance.isDark.value ? 'lucide:sun' : 'lucide:moon'" />
            {{ appearance.isDark.value ? "Light" : "Dark" }}
          </Button>
          <Button variant="outline" size="sm" @click="replayLoad">
            <span class="spinner-ios spinner-ios--sm" />
            Replay load
          </Button>
        </div>
      </header>

      <!-- ── Accent ───────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Accent</h2>
        <p class="type-body">
          The workspace ships one brand accent, but it is resolved through
          <code>getAdminAccent()</code> — so letting an organization brand their
          own workspace is a one-line change. Pick a colour to preview it: the
          buttons, links, focus rings, glass rims and the active tab thumb all
          re-tint together.
        </p>
        <div class="flex flex-wrap items-center gap-2 mt-3 content-column">
          <button
            v-for="a in accents"
            :key="a.id"
            class="w-7 h-7 rounded-full ios-press glass-edge"
            :class="accent === a.id ? 'ring-2 ring-offset-2 ring-offset-transparent' : ''"
            :style="{ backgroundColor: a.hex }"
            :title="a.label"
            :aria-label="a.label"
            :aria-pressed="accent === a.id"
            @click="accent = a.id"
          />
          <span class="type-meta ml-2">{{ accents.find((a) => a.id === accent)?.label }}</span>
        </div>
      </section>

      <!-- ── Type ─────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Type</h2>
        <p class="type-body">
          Seven roles. Actions are Title Case, meta-labels are UPPERCASE, prose is
          sentence case.
        </p>
        <div class="ios-card p-5 mt-3 space-y-3">
          <div v-for="t in typeLadder" :key="t.name" class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span :class="[t.cls, 'type-flush']">The quick brown fox</span>
            <code class="type-micro">{{ t.name }}</code>
            <span class="type-meta">{{ t.note }}</span>
          </div>
        </div>
      </section>

      <!-- ── Buttons ──────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Buttons</h2>
        <p class="type-body">Pill by default. One primary action per view.</p>
        <div class="ios-card p-5 mt-3 space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Add"><Icon name="lucide:plus" /></Button>
            <Button size="icon-sm" variant="outline" aria-label="Edit"><Icon name="lucide:pencil" /></Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </section>

      <!-- ── Segmented control ────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Segmented control</h2>
        <p class="type-body">
          The one way to switch between sibling views. Arrow keys move and select;
          the thumb slides on the house spring.
        </p>
        <div class="ios-card p-5 mt-3 space-y-4">
          <AppSegmentedControl v-model="segment" :items="segmentItems" label="Sections" />
          <AppSegmentedControl v-model="filterSegment" :items="filterItems" size="sm" label="Filter" />
          <AppSegmentedControl v-model="filterSegment" :items="filterItems" fill label="Filter (fill)" />
          <p class="type-meta">Selected: {{ segment }} / {{ filterSegment }}</p>
        </div>
      </section>

      <!-- ── Stats ────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Stat cards</h2>
        <p class="type-body">
          Direction and goodness are separate: dues going up is an increase and
          bad news.
        </p>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <AppStatCard
            v-for="s in stats"
            :key="s.label"
            v-bind="s"
            :loading="demoLoading"
            class="stagger-item"
          />
        </div>
      </section>

      <!-- ── Data table ───────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Data table</h2>
        <p class="type-body">
          Sortable headers, keyboard-reachable rows, and a built-in empty state.
          Collapses to labelled cards on phones. `row-class` tints a whole row
          when its state — not one of its cells — is what matters.
        </p>
        <div class="ios-card p-5 mt-3">
          <AppDataTable
            :columns="columns"
            :rows="showEmpty ? [] : members"
            :row-class="memberRowClass"
            :loading="demoLoading"
            empty-title="No members yet"
            empty-description="Invite the first owner to get started."
            empty-icon="lucide:users"
            @row-click="() => (sheetOpen = true)"
          >
            <template #toolbar>
              <Button size="sm" variant="outline" @click="showEmpty = !showEmpty">
                {{ showEmpty ? "Show rows" : "Show empty state" }}
              </Button>
            </template>
            <template #cell-balance="{ value }">
              <span :class="value < 0 ? 'text-destructive' : ''">
                {{ value < 0 ? `-$${Math.abs(value as number)}` : `$${value}` }}
              </span>
            </template>
          </AppDataTable>
        </div>
      </section>

      <!-- ── Empty states ─────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Empty states</h2>
        <div class="grid md:grid-cols-2 gap-4 mt-3">
          <div class="ios-card">
            <AppEmptyState
              title="No documents yet"
              description="Published documents appear here for every resident."
              icon="lucide:file-text"
            >
              <Button size="sm">Upload a document</Button>
            </AppEmptyState>
          </div>
          <div class="ios-card">
            <AppEmptyState
              variant="search"
              title="No matches"
              description="Try a different search or clear your filters."
            >
              <Button size="sm" variant="outline">Clear filters</Button>
            </AppEmptyState>
          </div>
        </div>
      </section>

      <!-- ── Forms ────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Forms</h2>
        <div class="ios-card p-5 mt-3 grid md:grid-cols-2 gap-5">
          <div class="space-y-3">
            <div>
              <Label class="type-label">Email</Label>
              <Input class="glass-field mt-1" placeholder="you@example.com" />
            </div>
            <div>
              <Label class="type-label">Note</Label>
              <Textarea class="glass-field mt-1" placeholder="Anything the board should know" />
            </div>
          </div>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="type-card">Email notifications</p>
                <p class="type-meta">Send a digest every morning.</p>
              </div>
              <Switch v-model="switchOn" />
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="type-card">Progress</p>
                <p class="type-meta">Storage used this month.</p>
              </div>
            </div>
            <Progress :model-value="62" />
          </div>
        </div>
      </section>

      <!-- ── Sheet ────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Bottom sheet</h2>
        <p class="type-body">
          The create/edit surface. Drag the grabber down to dismiss — past 100px
          or with a flick it goes, otherwise it springs back.
        </p>
        <div class="mt-3 content-column">
          <Button @click="sheetOpen = true">Open sheet</Button>
        </div>
      </section>

      <!-- ── Settings group ───────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Grouped rows</h2>
        <div class="ios-group mt-3">
          <button
            v-for="row in settingsRows"
            :key="row.label"
            class="w-full flex items-center gap-3 px-4 py-3 text-left ios-press"
          >
            <span class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
              :style="{
                backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
                color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
              }">
              <Icon :name="row.icon" class="w-4 h-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block type-card">{{ row.label }}</span>
              <span class="block type-meta truncate">{{ row.hint }}</span>
            </span>
            <Icon name="lucide:chevron-right" class="w-4 h-4 shrink-0 t-text-muted" />
          </button>
        </div>
      </section>

      <!-- ── Materials ────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Materials</h2>
        <p class="type-body">
          Glass belongs to floating chrome and cards — never to content
          backgrounds, and never stacked glass-on-glass.
        </p>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <div
            v-for="m in materials"
            :key="m.label"
            class="h-20 rounded-2xl grid place-items-center"
            :class="m.cls"
          >
            <code class="type-micro">{{ m.label }}</code>
          </div>
        </div>
      </section>
    </div>

    <AppBottomSheet v-model:open="sheetOpen" title="New announcement" description="Everyone in the community will see this.">
      <div class="space-y-3 pt-1">
        <div>
          <Label class="type-label">Subject</Label>
          <Input class="glass-field mt-1" placeholder="Pool closed Tuesday" />
        </div>
        <div>
          <Label class="type-label">Message</Label>
          <Textarea class="glass-field mt-1" placeholder="Add the details…" />
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="sheetOpen = false">Cancel</Button>
        <Button @click="sheetOpen = false">Post</Button>
      </template>
    </AppBottomSheet>
  </div>
</template>
