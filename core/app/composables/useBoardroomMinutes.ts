/**
 * useBoardroomMinutes — the durable half of the Board Room.
 *
 * A meeting ends and the room closes; what survives is what was decided. That
 * record is `hoa_director_minutes`, and it is listed on the **meetings hub**
 * rather than only inside the Board Room — an HOA already keeps its record of
 * itself under Meetings, and minutes made anywhere else would be the one part
 * of the association's history you had to know about an AI feature to find.
 *
 * The step tally is deliberately NOT sent from here. `POST /api/ai/director/
 * minutes` takes the plan id and reads the steps back itself, so the counts on
 * a decision record can never have come from the same screen that was
 * displaying them.
 */

export interface MinutesStats {
  done: number;
  skipped: number;
  failed: number;
  open: number;
  total: number;
  captured: number;
}

export interface MinutesStep {
  id: string;
  actionType: string;
  title: string;
  status: string;
  outbound?: boolean;
}

export interface MinutesListRow {
  id: string | number;
  title: string | null;
  subject: string | null;
  topic: string | null;
  scopeType: "org" | "entity";
  summary: string | null;
  authorName: string | null;
  status: "recorded" | "shared";
  stats: MinutesStats | null;
  dateCreated: string | null;
}

export interface LoadedMinutes extends MinutesListRow {
  organizationId: string | null;
  authorId: string | null;
  sessionId: string | number | null;
  entityType: string | null;
  entityId: string | null;
  planId: string | null;
  intro: string | null;
  points: string[];
  money: any | null;
  steps: MinutesStep[];
}

export interface RecordMinutesParams {
  planId: string;
  sessionId?: string | number | null;
  title?: string | null;
  subject?: string | null;
  topic?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  intro?: string | null;
  points?: string[] | null;
  money?: any | null;
}

export function useBoardroomMinutes(orgId: Ref<string | null | undefined>) {
  const list = ref<MinutesListRow[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function refresh(limit = 12): Promise<MinutesListRow[]> {
    if (!orgId.value) {
      list.value = [];
      return [];
    }
    loading.value = true;
    try {
      const res = await $fetch<{ minutes: MinutesListRow[] }>("/api/ai/director/minutes", {
        query: { orgId: orgId.value, limit },
      });
      list.value = res.minutes || [];
    } catch {
      // A decision-record strip must never break the hub it sits on.
      list.value = [];
    } finally {
      loading.value = false;
    }
    return list.value;
  }

  async function record(params: RecordMinutesParams): Promise<string | number | null> {
    if (!orgId.value || saving.value) return null;
    saving.value = true;
    error.value = null;
    try {
      const res = await $fetch<{ minutesId: string | number | null; saved: boolean }>(
        "/api/ai/director/minutes",
        { method: "POST", body: { orgId: orgId.value, ...params } }
      );
      if (!res.saved) {
        error.value = "The Board Room's minutes store is not set up yet.";
        return null;
      }
      await refresh();
      return res.minutesId;
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || e?.message || "Could not record that.";
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function load(id: string | number): Promise<LoadedMinutes | null> {
    if (!orgId.value) return null;
    try {
      const res = await $fetch<{ minutes: LoadedMinutes }>(`/api/ai/director/minutes/${id}`, {
        query: { orgId: orgId.value },
      });
      return res.minutes;
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || e?.message || "Could not open that.";
      return null;
    }
  }

  async function share(id: string | number): Promise<LoadedMinutes | null> {
    if (!orgId.value) return null;
    try {
      const res = await $fetch<{ minutes: LoadedMinutes }>(`/api/ai/director/minutes/${id}`, {
        method: "POST",
        body: { orgId: orgId.value, op: "share" },
      });
      await refresh();
      return res.minutes;
    } catch (e: any) {
      error.value = e?.data?.message || e?.statusMessage || e?.message || "Could not share that.";
      return null;
    }
  }

  return { list, loading, saving, error, refresh, record, load, share };
}
