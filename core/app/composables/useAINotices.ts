/**
 * The notices feed, client side — fetch, dismiss, and remember the dismissal.
 *
 * The server is deterministic, which makes dismissal a genuinely client
 * concern: `/api/ai/notices` will return the same notice tomorrow because the
 * fact behind it is still true. "I have seen this and I am not acting on it
 * today" is a statement about the reader, not about the community, so it lives
 * in the reader's own browser rather than in a row everyone shares. A board
 * member dismissing a stale-project notice must not hide it from the treasurer.
 *
 * That choice has a consequence worth stating plainly: dismissals do not follow
 * you to another device, and clearing site data brings everything back. Both
 * are acceptable — the notice is never the record, the underlying row is.
 *
 * Dismissals are scoped per organisation and pruned against what the server
 * currently returns, so the key cannot grow without bound as entities come and
 * go.
 */

import type { AttentionPriority } from "#core/shared/ai/attention";

export interface AINoticeView {
  id: string;
  priority: AttentionPriority;
  type: "warning" | "insight" | "suggestion";
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
  entityType?: string;
  entityId?: string;
  score: number;
  proposedAction?: { actionType: string; title: string; payload: Record<string, any> };
}

interface NoticesResponse {
  notices: AINoticeView[];
  total: number;
  generatedAt: string;
}

const STORAGE_PREFIX = "hoa.ai-notices.dismissed";

const storageKey = (orgId: string) => `${STORAGE_PREFIX}.${orgId}`;

/** localStorage is absent during SSR and can throw in private modes. */
function readDismissed(orgId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(orgId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(ids));
  } catch {
    /* quota or private mode — dismissal simply doesn't persist */
  }
}

export function useAINotices(organizationId: MaybeRefOrGetter<string | null | undefined>) {
  const orgId = computed(() => toValue(organizationId) || "");

  const all = useState<AINoticeView[]>("ai-notices:all", () => []);
  const generatedAt = useState<string | null>("ai-notices:at", () => null);
  const loading = useState<boolean>("ai-notices:loading", () => false);
  const error = useState<string | null>("ai-notices:error", () => null);
  const dismissed = useState<string[]>("ai-notices:dismissed", () => []);

  /** Everything the server sent, minus what this browser has dismissed. */
  const notices = computed(() => {
    const hidden = new Set(dismissed.value);
    return all.value.filter((n) => !hidden.has(n.id));
  });

  const counts = computed(() => {
    const c = { urgent: 0, high: 0, medium: 0, low: 0 };
    for (const n of notices.value) c[n.priority] = (c[n.priority] ?? 0) + 1;
    return c;
  });

  /** What the badge shows: the ones that actually want an answer. */
  const actionableCount = computed(() => counts.value.urgent + counts.value.high);

  async function refresh(opts?: { entityType?: string; entityId?: string }): Promise<void> {
    if (!orgId.value) {
      all.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const query: Record<string, string> = { orgId: orgId.value };
      if (opts?.entityType && opts?.entityId) {
        query.entityType = opts.entityType;
        query.entityId = opts.entityId;
      }
      const res = await $fetch<NoticesResponse>("/api/ai/notices", { query });
      all.value = res.notices || [];
      generatedAt.value = res.generatedAt || null;

      // Prune dismissals against what still exists. Without this the key grows
      // forever — every resolved request leaves its dismissal behind.
      const live = new Set(all.value.map((n) => n.id));
      const stored = readDismissed(orgId.value);
      const kept = stored.filter((id) => live.has(id));
      dismissed.value = kept;
      if (kept.length !== stored.length) writeDismissed(orgId.value, kept);
    } catch (e: any) {
      // A member without board standing gets a 403 here, which is correct and
      // not worth surfacing as a failure — they simply have no feed.
      if (e?.statusCode === 403) {
        all.value = [];
      } else {
        error.value = e?.statusMessage || e?.message || "Could not load notices";
      }
    } finally {
      loading.value = false;
    }
  }

  function dismiss(id: string): void {
    if (!id || !orgId.value) return;
    if (dismissed.value.includes(id)) return;
    const next = [...dismissed.value, id];
    dismissed.value = next;
    writeDismissed(orgId.value, next);
  }

  function restore(id: string): void {
    const next = dismissed.value.filter((v) => v !== id);
    dismissed.value = next;
    if (orgId.value) writeDismissed(orgId.value, next);
  }

  function restoreAll(): void {
    dismissed.value = [];
    if (orgId.value) writeDismissed(orgId.value, []);
  }

  /** Load this org's dismissals out of localStorage — client only. */
  function hydrateDismissed(): void {
    if (!orgId.value) return;
    dismissed.value = readDismissed(orgId.value);
  }

  return {
    notices,
    all,
    counts,
    actionableCount,
    dismissed,
    loading,
    error,
    generatedAt,
    refresh,
    dismiss,
    restore,
    restoreAll,
    hydrateDismissed,
  };
}
