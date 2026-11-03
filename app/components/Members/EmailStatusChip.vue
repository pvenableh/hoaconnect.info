<script setup lang="ts">
/**
 * The Members page's email chip: "Bounced" or "Unsubscribed", with the reason
 * on hover and Clear behind a confirm (admin; written to the ledger). Renders
 * nothing for a member whose mail goes out normally.
 */
import type { MemberEmailStatus } from "#core/app/composables/useMemberEmailStatus";

const props = defineProps<{
  status: MemberEmailStatus | null;
  memberName: string;
}>();
const emit = defineEmits<{ clear: [what: "bounced" | "opt_out"] }>();

const { confirm } = useConfirm();

const SOURCE_LABEL: Record<string, string> = {
  link: "the unsubscribe page",
  one_click: "a one-click unsubscribe",
  spam: "a spam report",
  admin: "an admin",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

const bouncedTitle = computed(() => {
  const s = props.status;
  if (!s?.bounced) return "";
  return [`Bounced${fmt(s.bouncedAt) ? ` ${fmt(s.bouncedAt)}` : ""}`, s.bouncedReason].filter(Boolean).join(" — ");
});
const optedOutTitle = computed(() => {
  const s = props.status;
  if (!s?.optedOut) return "";
  const via = s.optedOutSource ? SOURCE_LABEL[s.optedOutSource] || s.optedOutSource : null;
  return `Opted out of community email${fmt(s.optedOutAt) ? ` ${fmt(s.optedOutAt)}` : ""}${via ? ` via ${via}` : ""}. Essential mail still goes out.`;
});

async function onClear(what: "bounced" | "opt_out") {
  const ok = await confirm(
    what === "bounced"
      ? {
          title: `Resume email to ${props.memberName}?`,
          body: "Only if the address works again — mail to a dead address hurts delivery for the whole community. This is recorded in the ledger.",
          confirmLabel: "Clear Bounce",
        }
      : {
          title: `Put ${props.memberName} back on community email?`,
          body: "Only if they asked to receive newsletters and announcements again. This is recorded in the ledger.",
          confirmLabel: "Resubscribe",
        }
  );
  if (!ok) return;
  emit("clear", what);
}
</script>

<template>
  <span v-if="status && (status.bounced || status.optedOut)" class="inline-flex flex-wrap items-center gap-1" data-email-status>
    <button
      v-if="status.bounced"
      type="button"
      class="email-chip text-destructive bg-destructive/10"
      :title="`${bouncedTitle}. Click to clear.`"
      data-email-chip="bounced"
      @click.stop="onClear('bounced')"
    >
      <Icon name="lucide:mail-x" class="w-3 h-3" />
      Bounced
    </button>
    <button
      v-if="status.optedOut"
      type="button"
      class="email-chip t-text-secondary t-bg-subtle"
      :title="`${optedOutTitle} Click to clear.`"
      data-email-chip="opted-out"
      @click.stop="onClear('opt_out')"
    >
      <Icon name="lucide:mail-minus" class="w-3 h-3" />
      Unsubscribed
    </button>
  </span>
</template>

<style scoped>
.email-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.25rem;
  transition: opacity var(--motion-fast) ease;
}
.email-chip:hover {
  opacity: 0.8;
}
</style>
