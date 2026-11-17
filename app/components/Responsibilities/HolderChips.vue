<!--
  ResponsibilitiesHolderChips — who holds a job, as the register shows them
  (plan §3.4, brief commit 7):

    office         the office and the person it resolves to on the date, or
                   "(vacant)" in the attention colour
    member / user  avatar and name
    vendor         the company
    team           its colour dot and name
    label          plain text

  A role shows as a suffix only when it is not owner ("· backup"). A job with
  no holder reads "Unassigned" in the attention colour, with the day it began
  when the register knows it.
-->
<script setup lang="ts">
import { roleLabel } from "#core/shared/responsibilities/config";
import type { HolderView } from "#core/shared/responsibilities/views";
import { registerDay } from "#core/app/composables/useResponsibilitiesResource";

defineProps<{
  holders: readonly HolderView[];
  /** When nobody holds it: the day it became unassigned. */
  unassignedSince?: string | null;
}>();

const files = useDirectusFiles();
const avatarUrl = (id: string) => files.getUrl(id, { width: 40, height: 40, fit: "cover" });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const suffix = (h: HolderView) => (h.role && h.role !== "owner" ? roleLabel(h.role).toLowerCase() : "");
</script>

<template>
  <div class="holder-chips">
    <span v-for="h in holders" :key="h.id" class="holder-chip text-sm">
      <Avatar v-if="h.kind === 'member' || h.kind === 'user'" class="holder-chip__avatar">
        <AvatarImage v-if="h.avatar" :src="avatarUrl(h.avatar)" :alt="h.name" />
        <AvatarFallback class="text-xs">{{ initials(h.name) }}</AvatarFallback>
      </Avatar>
      <Icon v-else-if="h.kind === 'office'" name="lucide:award" class="holder-chip__icon" aria-hidden="true" />
      <Icon v-else-if="h.kind === 'vendor'" name="lucide:building-2" class="holder-chip__icon" aria-hidden="true" />
      <span v-else-if="h.kind === 'team'" class="holder-chip__dot" :style="{ background: h.color || undefined }" aria-hidden="true" />

      <span class="t-text">{{ h.name }}</span>
      <template v-if="h.kind === 'office'">
        <span v-if="h.people?.length" class="t-text-muted">{{ h.people.map((p) => p.name).join(", ") }}</span>
        <span v-else class="text-warning">(vacant)</span>
      </template>
      <span v-if="suffix(h)" class="t-text-muted">· {{ suffix(h) }}</span>
    </span>

    <span v-if="!holders.length" class="holder-chip holder-chip--empty text-sm">
      <Icon name="lucide:circle-dashed" class="holder-chip__icon" aria-hidden="true" />
      <span class="text-warning font-medium">Unassigned</span>
      <span v-if="unassignedSince" class="t-text-muted">since {{ registerDay(unassignedSince) }}</span>
    </span>
  </div>
</template>

<style scoped>
.holder-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.375rem;
}
.holder-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem 0.125rem 0.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 70%, transparent);
  line-height: 1.25rem;
  white-space: normal;
}
/* "Unassigned since Nov 17, 2026" is one thought: it wraps as a chip, not inside one. */
.holder-chip--empty {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  white-space: nowrap;
}
.holder-chip__avatar {
  width: 1.5rem;
  height: 1.5rem;
}
.holder-chip__icon {
  width: 1rem;
  height: 1rem;
  margin-left: 0.125rem;
  color: var(--theme-text-muted);
}
.holder-chip__dot {
  width: 0.625rem;
  height: 0.625rem;
  margin: 0 0.1875rem 0 0.3125rem;
  border-radius: 999px;
  background: var(--theme-text-muted);
}
</style>
