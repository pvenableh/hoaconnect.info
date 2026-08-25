<script setup lang="ts">
// Global site settings for the landing builder (a dialog): theme, the hero glass
// widget row + neighborhood data, community news, inquiry routing, community
// type, and the property-management callout. Everything here shapes the landing
// but lives outside the per-section blocks. Binds landing config + site state
// from the builder context. Ported from the old Widgets/Inquiries tabs.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LANDING_WIDGET_REGISTRY, type LandingWidgetKey } from "#core/shared/utils/landing";
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const open = defineModel<boolean>("open", { default: false });
const { landing, site } = useLandingBuilderContext();

const THEME_OPTIONS = [
  { value: "classic", label: "Classic", hint: "Warm paper, serif, editorial (1033 Lenox)" },
  { value: "modern", label: "Modern", hint: "Clean white, cyan, liquid glass" },
  { value: "luxury", label: "Luxury", hint: "Gallery white, brass, refined" },
] as const;

const MODE_OPTIONS = [
  { value: "light", label: "Light", icon: "lucide:sun" },
  { value: "dark", label: "Dark", icon: "lucide:moon" },
] as const;

const PALETTE_OPTIONS = [
  { value: "default", label: "Default", hint: "The style's own ink and accent" },
  { value: "gold", label: "Warm gold", hint: "Editorial gold and warm greys (1033 Lenox)" },
] as const;

const widgetDef = (k: LandingWidgetKey) => LANDING_WIDGET_REGISTRY.find((w) => w.key === k);
function moveWidget(i: number, dir: -1 | 1) {
  const arr = landing.value.widgets;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}

const addPlace = () => landing.value.places.items.push({ name: "", walk_time: "", distance: "" });
const removePlace = (i: number) => landing.value.places.items.splice(i, 1);

// Inquiry recipient mode (email vs a board member with an email on file).
const inquiryMode = ref<"email" | "member">("email");
watch(
  open,
  (v) => {
    if (!v) return;
    inquiryMode.value = site.boardMembers.some((b) => b.email === landing.value.inquiry.email)
      ? "member"
      : "email";
  },
  { immediate: true }
);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Site settings</DialogTitle>
        <DialogDescription>Theme, hero widgets, inquiries, and the property-management callout.</DialogDescription>
      </DialogHeader>

      <div class="space-y-6">
        <!-- Theme -->
        <section class="space-y-3">
          <h3 class="font-semibold t-text">Theme</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              v-for="opt in THEME_OPTIONS"
              :key="opt.value"
              type="button"
              class="text-left rounded-xl border p-3 transition-colors"
              :class="site.theme === opt.value ? 'border-primary ring-1 ring-primary' : 't-border hover:t-bg-subtle'"
              @click="site.theme = opt.value"
            >
              <div class="font-medium t-text text-sm">{{ opt.label }}</div>
              <div class="text-xs t-text-muted mt-0.5">{{ opt.hint }}</div>
            </button>
          </div>

          <!-- Light/dark is a property of the COMMUNITY's site, not of whoever is
               looking at it: there is no visitor-facing toggle on the landing, by
               design. A resident's own light/dark preference lives in their
               account and applies to the workspace. -->
          <div class="flex items-center gap-2 pt-1">
            <span class="text-xs t-text-muted mr-1">Appearance</span>
            <button
              v-for="opt in MODE_OPTIONS"
              :key="opt.value"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              :class="landing.mode === opt.value ? 'border-primary ring-1 ring-primary t-text' : 't-border t-text-muted hover:t-bg-subtle'"
              @click="landing.mode = opt.value"
            >
              <Icon :name="opt.icon" class="w-3.5 h-3.5" />
              {{ opt.label }}
            </button>
          </div>
          <p class="text-xs t-text-muted">
            Applies to your public site for everyone who visits it.
          </p>

          <!-- Palette sits apart from the style because it is orthogonal: any of
               the three styles can wear it. -->
          <div class="flex items-center gap-2 pt-1">
            <span class="text-xs t-text-muted mr-1">Palette</span>
            <button
              v-for="opt in PALETTE_OPTIONS"
              :key="opt.value"
              type="button"
              class="text-left rounded-lg border px-3 py-1.5 transition-colors"
              :class="landing.palette === opt.value ? 'border-primary ring-1 ring-primary t-text' : 't-border t-text-muted hover:t-bg-subtle'"
              @click="landing.palette = opt.value"
            >
              <span class="block text-xs font-medium">{{ opt.label }}</span>
              <span class="block text-[11px] t-text-muted">{{ opt.hint }}</span>
            </button>
          </div>

          <label class="flex items-start gap-3 pt-2 cursor-pointer">
            <Switch v-model="landing.hero_cta" />
            <span>
              <span class="block text-sm font-medium t-text">Hero sign-in buttons</span>
              <span class="block text-xs t-text-muted">
                Login, request access and inquire, under the tagline. Turn off for a
                purely typographic hero — the account icon in the top bar still gets
                residents in.
              </span>
            </span>
          </label>
        </section>

        <!-- Community type -->
        <section class="space-y-2">
          <h3 class="font-semibold t-text">Community type</h3>
          <select
            v-model="site.type"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Residential (default)</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
          <p class="text-xs t-text-muted">
            Sets the wording — residential says "Residents" / "Households"; commercial says "Members".
          </p>
        </section>

        <!-- Hero widgets -->
        <section class="space-y-3">
          <div>
            <h3 class="font-semibold t-text">Hero widgets</h3>
            <p class="text-sm t-text-muted mt-0.5">Frosted info cards over the hero. Toggle and reorder; the row scrolls if it overflows.</p>
          </div>
          <div v-for="(w, i) in landing.widgets" :key="w.key" class="flex items-center gap-3 rounded-xl border t-border p-2.5">
            <div class="flex flex-col">
              <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === 0" @click="moveWidget(i, -1)">
                <Icon name="lucide:chevron-up" class="w-4 h-4" />
              </button>
              <button class="t-text-muted hover:t-text disabled:opacity-30" :disabled="i === landing.widgets.length - 1" @click="moveWidget(i, 1)">
                <Icon name="lucide:chevron-down" class="w-4 h-4" />
              </button>
            </div>
            <Icon :name="widgetDef(w.key)?.icon || 'lucide:square'" class="w-5 h-5 t-text-accent" />
            <div class="flex-1 min-w-0">
              <div class="font-medium t-text text-sm">{{ widgetDef(w.key)?.label || w.key }}</div>
              <div class="text-xs t-text-muted truncate">{{ widgetDef(w.key)?.description }}</div>
            </div>
            <Switch v-model="w.enabled" />
          </div>
        </section>

        <!-- Neighborhood -->
        <section class="space-y-3">
          <h3 class="font-semibold t-text">Neighborhood</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </section>

        <!-- Community news -->
        <section class="flex items-center justify-between gap-4">
          <div>
            <h3 class="font-semibold t-text">Community news</h3>
            <p class="text-sm t-text-muted mt-0.5">Show your most recent sent announcements on the landing. Off by default.</p>
          </div>
          <Switch v-model="landing.show_announcements" />
        </section>

        <!-- Inquiries -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold t-text">Inquiry form</h3>
              <p class="text-sm t-text-muted mt-0.5">Let visitors submit purchase / rental / general interest.</p>
            </div>
            <Switch v-model="landing.inquiry.enabled" />
          </div>
          <template v-if="landing.inquiry.enabled">
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
            <div v-if="inquiryMode === 'email'" class="space-y-1.5">
              <Label>Email address</Label>
              <Input v-model="landing.inquiry.email" type="email" placeholder="info@yourbuilding.com" />
              <p class="text-xs t-text-muted">Leave blank to use your community contact email.</p>
            </div>
            <div v-else class="space-y-1.5">
              <Label>Board member</Label>
              <select
                v-model="landing.inquiry.email"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a board member…</option>
                <option v-for="b in site.boardMembers" :key="b.id" :value="b.email">{{ b.name }} — {{ b.email }}</option>
              </select>
              <p v-if="!site.boardMembers.length" class="text-xs t-text-muted">
                No board members with an email on file. Add them under Members, or use an email address.
              </p>
            </div>
          </template>
        </section>

        <!-- Property management -->
        <section class="space-y-3">
          <div>
            <h3 class="font-semibold t-text">Property management</h3>
            <p class="text-sm t-text-muted mt-0.5">Surface your management company on the landing (from the primary active Management vendor).</p>
          </div>
          <div v-if="!site.hasManagementVendor" class="rounded-lg border border-warning/30 bg-warning/10 t-text text-sm px-3 py-2">
            No active management vendor found yet. Add one under Vendors to use these options.
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium t-text text-sm">Feature on landing</p>
              <p class="text-xs t-text-muted">Adds a "Professionally managed by…" callout and footer line.</p>
            </div>
            <Switch v-model="landing.feature_pm" :disabled="!site.hasManagementVendor" />
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium t-text text-sm">Use manager's contact in "Get in Touch"</p>
              <p class="text-xs t-text-muted">Shows the manager's phone/email in the contact section.</p>
            </div>
            <Switch v-model="landing.pm_contact" :disabled="!site.hasManagementVendor" />
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
