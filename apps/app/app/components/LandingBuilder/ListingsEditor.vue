<script setup lang="ts">
// Inline editor for the Listings section — real-estate units for sale/rent
// (lives on landing.listings).
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";
import type { ListingType } from "#core/shared/utils/landing";

const { landing } = useLandingBuilderContext();

const add = () =>
  landing.value.listings.push({ type: "sale", title: "", url: "", price: "", image: null });
const remove = (i: number) => landing.value.listings.splice(i, 1);
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm t-text-muted">Link units for sale or rent. They appear in a "For Sale &amp; Rent" section.</p>
      <Button variant="outline" size="sm" @click="add">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add listing
      </Button>
    </div>
    <div v-if="!landing.listings.length" class="text-xs t-text-muted">No listings yet.</div>
    <div v-for="(l, i) in landing.listings" :key="i" class="rounded-xl border t-border p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="inline-flex rounded-lg border t-border p-0.5">
          <button
            v-for="ty in (['sale', 'rental'] as ListingType[])"
            :key="ty"
            type="button"
            class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
            :class="l.type === ty ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
            @click="l.type = ty"
          >
            {{ ty === "sale" ? "For Sale" : "For Rent" }}
          </button>
        </div>
        <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="remove(i)">
          <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
        </Button>
      </div>
      <Input v-model="l.title" placeholder="Unit 4B — 2BR / 2BA" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input v-model="l.url" placeholder="https://listing-url.com" class="font-mono text-xs" />
        <Input v-model="l.price" placeholder="$650,000 or $3,200/mo" />
      </div>
      <LandingBuilderImageField v-model="l.image" thumb-class="h-14 w-20" title="Listing image" />
    </div>
  </div>
</template>
