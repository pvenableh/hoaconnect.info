<!--
  ResponsibilitiesVisibilityMenu — the register's two publishing switches
  (plan §3.4, "Publishing" and "Showing unassigned jobs"), for admins only:
  the page mounts it when `viewer.isAdmin`, and PATCH /visibility refuses
  everyone else, because the delegate who keeps the register may be the party
  who is not answering.

  Turning either one on confirms first, in words an admin can repeat to the
  board. "Show unassigned jobs" names how many jobs owners will now see as
  unassigned (counted for today: owners read the present).
-->
<script setup lang="ts">
import { ownersWouldSeeUnassigned } from "#core/shared/responsibilities/register-view";
import type { RegisterRow } from "#core/shared/responsibilities/views";
import { registerToday } from "#core/app/composables/useResponsibilitiesResource";

const props = defineProps<{
  visibility: { published: boolean; showUnassigned: boolean };
  rows: readonly RegisterRow[];
  setVisibility: (body: { published?: boolean; showUnassigned?: boolean }) => Promise<boolean>;
}>();

const { confirm } = useConfirm();
const busy = ref(false);

async function toggle(which: "published" | "showUnassigned", on: boolean) {
  if (busy.value) return;
  if (on && which === "published") {
    const ok = await confirm({
      title: "Publish the register to owners?",
      body: "Owners and tenants will see each job, who holds it, how often, and when it was last verified. They never see the basis, notes or history. You can turn it off at any time.",
      confirmLabel: "Publish",
    });
    if (!ok) return;
  }
  if (on && which === "showUnassigned") {
    const n = ownersWouldSeeUnassigned(props.rows, registerToday());
    const ok = await confirm({
      title: n === 1 ? "Show 1 unassigned job to owners?" : `Show ${n} unassigned jobs to owners?`,
      body:
        (n
          ? `Owners will see ${n === 1 ? "that job" : `those ${n} jobs`} as “Unassigned since” a date, with no names and no notes. `
          : "No job is unassigned today. If one becomes unassigned, owners will see it as “Unassigned since” a date. ") +
        (props.visibility.published ? "" : "Nothing shows to owners until the register is published. "),
      confirmLabel: "Show Them",
    });
    if (!ok) return;
  }
  busy.value = true;
  try {
    await props.setVisibility({ [which]: on });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <AppButton variant="outline" class="rounded-full">
        <Icon name="lucide:eye" class="w-4 h-4 mr-1.5" />
        Visibility
        <span class="ml-1.5 type-meta" :class="visibility.published ? 'text-success' : 't-text-muted'">
          {{ visibility.published ? "Published" : "Private" }}
        </span>
      </AppButton>
    </PopoverTrigger>
    <AppPopoverContent align="end" class="w-80 space-y-4">
      <label class="flex items-start justify-between gap-4">
        <span class="grid gap-0.5">
          <span class="text-sm font-medium t-text">Published to owners</span>
          <span class="text-xs t-text-muted">
            Owners and tenants see job, who, how often and last verified. Until then they see "The board hasn't
            published who handles what yet."
          </span>
        </span>
        <Switch :model-value="visibility.published" :disabled="busy" @update:model-value="(v: boolean) => toggle('published', v)" />
      </label>
      <label class="flex items-start justify-between gap-4">
        <span class="grid gap-0.5">
          <span class="text-sm font-medium t-text">Show unassigned jobs to owners</span>
          <span class="text-xs t-text-muted">
            A job nobody holds shows as "Unassigned since" a date. For the case where the register is the only
            place that says so.
          </span>
        </span>
        <Switch :model-value="visibility.showUnassigned" :disabled="busy" @update:model-value="(v: boolean) => toggle('showUnassigned', v)" />
      </label>
      <p class="text-xs t-text-muted">Only an admin can change these. Each change is written to the activity log.</p>
    </AppPopoverContent>
  </Popover>
</template>
