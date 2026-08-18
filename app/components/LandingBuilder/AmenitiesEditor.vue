<script setup lang="ts">
// Inline editor for the Amenities section. Amenities are hoa_amenities rows (org
// data, not landing config) — edited here on site.amenities and upserted/deleted
// on save by the page.
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { site } = useLandingBuilderContext();

const add = () => site.amenities.push({ title: "", icon: "lucide:sparkles", description: "" });
function remove(i: number) {
  const a = site.amenities[i];
  if (a?.id) site.removedAmenityIds.push(a.id);
  site.amenities.splice(i, 1);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm t-text-muted">Highlights shown in a grid on the landing.</p>
      <Button variant="outline" size="sm" @click="add">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add
      </Button>
    </div>
    <div v-if="!site.amenities.length" class="text-xs t-text-muted">No amenities yet.</div>
    <div v-for="(a, i) in site.amenities" :key="i" class="rounded-xl border t-border p-3 space-y-2">
      <div class="flex items-center gap-2">
        <Icon :name="a.icon || 'lucide:sparkles'" class="w-5 h-5 shrink-0 t-text-accent" />
        <Input v-model="a.title" placeholder="Title (e.g. Rooftop Pool)" class="flex-1" />
        <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="remove(i)">
          <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
        </Button>
      </div>
      <Input v-model="a.icon" placeholder="Icon name (e.g. lucide:waves)" class="font-mono text-xs" />
      <Input v-model="a.description" placeholder="Short description" />
    </div>
  </div>
</template>
