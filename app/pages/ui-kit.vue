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

// ── Charts ──────────────────────────────────────────────────────────────────
// Fixed sample data, not random: the point of the page is that a change to a
// chart primitive is visible as a DIFF, and a chart that redraws itself
// differently on every reload can't show you one.
const chartCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

const trendSeries = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened" },
];
const trendData = [
  { label: "Mon", sent: 120, opened: 58 },
  { label: "Tue", sent: 96, opened: 61 },
  { label: "Wed", sent: 141, opened: 84 },
  { label: "Thu", sent: 88, opened: 40 },
  { label: "Fri", sent: 132, opened: 77 },
  { label: "Sat", sent: 41, opened: 19 },
  { label: "Sun", sent: 36, opened: 22 },
];

const barSeries = [
  { key: "untouched", label: "Not started", color: "var(--chart-3)" },
  { key: "working", label: "In progress", color: "var(--chart-1)" },
  { key: "waiting", label: "Waiting", color: CHART_STATUS_VARS.muted },
];
const barData = [
  { label: "Maintenance", untouched: 6, working: 3, waiting: 1 },
  { label: "ARC", untouched: 2, working: 4, waiting: 2 },
  { label: "Violation", untouched: 1, working: 0, waiting: 0 },
  { label: "Complaint", untouched: 3, working: 1, waiting: 0 },
];

// One series, coloured per bar: the bucket IS the category, and the two oldest
// buckets ride the status tokens because red here means overdue, not "the
// fifth thing".
const ageingSeries = [{ key: "amount", label: "Outstanding" }];
const ageingData = [
  { label: "Not yet due", amount: 4200, color: CHART_STATUS_VARS.muted },
  { label: "1–30 days", amount: 2400, color: "var(--chart-3)" },
  { label: "31–60 days", amount: 900, color: CHART_STATUS_VARS.warn },
  { label: "61–90 days", amount: 450, color: CHART_STATUS_VARS.severe },
  { label: "90 days +", amount: 1250, color: CHART_STATUS_VARS.bad },
];

const donutSeries = [
  { key: "owner", label: "Owner-occupied", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenanted", color: "var(--chart-3)" },
  { key: "vacant", label: "Vacant", color: CHART_STATUS_VARS.muted },
];
const donutValues = { owner: 18, tenant: 9, vacant: 1 };

// Dates are built from a fixed anchor rather than "today", for the same
// no-moving-diff reason. The Today marker only draws when it falls in range,
// so it is present here by construction.
const timelineAnchor = new Date();
const dayOffset = (days: number) => {
  const d = new Date(timelineAnchor);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const timelineItems = [
  { id: "1", label: "Q1 board meeting", row: "Board", start: dayOffset(-150), color: "var(--chart-1)" },
  { id: "2", label: "Q2 board meeting", row: "Board", start: dayOffset(-60), color: "var(--chart-1)" },
  { id: "3", label: "Q3 board meeting", row: "Board", start: dayOffset(30), color: "var(--chart-3)" },
  { id: "4", label: "Annual meeting", row: "Annual", start: dayOffset(-120), color: "var(--chart-1)" },
  { id: "5", label: "Roof replacement", row: "Projects", start: dayOffset(-40), end: dayOffset(25), color: "var(--chart-4)" },
  { id: "6", label: "Lobby refresh", row: "Projects", start: dayOffset(45), end: dayOffset(95), color: "var(--chart-5)" },
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

      <!-- ── Charts ───────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Charts</h2>
        <p class="type-body">
          Every chart sits in an <code>AppChartCard</code>, which owns the three
          states a chart really has — loading, empty, drawn. Colour comes from
          <code>--chart-1…5</code>, declared light and dark, so a chart follows
          the theme without being told. A colour that MEANS something (overdue,
          failed) leaves the categorical ramp for the status tokens instead.
        </p>

        <div class="grid gap-4 lg:grid-cols-2 mt-3">
          <AppChartCard
            title="Email activity"
            hint="Sends and opens over the week"
            icon="lucide:line-chart"
            :loading="demoLoading"
            :height="200"
          >
            <AppChartTrend :data="trendData" :series="trendSeries" area :height="200" />
          </AppChartCard>

          <AppChartCard
            title="Open work by type"
            hint="Stacked — the parts sum to something worth knowing"
            icon="lucide:bar-chart-3"
            :loading="demoLoading"
            :height="200"
          >
            <AppChartBars :data="barData" :series="barSeries" stacked :height="200" />
          </AppChartCard>

          <AppChartCard
            title="Outstanding by age"
            hint="One series, coloured per bar, past-due on the status tokens"
            icon="lucide:hourglass"
            :loading="demoLoading"
            :height="200"
          >
            <AppChartBars
              :data="ageingData"
              :series="ageingSeries"
              :height="200"
              :format="chartCurrency"
              :color-by-row="(row) => String(row.color)"
              hide-legend
            />
          </AppChartCard>

          <AppChartCard
            title="Homes by occupancy"
            hint="Composition, with the whole in the hole"
            icon="lucide:pie-chart"
            :loading="demoLoading"
            :height="200"
          >
            <AppChartDonut
              :series="donutSeries"
              :values="donutValues"
              :height="200"
              center-label="homes"
            />
          </AppChartCard>

          <AppChartCard
            class="lg:col-span-2"
            title="The year in meetings and projects"
            hint="A Gantt strip — a moment gets a dot, a span gets a bar"
            icon="lucide:gantt-chart"
            :loading="demoLoading"
            :height="160"
          >
            <AppChartTimeline :items="timelineItems" :height="160" :row-height="30" />
          </AppChartCard>

          <AppChartCard
            title="Empty is a state"
            hint="Not an accident, and not bare axes"
            icon="lucide:chart-no-axes-column"
            :loading="false"
            empty
            empty-title="No dues history yet"
            empty-hint="Once a charge is paid, the months fill in."
            :height="200"
          />
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

        <!-- `compact` is for an empty state nested INSIDE a card or a table
             body, where the full-size version would tower over its container. -->
        <div class="ios-card mt-4">
          <div class="px-4 pt-4">
            <h3 class="type-card">Top documents</h3>
          </div>
          <AppEmptyState
            compact
            icon="lucide:download"
            title="No downloads yet"
            description="Documents residents open get counted here."
          />
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
