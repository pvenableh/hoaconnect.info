<script setup lang="ts">
/**
 * HomeManagerQueue — band 1 for a property manager: open requests across the
 * areas they were delegated, oldest first. Each row opens its record, where the
 * reply is written.
 *
 * Reassigning: drag a row onto a person in the strip above the list, or use the
 * row's "Move to…" menu (the keyboard path, same handler). Both call `reassign`.
 */
import type { RoleContext } from "#core/shared/roles/role-context";
import { requestTrackKey } from "#core/shared/home/member-home";
import { toast } from "vue-sonner";
import { getStateMeta } from "#core/app/config/requestWorkflows";

const props = defineProps<{ roleContext: RoleContext | null | undefined }>();
const { buildOrgPath } = useOrgNavigation();
const { queue, pending, assignees, reassign } = useManagerHome(toRef(props, "roleContext"));
const requestPanel = useAppSlideOver("request");
const shown = computed(() => queue.value.slice(0, 8));

const MIME = "application/x-hoa-request";
const dragId = ref<string | null>(null);
const live = ref("");
const people = computed(() => assignees.value);
async function moveTo(id: string, userId: string) {
  const title = shown.value.find((r) => r.id === id)?.title || "Request";
  try {
    const name = await reassign(id, userId);
    live.value = `${title} moved to ${name}`;
    toast.success(`${title} → ${name}`);
  } catch {
    live.value = `Could not reassign ${title}`;
    toast.error("Could not reassign that request");
  }
}
const assigneeName = (r: { assigned_to?: any }) => {
  const a = r.assigned_to;
  if (!a || typeof a !== "object") return "";
  return [a.first_name, a.last_name].filter(Boolean).join(" ");
};
function onDragStart(e: DragEvent, id: string) {
  dragId.value = id;
  e.dataTransfer?.setData(MIME, id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

const age = (iso?: string | null) => {
  const days = Math.floor((Date.now() - Date.parse(iso ?? "")) / 86_400_000);
  return Number.isFinite(days) ? (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`) : "";
};
const label = (r: { type?: string | null; status?: string | null }) =>
  getStateMeta(r.type, r.status)?.label ?? requestTrackKey(r.status) ?? "";
</script>

<template>
  <div class="space-y-3" data-testid="home-manager-queue">
    <h2 class="t-eyebrow">Needs you</h2>
    <div v-if="shown.length && people.length" class="flex flex-wrap gap-2" data-testid="home-assignee-strip" aria-label="Drop a request on a person to reassign it">
      <AppDropTarget
        v-for="p in people"
        :key="p.id || 'none'"
        :accepts="[MIME]"
        :type="MIME"
        class="rounded-full border px-3 py-1 text-sm t-text-secondary"
        data-testid="home-assignee"
        @drop="(id: string) => moveTo(id, p.id)"
      >
        {{ p.name }}
      </AppDropTarget>
    </div>
    <p class="sr-only" aria-live="polite">{{ live }}</p>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="r in shown" :key="r.id" class="flex items-center" draggable="true" data-testid="home-queue-item" @dragstart="onDragStart($event, r.id)" @dragend="dragId = null">
          <NuxtLink
            :to="buildOrgPath(`/manage/inquiries/${r.id}`)"
            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
            data-testid="home-queue-row"
            @click.prevent="requestPanel.open(r.id)"
          >
            <Icon :name="r.type === 'violation' ? 'i-lucide-triangle-alert' : 'i-lucide-inbox'" class="h-4 w-4 shrink-0 t-text-muted" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium t-text">{{ r.title || "Untitled" }}</span>
              <span class="block truncate text-sm t-text-muted">{{ label(r) }} · waiting {{ age(r.date_created) }} · {{ assigneeName(r) || "Unassigned" }}</span>
            </span>
            <span class="shrink-0 text-xs font-medium t-text-muted">Reply</span>
            <Icon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 t-text-muted" />
          </NuxtLink>
          <select
            v-if="people.length"
            class="mr-3 w-28 shrink-0 rounded-md border bg-transparent px-2 py-1 text-xs t-text-secondary"
            :aria-label="`Move ${r.title || 'request'} to…`"
            data-testid="home-move-to"
            @change="(e) => { const el = e.target as HTMLSelectElement; if (el.value !== '__') moveTo(r.id, el.value); el.value = '__'; }"
          >
            <option value="__" selected>Move to…</option>
            <option v-for="p in people" :key="p.id || 'none'" :value="p.id">{{ p.name }}</option>
          </select>
        </li>
        <li v-if="!shown.length" class="px-4 py-3 text-sm t-text-muted">
          {{ pending ? "Loading the queue…" : "Nothing is waiting in your areas." }}
        </li>
      </ul>
    </AppCard>
    <NuxtLink v-if="queue.length > shown.length" :to="buildOrgPath('/manage/inquiries')" class="text-sm font-medium t-text-secondary">
      All {{ queue.length }} open
    </NuxtLink>
  </div>
</template>
