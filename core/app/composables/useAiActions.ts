// useAiActions — client state for the assistant's HITL action queue (Phase 4).
// Lists proposals + history, drives approve/reject/edit/undo, and keeps a shared
// pending-count for the launcher badge. All authorization + execution is
// server-side; this reads the queue and posts decisions.

export interface AiActionRow {
  id: string;
  action_type: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  category?: string | null;
  risk?: string | null;
  outbound?: boolean | null;
  payload?: Record<string, any> | null;
  preview?: Record<string, any> | null;
  result?: Record<string, any> | null;
  error_message?: string | null;
  title?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  date_created?: string | null;
  requested_by?: { first_name?: string; last_name?: string } | null;
  approved_by?: { first_name?: string; last_name?: string } | null;
}

export function useAiActions(orgId: Ref<string | null | undefined>) {
  // Shared across the badge + the panel so a decision updates both.
  const pendingCount = useState<number>("aiPendingCount", () => 0);
  const actions = ref<AiActionRow[]>([]);
  const loading = ref(false);
  const busyId = ref<string | null>(null);

  async function refreshPendingCount() {
    if (!orgId.value) return;
    try {
      const res = await $fetch<{ count: number }>("/api/ai/actions/pending-count", {
        query: { orgId: orgId.value },
      });
      pendingCount.value = res.count ?? 0;
    } catch {
      /* leave as-is */
    }
  }

  async function fetchActions(opts: { status?: string; entityType?: string; entityId?: string } = {}) {
    if (!orgId.value) return;
    loading.value = true;
    try {
      const res = await $fetch<{ actions: AiActionRow[] }>("/api/ai/actions", {
        query: { orgId: orgId.value, ...opts },
      });
      actions.value = res.actions || [];
    } catch {
      actions.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    if (!orgId.value) return;
    busyId.value = id;
    try {
      await $fetch(`/api/ai/actions/${id}/${decision}`, {
        method: "POST",
        body: { orgId: orgId.value },
      });
      await Promise.all([fetchActions(), refreshPendingCount()]);
    } finally {
      busyId.value = null;
    }
  }

  async function edit(id: string, payload: Record<string, any>) {
    if (!orgId.value) return;
    busyId.value = id;
    try {
      await $fetch(`/api/ai/actions/${id}/edit`, {
        method: "POST",
        body: { orgId: orgId.value, payload },
      });
      await fetchActions();
    } finally {
      busyId.value = null;
    }
  }

  async function undo(id: string) {
    if (!orgId.value) return;
    busyId.value = id;
    try {
      await $fetch(`/api/ai/actions/${id}/undo`, {
        method: "POST",
        body: { orgId: orgId.value },
      });
      await fetchActions();
    } finally {
      busyId.value = null;
    }
  }

  const pending = computed(() => actions.value.filter((a) => a.status === "pending"));

  return {
    pendingCount,
    actions,
    pending,
    loading,
    busyId,
    refreshPendingCount,
    fetchActions,
    approve: (id: string) => decide(id, "approve"),
    reject: (id: string) => decide(id, "reject"),
    edit,
    undo,
  };
}

/** Read-only accessor for just the shared badge count (no fetch wiring). */
export function useAiPendingCount() {
  return useState<number>("aiPendingCount", () => 0);
}
