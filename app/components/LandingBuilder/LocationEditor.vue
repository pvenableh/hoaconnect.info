<script setup lang="ts">
// Inline editor for the Location section (single instance; lives on
// landing.location). Map + walk/bike/transit scores + curated nearby places +
// editorial stats + walk-time band + the "Active Living" lifestyle gallery.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { landing, builder } = useLandingBuilderContext();
const loc = computed(() => builder.ensureLocation());

const addHighlight = () => loc.value.highlights.push({ name: "", walk_time: "", distance: "" });
const removeHighlight = (i: number) => loc.value.highlights.splice(i, 1);
const addStat = () => loc.value.stats.push({ value: "", unit: "", label: "" });
const removeStat = (i: number) => loc.value.stats.splice(i, 1);
const addWalkTime = () => loc.value.walk_times.push({ minutes: "", label: "" });
const removeWalkTime = (i: number) => loc.value.walk_times.splice(i, 1);

function ensureLifestyle() {
  if (!loc.value.lifestyle) loc.value.lifestyle = { eyebrow: "", heading: "", items: [] };
  return loc.value.lifestyle;
}
const addLifestyleItem = () =>
  ensureLifestyle().items.push({ icon: "", title: "", desc: "", image: null });
const removeLifestyleItem = (i: number) => loc.value.lifestyle?.items.splice(i, 1);
</script>

<template>
  <div v-if="landing.location" class="space-y-4">
    <p class="text-xs t-text-muted">
      Map, walk/bike/transit scores, and curated nearby places. Scores and places left blank fall
      back to your Neighborhood settings. The map appears once your address has been geocoded.
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
      <Button variant="outline" size="sm" @click="addHighlight">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add place
      </Button>
    </div>
    <div v-for="(p, j) in landing.location.highlights" :key="j" class="flex items-center gap-2">
      <Input v-model="p.name" placeholder="The Beach" class="flex-1" />
      <Input v-model="p.walk_time" placeholder="6 min" class="w-24" />
      <Input v-model="p.distance" placeholder="0.5 mi" class="w-24" />
      <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeHighlight(j)">
        <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
      </Button>
    </div>

    <div class="flex items-center justify-between">
      <Label>Editorial stats</Label>
      <Button variant="outline" size="sm" @click="addStat">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add stat
      </Button>
    </div>
    <div v-for="(s, k) in landing.location.stats" :key="k" class="flex items-center gap-2">
      <Input v-model="s.value" placeholder="12" class="w-20" />
      <Input v-model="s.unit" placeholder="min" class="w-24" />
      <Input v-model="s.label" placeholder="to the beach" class="flex-1" />
      <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeStat(k)">
        <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
      </Button>
    </div>

    <!-- Walk-time number band -->
    <div class="flex items-center justify-between pt-2 border-t t-border">
      <div>
        <Label>Walk-time band</Label>
        <p class="text-xs t-text-muted">Big "N min — to X" tiles (e.g. 6 / to the Ocean).</p>
      </div>
      <Button variant="outline" size="sm" @click="addWalkTime">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add
      </Button>
    </div>
    <div v-for="(w, k) in landing.location.walk_times" :key="`wt-${k}`" class="flex items-center gap-2">
      <Input v-model="w.minutes" placeholder="6" class="w-20" />
      <Input v-model="w.label" placeholder="to the Ocean" class="flex-1" />
      <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeWalkTime(k)">
        <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
      </Button>
    </div>

    <!-- Lifestyle gallery -->
    <div class="pt-2 border-t t-border space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <Label>Lifestyle gallery</Label>
          <p class="text-xs t-text-muted">"Active Living, Steps Away" cards (icon · title · note · image).</p>
        </div>
        <Button variant="outline" size="sm" @click="addLifestyleItem">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add card
        </Button>
      </div>
      <div v-if="landing.location.lifestyle" class="grid grid-cols-2 gap-2">
        <Input v-model="landing.location.lifestyle.eyebrow" placeholder="Eyebrow — The Flamingo Park Lifestyle" />
        <Input v-model="landing.location.lifestyle.heading" placeholder="Heading — Active Living, Steps Away" />
      </div>
      <div
        v-for="(it, k) in landing.location.lifestyle?.items || []"
        :key="`ls-${k}`"
        class="rounded-md border t-border p-2.5 space-y-2"
      >
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-md border t-border shrink-0">
            <Icon :name="it.icon || 'lucide:minus'" class="w-4 h-4 t-text-muted" />
          </span>
          <Input v-model="it.icon" placeholder="lucide:sun" class="w-36" />
          <Input v-model="it.title" placeholder="BEACH MORNING" class="flex-1" />
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="removeLifestyleItem(k)">
            <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
          </Button>
        </div>
        <Input v-model="it.desc" placeholder="Sunrise run on the sand" />
        <LandingBuilderImageField v-model="it.image" thumb-class="h-12 w-12" title="Lifestyle image" />
      </div>
    </div>
  </div>
</template>
