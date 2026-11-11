<script setup lang="ts">
// Governing documents: one statute flag (spec §5). The relationship is one of
// five, never a yes/no: "Ask counsel." is the most prominent, "consistent" is a
// quiet check mark. The rule lines are shown as curated, word for word.
// People who manage governing documents can confirm or dismiss the flag, or
// mark it confirmed by counsel; the server checks again and writes the audit row.
import { toast } from "vue-sonner";
import {
  FLAG_STATUS_ACTIONS,
  FLAG_STATUS_LABELS,
  RELATIONSHIP_LABELS,
  SEVERITY_LABELS,
  STALE_REASON_LABELS,
  referenceStaleness,
  type SettableFlagStatus,
} from "#core/shared/governing/flags";
import { formatRecordDate } from "#core/shared/governing/labels";
import type { GovFlag } from "#core/shared/governing/types";

type Brief = { id: string; citation: string | null; heading: string | null };

const props = defineProps<{
  flag: Omit<GovFlag, "provisions">;
  orgId: string | null | undefined;
  /** Shows the status controls. The server decides again on every call. */
  canManage?: boolean;
  /** The provisions the flag is about, when the page is not already one of them. */
  provisions?: Brief[];
}>();
const emit = defineEmits<{ changed: [] }>();

const { buildOrgPath } = useOrgNavigation();
const { confirm } = useConfirm();
const { setFlagStatus } = useGoverningDocs(toRef(props, "orgId"));

// An admin previewing the member view sees the flag as a member does.
const { isPreviewingMember } = useViewAs();
const manages = computed(() => !!props.canManage && !isPreviewingMember.value);

const isCounsel = computed(() => props.flag.relationship === "counsel_review");
const isQuiet = computed(() => props.flag.relationship === "consistent");
const icon = computed(
  () =>
    ({
      counsel_review: "lucide:scale",
      statute_controls: "lucide:landmark",
      statute_supplements: "lucide:circle-plus",
      document_controls: "lucide:scroll-text",
      consistent: "lucide:check",
    })[props.flag.relationship] ?? "lucide:landmark"
);
// Members only ever get confirmed flags; "confirmed by counsel" is worth telling them.
const showStatus = computed(() => manages.value || props.flag.status === "counsel_confirmed");
const today = new Date();

const ACTION_LABELS: Record<SettableFlagStatus, string> = {
  confirmed: "Confirm",
  counsel_confirmed: "Mark Confirmed by Counsel",
  dismissed: "Dismiss",
};
const actions = computed(() =>
  FLAG_STATUS_ACTIONS[props.flag.status].map((status) => ({
    status,
    label: status === "confirmed" && props.flag.status === "dismissed" ? "Restore" : ACTION_LABELS[status],
  }))
);

const saving = ref(false);
const setStatus = async (status: SettableFlagStatus) => {
  if (saving.value) return;
  if (status === "dismissed") {
    const ok = await confirm({
      title: "Dismiss this flag?",
      body: "Members stop seeing it. It stays in the record and can be restored.",
      confirmLabel: "Dismiss",
      destructive: true,
    });
    if (!ok) return;
  }
  if (status === "counsel_confirmed") {
    const ok = await confirm({
      title: "Has association counsel signed off on this comparison?",
      body: "Mark it only after a lawyer has reviewed it. The change is recorded with your name.",
      confirmLabel: "Mark Confirmed",
    });
    if (!ok) return;
  }
  saving.value = true;
  try {
    await setFlagStatus(props.flag.id, status);
    toast.success("Flag updated");
    emit("changed");
  } catch (error: any) {
    toast.error(error?.data?.message || "Could not update the flag.");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <article
    class="ios-card p-4 space-y-3"
    :class="isCounsel ? 'border-2 t-border-accent' : ''"
    data-testid="governing-flag"
    :data-relationship="flag.relationship"
  >
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <Icon :name="icon" class="shrink-0 mt-0.5" :class="[isCounsel ? 'w-5 h-5 t-text-accent' : 'w-4 h-4', isQuiet ? 't-text-muted' : '']" />
      <div class="flex-1 min-w-0">
        <p :class="isCounsel ? 'type-card t-text' : isQuiet ? 'type-meta t-text-secondary' : 'type-body t-text'">
          {{ RELATIONSHIP_LABELS[flag.relationship] }}
        </p>
        <p v-if="flag.topic" class="type-meta t-text-muted">{{ flag.topic }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-if="!isQuiet" variant="secondary">{{ SEVERITY_LABELS[flag.severity] ?? flag.severity }} severity</Badge>
        <Badge v-if="showStatus" variant="secondary">{{ FLAG_STATUS_LABELS[flag.status] }}</Badge>
        <Badge v-if="manages && flag.origin === 'ai_suggested'" variant="outline" data-testid="governing-flag-ai">Suggested by AI</Badge>
      </div>
    </div>

    <dl class="space-y-2">
      <div v-if="flag.origin === 'ai_suggested' && flag.quoted_text">
        <dt class="type-micro t-text-muted">Words of the provision this points to</dt>
        <dd class="type-body t-text whitespace-pre-wrap border-l-2 t-border pl-3">{{ flag.quoted_text }}</dd>
      </div>
      <p v-if="manages && flag.origin === 'ai_suggested' && flag.status === 'suggested'" class="type-meta t-text-muted">
        Software matched this provision to a statute in the library. It has not compared what each says. Read both before confirming; confirming shows
        members a question for counsel.
      </p>
      <div v-if="flag.document_rule">
        <dt class="type-micro t-text-muted">Your documents</dt>
        <dd class="type-body t-text whitespace-pre-wrap">{{ flag.document_rule }}</dd>
      </div>
      <div v-if="flag.statute_rule">
        <dt class="type-micro t-text-muted">State law</dt>
        <dd class="type-body t-text whitespace-pre-wrap">{{ flag.statute_rule }}</dd>
      </div>
      <div v-if="flag.note">
        <dt class="type-micro t-text-muted">Note</dt>
        <dd class="type-meta t-text-secondary whitespace-pre-wrap">{{ flag.note }}</dd>
      </div>
      <div v-if="flag.statute_citation || flag.references.length">
        <dt class="type-micro t-text-muted">Citation</dt>
        <dd v-if="flag.statute_citation" class="type-body t-text">{{ flag.statute_citation }}</dd>
        <dd v-for="reference in flag.references" :key="reference.id" class="type-meta t-text-muted flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          <a v-if="reference.url" :href="reference.url" target="_blank" rel="noopener noreferrer" class="t-text-accent underline">
            {{ reference.code }}<Icon name="lucide:external-link" class="w-3 h-3 ml-1 inline" />
          </a>
          <span v-else>{{ reference.code }}</span>
          <span v-if="reference.edition">Edition: {{ reference.edition }}</span>
          <span v-if="reference.checked_on">Checked {{ formatRecordDate(reference.checked_on) }}</span>
          <span v-if="manages && referenceStaleness(reference, today)">{{ STALE_REASON_LABELS[referenceStaleness(reference, today)!] }}</span>
        </dd>
      </div>
      <div v-if="provisions?.length">
        <dt class="type-micro t-text-muted">Provisions</dt>
        <dd class="type-body flex flex-wrap gap-x-3 gap-y-0.5">
          <NuxtLink
            v-for="p in provisions"
            :key="p.id"
            :to="buildOrgPath(`/governing/provisions/${p.id}`)"
            class="t-text-accent underline"
          >
            {{ [p.citation, p.heading].filter(Boolean).join(" · ") }}
          </NuxtLink>
        </dd>
      </div>
    </dl>

    <div v-if="manages && actions.length" class="flex flex-wrap items-center justify-end gap-2 border-t t-border pt-3">
      <Button
        v-for="action in actions"
        :key="action.status"
        :variant="action.status === 'dismissed' ? 'ghost' : 'outline'"
        size="sm"
        :disabled="saving"
        @click="setStatus(action.status)"
      >
        {{ action.label }}
      </Button>
    </div>
  </article>
</template>
