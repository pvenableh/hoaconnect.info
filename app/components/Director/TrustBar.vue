<script setup lang="ts">
/**
 * DirectorTrustBar — "how much is the assistant allowed to do on its own",
 * visible from every workspace page instead of buried in a settings tab.
 *
 * A small tier ring in the top chrome. Click it and you get three things in one
 * popover: the existing `<AiTrustDial>` (unchanged — this is a mount, not a
 * second dial), a shortcut to whatever is waiting for approval, and a list of
 * what the assistant has recently done with the latitude you already gave it,
 * each with Undo where the executor captured one.
 *
 * That last list is the point. A trust dial you can raise but whose consequences
 * you never see is a slider with a shrug behind it. "Set a due date on #418 —
 * 20m ago — Undo" is what makes tier 2 an informed choice rather than a hopeful
 * one.
 *
 * The nudge under the dial is a *suggestion* computed by
 * `core/shared/ai/trust.ts` from this person's own approval record. Nothing here
 * raises the tier; that stays an administrator's deliberate act through the
 * existing dial. And no tier reaches outbound work — the copy says so, because
 * the code does.
 */

const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
const orgId = computed(() => selectedOrgId.value);

const { tier, tiers, refresh: refreshTier } = useAiAutonomy(orgId);
const pendingCount = useAiPendingCount();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { openWith } = useAiAssistant();

const current = computed(() => tiers.find((t) => t.tier === tier.value) || tiers[0]);

// Tier colour ladder — muted → cool → confident. Deliberately not a red/green
// safety scale: a higher tier is not "dangerous", it is a different setting.
const TIER_COLOR = ["#94a3b8", "#38bdf8", "#22d3ee", "#4fd89a"] as const;
const tierColor = computed(() => TIER_COLOR[Math.max(0, Math.min(3, tier.value))]);

// ── Popover ──────────────────────────────────────────────────────────────────
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    loadRecent();
    loadTrust();
  }
}
function onDocClick(e: MouseEvent) {
  if (!open.value) return;
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}

onMounted(() => {
  refreshTier();
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onEsc);
});
watch(orgId, () => {
  refreshTier();
  if (open.value) {
    loadRecent();
    loadTrust();
  }
});

// ── Earned-trust nudge ───────────────────────────────────────────────────────
const nudge = ref<{ suggest: boolean; earnedTier: number; milestone: number | null; reason: string } | null>(
  null
);
async function loadTrust() {
  if (!orgId.value) return;
  try {
    const res = await $fetch<{ nudge: typeof nudge.value }>("/api/ai/actions/trust", {
      query: { orgId: orgId.value },
    });
    nudge.value = res?.nudge ?? null;
  } catch {
    nudge.value = null;
  }
}

// ── Recently handled ─────────────────────────────────────────────────────────
const recent = ref<any[]>([]);
const recentLoading = ref(false);
const busyIds = ref<Set<string>>(new Set());

async function loadRecent() {
  if (!orgId.value) return;
  recentLoading.value = true;
  try {
    const res = await $fetch<{ actions: any[] }>("/api/ai/actions", {
      query: { orgId: orgId.value, status: "executed", limit: 6 },
    });
    recent.value = res?.actions || [];
  } catch {
    recent.value = [];
  } finally {
    recentLoading.value = false;
  }
}

const canUndo = (a: any) => !!a?.result?._undo && !a?.result?._undone;
const isUndone = (a: any) => !!a?.result?._undone;

async function undo(a: any) {
  if (!orgId.value || busyIds.value.has(a.id)) return;
  const prev = a.result;
  a.result = { ...(a.result || {}), _undone: true }; // optimistic
  busyIds.value = new Set(busyIds.value).add(a.id);
  try {
    await $fetch(`/api/ai/actions/${a.id}/undo`, {
      method: "POST",
      body: { orgId: orgId.value },
    });
  } catch {
    a.result = prev; // rollback
  } finally {
    const next = new Set(busyIds.value);
    next.delete(a.id);
    busyIds.value = next;
  }
}

function timeAgo(ts?: string | null) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

function reviewPending() {
  open.value = false;
  openWith("Show me what's waiting for my approval.");
}
</script>

<template>
  <div ref="rootEl" class="relative shrink-0">
    <button
      type="button"
      class="trustbar__trigger ios-press"
      :style="{ '--tier-color': tierColor }"
      :aria-label="`The assistant's autonomy is set to: ${current.label}. Open the trust dial.`"
      :title="`Autonomy: ${current.label}`"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <svg viewBox="0 0 24 24" class="trustbar__ring" aria-hidden="true">
        <circle cx="12" cy="12" r="10" class="trustbar__ring-bg" />
        <circle
          cx="12"
          cy="12"
          r="10"
          class="trustbar__ring-fg"
          :stroke-dasharray="`${(tier / 3) * 62.83} 62.83`"
        />
      </svg>
      <span class="trustbar__num">{{ tier }}</span>
    </button>

    <Transition name="trustbar-pop">
      <div v-if="open" class="trustbar__panel" @click.stop>
        <p class="text-[10px] font-semibold uppercase tracking-wide t-text-muted text-center">
          How much the assistant handles on its own
        </p>

        <AiTrustDial :org-id="orgId" :can-edit="isAdminOfCurrentDomain" />

        <!-- Earned trust — a sentence, never a switch. -->
        <p
          v-if="nudge?.suggest"
          class="rounded-xl t-bg-subtle px-3 py-2 text-[11px] t-text-secondary leading-relaxed"
        >
          {{ nudge.reason }}
        </p>

        <button
          v-if="pendingCount > 0"
          type="button"
          class="trustbar__pending"
          @click="reviewPending"
        >
          <Icon name="i-lucide-inbox" class="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>
            <b>{{ pendingCount }}</b> action{{ pendingCount === 1 ? "" : "s" }} waiting for you
          </span>
          <Icon name="i-lucide-arrow-right" class="w-3.5 h-3.5 ml-auto shrink-0" />
        </button>

        <div class="trustbar__recent">
          <p class="text-[10px] font-semibold uppercase tracking-wide t-text-muted mb-1.5">
            Recently handled
          </p>
          <div v-if="recentLoading" class="space-y-1.5">
            <div v-for="n in 3" :key="n" class="h-6 rounded-lg t-bg-subtle animate-pulse" />
          </div>
          <p v-else-if="!recent.length" class="text-[11px] t-text-muted py-1">
            Nothing yet. As you raise this dial, what the assistant handles shows up here.
          </p>
          <ul v-else class="space-y-1">
            <li v-for="a in recent" :key="a.id" class="flex items-center gap-2 text-[11px] py-1">
              <Icon name="i-lucide-check" class="w-3 h-3 shrink-0 text-emerald-500" />
              <span
                class="min-w-0 flex-1 truncate"
                :class="isUndone(a) ? 'line-through t-text-muted' : 't-text'"
              >
                {{ a.title || a.action_type }}
              </span>
              <span class="text-[10px] t-text-muted shrink-0">{{ timeAgo(a.date_created) }}</span>
              <button
                v-if="canUndo(a)"
                type="button"
                class="text-[10px] font-medium t-text-accent hover:underline shrink-0 disabled:opacity-50"
                :disabled="busyIds.has(a.id)"
                @click="undo(a)"
              >
                Undo
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.trustbar__trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  background: var(--theme-bg-tertiary);
  transition: background 0.2s ease;
  --tier-color: #38bdf8;
}
.trustbar__trigger:hover {
  background: var(--theme-bg-secondary);
}

.trustbar__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.trustbar__ring-bg {
  fill: none;
  stroke: var(--theme-border-primary);
  stroke-width: 2.5;
}
.trustbar__ring-fg {
  fill: none;
  stroke: var(--tier-color);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition:
    stroke-dasharray 0.5s cubic-bezier(0.36, 0.66, 0.04, 1),
    stroke 0.4s ease;
}
.trustbar__num {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: var(--theme-text-primary);
  font-variant-numeric: tabular-nums;
}

.trustbar__panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 60;
  width: 300px;
  max-width: calc(100vw - 24px);
  padding: 14px;
  border-radius: 20px;
  border: 1px solid var(--theme-border-primary);
  background: var(--theme-bg-primary);
  box-shadow: 0 12px 40px -8px rgb(0 0 0 / 0.35);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trustbar__pending {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  font-size: 11.5px;
  color: var(--theme-text-primary);
  transition: background 0.2s ease;
}
.trustbar__pending:hover {
  background: color-mix(in srgb, #f59e0b 20%, transparent);
}

.trustbar__recent {
  border-top: 1px solid var(--theme-border-primary);
  padding-top: 10px;
}

.trustbar-pop-enter-active,
.trustbar-pop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.trustbar-pop-enter-from,
.trustbar-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .trustbar__ring-fg,
  .trustbar-pop-enter-active,
  .trustbar-pop-leave-active {
    transition: none;
  }
}
</style>
