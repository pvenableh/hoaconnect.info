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
import { visibleVerbs } from "#core/shared/create-verbs";
import { HELPER_AREA_KEYS } from "#core/shared/roles/area-grants";
import { HELPER_AREA_COPY } from "#core/shared/roles/helper-area-copy";
import {
  TINT_SWATCHES,
  accentCssVars,
  resolveTint,
  swatchAccent,
  type TintSwatchId,
} from "#core/shared/branding/accent";

definePageMeta({ layout: false });

// Every create verb, as an admin with every module on would see them.
const kitVerbs = visibleVerbs({ isAdmin: true, isEnabled: () => true });
// "Helps with" (docs/spec-delegation.md): the switches DelegationHelperAreaSwitches
// renders on a member's sheet and a team page, here with local state.
const kitHelps = ref<Record<string, boolean>>({ projects: true });
useHead({ title: "UI Kit — HOA Connect design system" });

// The showcase renders the real workspace theme, so what you see here is what
// admin and auth actually get — that is the whole point of it as a contract.
const appearance = useWorkspaceAppearance();

// The tint, previewed through the REAL resolver (resolveTint, accent.ts): the
// same six swatches and the same Tint switch a person has in Appearance, with
// a stand-in community colour for the first swatch. Glass (rims, halos, the
// active thumb), ink (buttons, links, focus rings) and the hover move
// together, exactly as they do in the app. Nothing here is saved: the page
// writes the variables itself and hands the person's own tint back on leave.
const KIT_COMMUNITY = "#B8956C";
const kitTintOn = ref(true);
const kitSwatch = ref<TintSwatchId>("community");
const kitSwatches = computed(() =>
  TINT_SWATCHES.map((s) => {
    const ink = swatchAccent(s.id, KIT_COMMUNITY).ink[appearance.isDark.value ? "dark" : "light"];
    return { id: s.id, label: s.id === "community" ? "Community (stand-in)" : s.label, color: `hsl(${ink.h} ${ink.s}% ${ink.l}%)` };
  }),
);

// Written onto <html>, exactly where the appearance layer writes them — NOT onto
// this page's root div. Custom properties resolve at their DECLARATION site, and
// `--primary` is declared on `html` as `var(--theme-accent-primary)`; overriding
// that variable on a descendant re-tints the glass but leaves every button and
// focus ring on the old colour. Writing to <html> is both correct and the honest
// test, since it exercises the real code path.
watchEffect(() => {
  if (!import.meta.client) return;
  const t = resolveTint({ on: kitTintOn.value, swatch: kitSwatch.value }, appearance.isDark.value ? "dark" : "light", KIT_COMMUNITY);
  const html = document.documentElement;
  for (const [k, v] of Object.entries(accentCssVars(t.glass, t.ink, t.inkHover))) html.style.setProperty(k, v);
  html.dataset.tint = t.on ? "on" : "off";
  if (t.ground) html.style.setProperty("--glass-solid", t.ground);
  else html.style.removeProperty("--glass-solid");
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

// ── Resource index ──────────────────────────────────────────────────────────
// The scaffold (docs/spec-resource-scaffold.md) on the same members: a real
// useResource handle with a local loader, since the kit has no org. Row click
// opens the sheet here; on a real page it opens the resource's panel.
const kitResourceEmpty = ref(false);
const kitResource = useResource<(typeof members)[number]>(
  {
    key: "kit-members",
    rowKey: (m) => String(m.id),
    load: async () => (kitResourceEmpty.value ? [] : members),
    search: (m) => [m.name, m.unit, m.type],
    statuses: [
      { value: "all", label: "All" },
      { value: "owners", label: "Owners", match: (m) => m.type === "Owner" },
      { value: "tenants", label: "Tenants", match: (m) => m.type === "Tenant" },
    ],
    filters: {
      balance: { initial: "any", match: (m, v) => (v === "owing" ? m.balance > 0 : m.balance <= 0) },
    },
  },
  { orgId: ref("kit") },
);
const toggleKitResourceEmpty = async () => {
  kitResourceEmpty.value = !kitResourceEmpty.value;
  await kitResource.refresh();
};

// ── Grouped index ───────────────────────────────────────────────────────────
// The same scaffold with `group` and `groups`: sticky headers per section. Three
// groups of six, so there is enough to scroll for the headers to show they stick.
const kitJobs = [
  ["finance", "Sends dues statements", "Monthly"], ["finance", "Deposits funds", "Weekly"],
  ["finance", "Reconciles bank statements", "Monthly"], ["finance", "Prepares the annual budget", "Annual"],
  ["finance", "Pays vendors", "Continuous"], ["finance", "Files the tax return", "Annual"],
  ["building", "Walks the building", "Weekly"], ["building", "Pest control", "Monthly"],
  ["building", "Roof and drainage checks", "Quarterly"], ["building", "Landscaping", "Weekly"],
  ["building", "Pool and courtyard", "Weekly"], ["building", "Trash and recycling", "Weekly"],
  ["safety", "Elevator service", "Monthly"], ["safety", "Fire inspections", "Annual"],
  ["safety", "Backflow inspection", "Annual"], ["safety", "Hurricane prep", "Annual"],
  ["safety", "Keys and fobs", "Continuous"], ["safety", "After-hours emergencies", "As needed"],
].map(([section, job, cadence], i) => ({
  id: i + 1,
  section: section!,
  job: job!,
  cadence: cadence!,
  holder: ["Treasurer", "Acme Elevator & Fire Protection Services", "Unassigned", "City of Miami Beach Building Department"][i % 4]!,
}));
const kitJobColumns = [
  { key: "job", label: "Job", sortable: true },
  { key: "holder", label: "Who" },
  { key: "cadence", label: "Cadence", hideOnMobile: true },
];
// Two lines per record, the same at every width: for rows that carry something long.
const kitStacked = ref(false);
const kitStack = { primary: "job", meta: ["holder", "cadence"], bare: ["holder"] };
const kitJobGroups = [
  { key: "finance", label: "Finance" },
  { key: "building", label: "Building" },
  { key: "safety", label: "Mechanical and safety" },
];
const kitGrouped = useResource<(typeof kitJobs)[number]>(
  {
    key: "kit-grouped",
    rowKey: (r) => String(r.id),
    load: async () => kitJobs,
    search: (r) => [r.job, r.cadence],
  },
  { orgId: ref("kit") },
);

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

// ── Phase 1a primitives ─────────────────────────────────────────────────────
// Overlays: every one of these renders the glass material with the accent
// focus ring; the browser check (scripts in the Session log) asserts it here.
const kitSelect = ref("owner");
const { confirm } = useConfirm();
const confirmResult = ref("");
const askDelete = async () => {
  const ok = await confirm({
    title: "Delete unit 4B?",
    body: "Its residents stay in the directory; only their unit link is removed.",
    destructive: true,
  });
  confirmResult.value = ok ? "Deleted" : "Kept";
};

// Same strings the raw inputs emitted — the v-model contract the sweep relies on.
const dueDate = ref("2026-11-03");
const meetingAt = ref("2026-11-12T19:30");

const comboValue = ref<string>();
const comboOptions = ["Dana Whitfield", "Marcus Lee", "Priya Raman", "Tom Alvarez"];

const visibleColumns = ref<string[]>(["unit", "balance"]);
const overdueOnly = ref(false);
const kitPage = ref(2);
const sizedSheetOpen = ref(false);

// Spotlight with local sources: the real component, no session needed.
const spotlight = useSpotlight();
const kitDestinations = [
  { key: "members", label: "Members", description: "Owners, tenants, and their contact details.", icon: "lucide:users-round", to: "/ui-kit?go=members", section: "Go to" },
  { key: "units", label: "Units", description: "Units, addresses, and occupancy.", icon: "lucide:door-closed", to: "/ui-kit?go=units", section: "Go to" },
  { key: "documents", label: "Documents", description: "The curated, published document library.", icon: "lucide:file-text", to: "/ui-kit?go=documents", section: "Go to" },
];
const kitSearch = async (q: string) => {
  const needle = q.toLowerCase();
  const items = members
    .filter((m) => m.name.toLowerCase().includes(needle) || m.unit.toLowerCase() === needle)
    .map((m) => ({ id: String(m.id), name: m.name, description: `Unit ${m.unit} · ${m.type}`, to: `/ui-kit?member=${m.id}` }));
  return items.length ? [{ key: "members" as const, label: "Members", icon: "lucide:users-round", items }] : [];
};

const materials = [
  { cls: "glass-surface", label: "glass-surface" },
  { cls: "glass-surface glass-surface--strong", label: "--strong" },
  { cls: "ios-card", label: "ios-card (solid)" },
  { cls: "ios-card card-attention", label: "card-attention" },
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
          <p class="type-micro">HOA Connect</p>
          <h1 class="type-display">Design system</h1>
          <p class="type-body">
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

      <!-- ── Tint ────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Tint</h2>
        <p class="type-body">
          Each person chooses Tint on or off in Appearance. Off: clear, neutral
          glass, and buttons in the community's colour. On: the glass carries a
          colour and is a little more opaque, picked from this fixed row — the
          community's colour first. Every fixed swatch is graded in light and
          dark by <code>audit:contrast-pairs</code>; the community's is graded
          across the hue wheel. Resolved by <code>resolveTint()</code>.
        </p>
        <div class="flex flex-wrap items-center gap-3 mt-3">
          <AppSegmentedControl
            :model-value="kitTintOn ? 'on' : 'off'"
            :items="[{ value: 'on', label: 'Tint on' }, { value: 'off', label: 'Tint off' }]"
            size="sm"
            label="Tint"
            @update:model-value="(v) => (kitTintOn = v === 'on')"
          />
          <template v-if="kitTintOn">
            <!-- allow-raw-button: a colour swatch in the kit's tint preview -->
            <button
              v-for="sw in kitSwatches"
              :key="sw.id"
              type="button"
              class="w-7 h-7 rounded-full ios-press"
              :class="kitSwatch === sw.id ? 'ring-2 ring-offset-2 ring-offset-transparent' : ''"
              :style="{ backgroundColor: sw.color }"
              :title="sw.label"
              :aria-label="sw.label"
              :aria-pressed="kitSwatch === sw.id"
              @click="kitSwatch = sw.id"
            />
            <span class="type-meta">{{ kitSwatches.find((s) => s.id === kitSwatch)?.label }}</span>
          </template>
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
            <span :class="[t.cls]">The quick brown fox</span>
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
          <!-- T3 / T4 — docs/button-type-case-system.md. -->
          <div class="flex flex-wrap items-center gap-2" data-kit="action-buttons">
            <ActionButton icon="lucide:plus">Add Unit</ActionButton>
            <ActionButton icon="lucide:reply" variant="primary">Reply</ActionButton>
            <ActionButton icon="lucide:trash-2" variant="destructive">Remove</ActionButton>
            <ActionButton icon="lucide:filter" size="md" :pressed="overdueOnly" @click="overdueOnly = !overdueOnly">
              Overdue Only
            </ActionButton>
            <ActionButton icon="lucide:settings" circle title="Settings" />
            <span class="type-meta">T4:</span>
            <ActionButton icon="lucide:x" size="xs" title="Dismiss" />
            <ActionButton icon="lucide:pencil" size="xs" variant="primary" title="Edit" />
            <ActionButton icon="lucide:trash-2" size="xs" variant="destructive" title="Delete" />
          </div>
          <div class="flex flex-wrap items-center gap-2" data-kit="badges">
            <AppBadge>Active</AppBadge>
            <AppBadge variant="secondary">Draft</AppBadge>
            <AppBadge variant="outline">Suggested by AI</AppBadge>
            <AppBadge variant="destructive">Bounced</AppBadge>
          </div>
        </div>
      </section>

      <!-- ── Overlays ─────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Overlays</h2>
        <p class="type-body">
          Every overlay is the strong glass. Popovers and menus are floating
          chrome (an opaque elevation step); dialogs and sheets sit over the
          accent-tinted frosted scrim. Confirmations go through
          <code>useConfirm()</code>, never <code>window.confirm()</code>.
        </p>
        <div class="ios-card p-5 mt-3 flex flex-wrap items-center gap-2" data-kit="overlays">
          <Dialog>
            <DialogTrigger as-child>
              <Button variant="outline" data-kit-open="dialog">Dialog</Button>
            </DialogTrigger>
            <AppDialogContent>
              <DialogHeader>
                <DialogTitle>Rename unit</DialogTitle>
                <DialogDescription>Residents see the new name everywhere.</DialogDescription>
              </DialogHeader>
              <Input placeholder="Unit 4B" />
              <DialogFooter>
                <DialogClose as-child>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button>Save</Button>
              </DialogFooter>
            </AppDialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger as-child>
              <Button variant="outline" data-kit-open="sheet">Sheet</Button>
            </SheetTrigger>
            <AppSheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow the member list.</SheetDescription>
              </SheetHeader>
            </AppSheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger as-child>
              <Button variant="outline" data-kit-open="popover">Popover</Button>
            </PopoverTrigger>
            <AppPopoverContent class="w-64">
              <p class="type-card">Unit 4B</p>
              <p class="helper-text">Two owners, one vehicle on file.</p>
            </AppPopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" data-kit-open="dropdown">Menu</Button>
            </DropdownMenuTrigger>
            <AppDropdownMenuContent>
              <DropdownMenuLabel>Unit 4B</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </AppDropdownMenuContent>
          </DropdownMenu>

          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="outline" data-kit-open="tooltip">Tooltip</Button>
              </TooltipTrigger>
              <AppTooltipContent>Shown on hover and on focus</AppTooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Select v-model="kitSelect">
            <AppSelectTrigger class="w-36" data-kit-open="select">
              <SelectValue placeholder="Type" />
            </AppSelectTrigger>
            <AppSelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="tenant">Tenant</SelectItem>
            </AppSelectContent>
          </Select>

          <Button variant="destructive" data-kit-open="confirm" @click="askDelete">Delete Unit…</Button>
          <span v-if="confirmResult" class="type-meta" data-kit="confirm-result">{{ confirmResult }}</span>
        </div>
      </section>

      <!-- ── Spotlight ────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Spotlight</h2>
        <p class="type-body">
          ⌘K / Ctrl-K anywhere in the workspace. Destinations are instant; records
          come from <code>/api/search</code>, scoped to the organization and to
          what your role may see. Here it searches the sample members below.
        </p>
        <div class="mt-3">
          <Button variant="outline" data-kit-open="spotlight" @click="spotlight.open()">
            <Icon name="lucide:search" />
            Search
          </Button>
        </div>
      </section>

      <!-- ── Navigation ───────────────────────────────────────────────── -->
      <section data-kit="nav-system">
        <h2 class="type-section">Navigation</h2>
        <p class="type-body">
          One shell for every workspace page. The dock carries the apps at every
          width; below md it keeps four (the open app always among them) and an
          Apps chip, which opens the rest and the create verbs in a card as wide
          as the dock. The header is the community switcher, its name, and
          + New, Search and the avatar: notifications, messages and the
          assistant live in the avatar's menu, under one badge. Channels runs
          inside the shell as an immersive page (full height, no footer, dock
          kept).
        </p>

        <div class="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <p class="type-micro">The dock on a phone — below md</p>
            <p class="helper-text mb-3">
              Four of the dock's apps (useDockApps) and Apps. The card above the
              pill lists the rest, four across, with their badges, then Create;
              its chips stagger in on open (<code>apps-chip-in</code>). Apps
              shows a dot when an app in the card has something unread. Resize
              this page under 768px to see it on the real dock.
            </p>
          </div>

          <div>
            <p class="type-micro">Create — the "+ New" pill and Spotlight</p>
            <p class="helper-text mb-3">
              Declared once (<code>core/shared/create-verbs.ts</code>) and gated
              there: admins of the org being viewed, module on. Each opens the
              page's own form via <code>?new=</code>.
            </p>
            <ul class="glass-surface glass-surface--strong rounded-2xl p-2 grid grid-cols-2 gap-0.5" data-kit="create-verbs">
              <li v-for="v in kitVerbs" :key="v.id" class="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                <Icon :name="v.icon" class="size-4 text-muted-foreground" />
                <span class="text-sm">{{ v.label }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="mt-6">
          <p class="type-micro">Page title</p>
          <p class="helper-text mb-3">
            Pages register their title with <code>&lt;AppPageHeader&gt;</code>; the
            shell's outlet renders it above the page and keeps it across
            navigation. Scrolled under the bar, the bar's centre carries it and
            the bar earns its hairline. Here, with no shell, it renders inline:
          </p>
          <AppPageHeader eyebrow="Records" title="Meetings" description="Agendas, minutes, RSVPs, and votes." />
        </div>

        <div class="mt-2">
          <p class="type-micro">Page motion</p>
          <ul class="helper-text list-disc list-inside space-y-1">
            <li><strong>Across dock apps</strong> — a full slide in dock order (<code>page-forward</code> / <code>page-back</code>).</li>
            <li><strong>Across SubNav pills</strong> — the floor strip, a short slide in pill order (<code>floor-forward</code> / <code>floor-back</code>).</li>
            <li><strong>Into a record and back</strong> — the navigation-stack push and pop.</li>
            <li><strong>Same page</strong> — a quick fade. Reduced motion: all instant.</li>
          </ul>
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

      <!-- ── Resource index ───────────────────────────────────────────── -->
      <section data-kit="resource-index">
        <h2 class="type-section">Resource index</h2>
        <p class="type-body">
          The index of plan §2.3, by construction: count, search, the one
          segmented status filter, any further filter as a select, the rows,
          and an empty state that offers the create action. A `#bulk` slot adds
          checkboxes and a selection bar. Rows open the resource's panel.
        </p>
        <div class="mt-3 space-y-3">
          <Button size="sm" variant="outline" @click="toggleKitResourceEmpty">
            {{ kitResourceEmpty ? "Show Rows" : "Show Empty State" }}
          </Button>
          <AppResourceIndex
            :resource="kitResource"
            :columns="columns"
            :noun="{ one: 'member', other: 'members' }"
            :row-class="memberRowClass"
            can-create
            create-label="New Member"
            search-placeholder="Search name or unit"
            empty-description="Invite the first owner to get started."
            empty-icon="lucide:users"
            @create="sheetOpen = true"
            @open="sheetOpen = true"
          >
            <template #filters>
              <Select v-model="kitResource.filters.balance">
                <AppSelectTrigger class="w-36 rounded-full" aria-label="Balance">
                  <SelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <SelectItem value="any">Any balance</SelectItem>
                  <SelectItem value="owing">Owing</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </AppSelectContent>
              </Select>
            </template>
            <template #cell-balance="{ value }">
              <span :class="value < 0 ? 'text-destructive' : ''">
                {{ value < 0 ? `-$${Math.abs(value as number)}` : `$${value}` }}
              </span>
            </template>
            <template #bulk="{ rows }">
              <Button size="sm" variant="outline" :disabled="!rows.length">Message Selected</Button>
            </template>
          </AppResourceIndex>
        </div>
      </section>

      <!-- ── Grouped index ────────────────────────────────────────────── -->
      <section data-kit="grouped-index">
        <h2 class="type-section">Grouped index</h2>
        <p class="type-body">
          `group` (a row's section key) and `groups` (the sections, in order, with
          their labels) put the rows under sticky headers, so an index with a
          natural set of sections, like the responsibilities register, reads by
          section. Scroll: each header holds under the app bar until the next
          one replaces it. Search and sort work inside the sections, and a
          section with no rows left disappears. `stack` draws each record as two
          lines (the primary column, then the rest inline) at every width, for
          rows that carry something long: toggle it above.
        </p>
        <div class="mt-3 space-y-3">
          <Button size="sm" variant="outline" @click="kitStacked = !kitStacked">
            {{ kitStacked ? "Show Columns" : "Show Stacked Rows" }}
          </Button>
          <AppResourceIndex
            :resource="kitGrouped"
            :columns="kitJobColumns"
            :noun="{ one: 'job', other: 'jobs' }"
            :group="(r) => r.section"
            :groups="kitJobGroups"
            :stack="kitStacked ? kitStack : undefined"
            search-placeholder="Search jobs"
          />
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

        <!-- The teaching form: a first-run screen gets the 1-2-3 and a CTA that
             does the thing, instead of a dead end. -->
        <div class="ios-card mt-4" data-kit="empty-teaching">
          <AppEmptyState
            icon="lucide:door-closed"
            title="Add your community's units"
            description="Units are what dues, requests and residents hang off."
            :steps="['Add each unit, or import a spreadsheet', 'Link owners and tenants to their units', 'Invite residents to sign in']"
            footnote="You can rename and renumber units later."
          >
            <template #actions>
              <Button size="sm">Add Unit</Button>
              <Button size="sm" variant="outline">Import CSV</Button>
            </template>
          </AppEmptyState>
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
              <AppTextarea class="glass-field mt-1" placeholder="Anything the board should know" />
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

        <!-- Two edges, not three: the card is the container, the field is the
             second edge, and each group between them is a flat .form-section. -->
        <div class="ios-card p-5 mt-4" data-kit="form-sections">
          <section class="form-section">
            <h3 class="form-section__title type-card">Schedule</h3>
            <p class="form-section__hint">DateInput keeps the raw input's v-model string.</p>
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <Label class="type-label" for="kit-due">Due date</Label>
                <DateInput id="kit-due" v-model="dueDate" class="mt-1" data-kit="date-input" />
                <p class="helper-text mt-1">v-model: <code>{{ dueDate || '""' }}</code></p>
              </div>
              <div>
                <Label class="type-label" for="kit-meeting">Meeting starts</Label>
                <DateTimeInput id="kit-meeting" v-model="meetingAt" class="mt-1" data-kit="datetime-input" />
                <p class="helper-text mt-1">v-model: <code>{{ meetingAt || '""' }}</code></p>
              </div>
            </div>
          </section>
          <section class="form-section">
            <h3 class="form-section__title type-card">Pickers</h3>
            <div class="flex flex-wrap items-center gap-4">
              <AppCombobox
                v-model="comboValue"
                :options="comboOptions"
                placeholder="Assign to…"
                empty-text="No one by that name."
                class="w-64"
                data-kit="combobox"
              />
              <AppToggleGroup v-model="visibleColumns" type="multiple" size="sm" data-kit="toggle-group">
                <AppToggleGroupItem value="unit" aria-label="Unit column">Unit</AppToggleGroupItem>
                <AppToggleGroupItem value="type" aria-label="Type column">Type</AppToggleGroupItem>
                <AppToggleGroupItem value="balance" aria-label="Balance column">Balance</AppToggleGroupItem>
              </AppToggleGroup>
            </div>
          </section>
          <section class="form-section">
            <h3 class="form-section__title type-card">Pagination</h3>
            <AppPagination v-model:page="kitPage" :items-per-page="20" :total="180" :sibling-count="1" show-edges />
          </section>
        </div>
      </section>

      <!-- ── Sheet ────────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Bottom sheet</h2>
        <p class="type-body">
          The create/edit surface. Drag the grabber down to dismiss — past 100px
          or with a flick it goes, otherwise it springs back.
        </p>
        <div class="mt-3">
          <Button @click="sheetOpen = true">Open sheet</Button>
          <Button variant="outline" class="ml-2" @click="sizedSheetOpen = true">Open wide (size="lg")</Button>
        </div>
        <p class="helper-text mt-2">
          Below md it is the sheet; at md and up the same component presents as a
          centred dialog, focus-trapped either way.
        </p>
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
            <span
class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
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

      <!-- ── Helps with (delegation) ─────────────────────────────────── -->
      <section data-kit="helper-areas">
        <h2 class="type-section">Helps with</h2>
        <p class="type-body">
          What a helper or committee can work on. On a member's sheet and a team page
          (DelegationHelperAreaSwitches); admins only, and every change is in the ledger.
        </p>
        <div class="mt-3 grid gap-3 border-t t-border pt-4">
          <div class="divide-y divide-[var(--theme-border-light)]">
            <div v-for="k in HELPER_AREA_KEYS" :key="k" class="flex items-center justify-between gap-3 py-2.5">
              <div class="grid gap-0.5 pr-4">
                <Label :for="`kit-helper-${k}`" class="text-sm font-medium">{{ HELPER_AREA_COPY[k].label }}</Label>
                <p class="text-xs t-text-muted">{{ HELPER_AREA_COPY[k].desc }}</p>
              </div>
              <Switch :id="`kit-helper-${k}`" v-model="kitHelps[k]" />
            </div>
          </div>
          <p>
            <span class="rounded-full t-bg-subtle px-2 py-0.5 type-micro t-text-secondary">Helps · Projects</span>
          </p>
        </div>
      </section>

      <!-- ── Posting paused (restricted members) ─────────────────────── -->
      <section data-kit="posting-paused">
        <h2 class="type-section">Posting paused</h2>
        <p class="type-body">
          A member whose posting an admin paused (docs/spec-member-restrictions.md). The banner rides every
          page of that community (RestrictionsPostingPausedBanner); each composer, reaction bar and Report
          gives way to one line; the admin sees a chip on the Members list and the Posting section of the
          member's sheet (RestrictionsPostingPause). Static here: the real ones read the member's own pause.
        </p>
        <div class="mt-3 grid gap-3">
          <div class="border-b t-border bg-warning/15 px-4 py-3" role="status">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex items-start gap-3">
                <Icon name="i-lucide-message-square-off" class="mt-0.5 size-5 shrink-0 text-warning" />
                <div class="grid gap-0.5">
                  <p class="text-sm font-medium t-text">Posting is paused in 1033 Lenox until December 18, 2026</p>
                  <p class="text-sm t-text-secondary">Please keep the building chat civil. The board will review this in a month.</p>
                  <p class="text-xs t-text-muted">You can still read everything, pay dues, and send requests to the board.</p>
                </div>
              </div>
              <Button variant="outline" size="sm">Contact the board</Button>
            </div>
          </div>
          <p class="ios-card card-attention p-3 text-sm t-text-muted">
            Your posting is paused here until December 18, 2026. You can still read, pay dues and send requests to the board.
          </p>
          <p>
            <span class="rounded-full bg-warning/15 px-2 py-0.5 type-micro text-warning">Posting paused</span>
          </p>
        </div>
      </section>

      <!-- ── Materials ────────────────────────────────────────────────── -->
      <section>
        <h2 class="type-section">Materials</h2>
        <p class="type-body">
          Glass is the floating layer only: the top bar, the dock, section
          pills, sheets, menus, toasts and floating controls. Tables, cards of
          content and form fields are solid, and glass never sits on glass. A
          card that needs attention takes <code>card-attention</code> — a faint
          warning tint across the card — never a strip down one side.
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

    <AppSpotlight :destinations="kitDestinations" :search-fn="kitSearch" />

    <AppBottomSheet v-model:open="sizedSheetOpen" size="lg" title="Invite members" description="Each person gets an email with a sign-in link.">
      <AppTextarea placeholder="one@example.com, two@example.com" />
      <template #footer>
        <Button variant="ghost" @click="sizedSheetOpen = false">Cancel</Button>
        <Button @click="sizedSheetOpen = false">Send Invites</Button>
      </template>
    </AppBottomSheet>

    <AppBottomSheet v-model:open="sheetOpen" title="New announcement" description="Everyone in the community will see this.">
      <div class="space-y-3 pt-1">
        <div>
          <Label class="type-label">Subject</Label>
          <Input class="glass-field mt-1" placeholder="Pool closed Tuesday" />
        </div>
        <div>
          <Label class="type-label">Message</Label>
          <AppTextarea class="glass-field mt-1" placeholder="Add the details…" />
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="sheetOpen = false">Cancel</Button>
        <Button @click="sheetOpen = false">Post</Button>
      </template>
    </AppBottomSheet>
  </div>
</template>
