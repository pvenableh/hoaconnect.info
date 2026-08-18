<script setup lang="ts">
// Inline editor for the FAQ section (lives on landing.faq).
import { useLandingBuilderContext } from "#core/app/composables/useLandingBuilder";

const { landing } = useLandingBuilderContext();

const add = () => landing.value.faq.push({ question: "", answer: "" });
const remove = (i: number) => landing.value.faq.splice(i, 1);
function move(i: number, dir: -1 | 1) {
  const arr = landing.value.faq;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm t-text-muted">Answer common questions. They appear as an accordion section.</p>
      <Button variant="outline" size="sm" @click="add">
        <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> Add question
      </Button>
    </div>
    <div v-if="!landing.faq.length" class="text-xs t-text-muted">No questions yet.</div>
    <div v-for="(f, i) in landing.faq" :key="i" class="rounded-xl border t-border p-4">
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
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" :disabled="i === 0" @click="move(i, -1)">
            <Icon name="lucide:chevron-up" class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" :disabled="i === landing.faq.length - 1" @click="move(i, 1)">
            <Icon name="lucide:chevron-down" class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="remove(i)">
            <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
