/**
 * useProjectEvents — CRUD for milestones/phases on a project, plus the
 * business-day end-date helper (shared with the server).
 */
import { toast } from "vue-sonner";
import { computeEndDate, computeDependencyShifts } from "#core/shared/projects/schedule";
import type { ScheduleEvent, ScheduleShift } from "#core/shared/projects/schedule";

export type EventStatus = "draft" | "scheduled" | "active" | "completed" | "archived";
export type EventType = "phase" | "milestone" | "meeting" | "inspection" | "payment" | "other";
export type ApprovalState = "none_needed" | "needs_approval" | "approved";

export interface ProjectEventRow {
  id: string;
  status?: EventStatus | string | null;
  project?: string | { id: string } | null;
  title?: string | null;
  description?: string | null;
  type?: EventType | string | null;
  event_date?: string | null;
  duration_days?: number | null;
  end_date?: string | null;
  is_milestone?: boolean | null;
  depends_on?: { id: string; title?: string } | string | null;
  assigned_to?: { id: string; first_name?: string; last_name?: string; avatar?: string | null } | string | null;
  approval?: ApprovalState | string | null;
  approved_at?: string | null;
  approval_note?: string | null;
  approval_token_expires?: string | null;
  cost_amount?: number | string | null;
  sort?: number | null;
  tasks?: any[] | null;
  spawned_projects?: { id: string; title?: string; status?: string }[] | null;
  date_created?: string | null;
}

export const EVENT_TYPE_META: Record<string, { label: string; icon: string }> = {
  phase: { label: "Phase", icon: "lucide:layers" },
  milestone: { label: "Milestone", icon: "lucide:flag" },
  meeting: { label: "Meeting", icon: "lucide:users" },
  inspection: { label: "Inspection", icon: "lucide:clipboard-check" },
  payment: { label: "Payment", icon: "lucide:dollar-sign" },
  other: { label: "Other", icon: "lucide:circle" },
};

export const useProjectEvents = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const orgId = () => {
    const id = selectedOrgId.value;
    if (!id) throw new Error("No organization selected");
    return id;
  };

  const list = (projectId: string) =>
    $fetch<ProjectEventRow[]>(`/api/org/projects/${projectId}/events`, { query: { orgId: orgId() } });

  const create = async (projectId: string, input: Partial<ProjectEventRow> & { title: string }) => {
    try {
      const created = await $fetch<ProjectEventRow>(`/api/org/projects/${projectId}/events`, {
        method: "POST",
        body: { orgId: orgId(), ...input },
      });
      toast.success("Milestone added");
      return created;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not add milestone");
      throw e;
    }
  };

  const update = async (id: string, patch: Partial<ProjectEventRow>) => {
    try {
      return await $fetch<ProjectEventRow>(`/api/org/project-events/${id}`, {
        method: "PATCH",
        body: { orgId: orgId(), ...patch },
      });
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not update milestone");
      throw e;
    }
  };

  const remove = async (id: string) => {
    try {
      await $fetch(`/api/org/project-events/${id}`, { method: "DELETE", query: { orgId: orgId() } });
      toast.success("Milestone removed");
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not remove milestone");
      throw e;
    }
  };

  /** Preview the computed end date for the form (server recomputes on save). */
  const previewEndDate = (eventDate: string | null, durationDays: number | null) =>
    computeEndDate(eventDate, durationDays);

  /**
   * Preview the dependency cascade for an edit, BEFORE writing. Returns the
   * shift diff the confirm dialog renders. Pure — no network.
   */
  const previewShifts = (
    events: ProjectEventRow[],
    editedId: string,
    newStart: string | null,
    newDuration: number | null
  ): ScheduleShift[] =>
    computeDependencyShifts(events as unknown as ScheduleEvent[], editedId, newStart, newDuration);

  /** Apply a confirmed reschedule (the edited event + its cascade) in one call. */
  const applyReschedule = async (projectId: string, shifts: ScheduleShift[], events: ProjectEventRow[]) => {
    const durById = new Map(events.map((e) => [e.id, e.duration_days ?? null]));
    const changes = shifts.map((s) => ({
      id: s.id,
      event_date: s.newStart,
      duration_days: durById.get(s.id) ?? null,
    }));
    try {
      const res = await $fetch<{ ok: boolean; updated: number }>("/api/org/project-events/reschedule", {
        method: "POST",
        body: { orgId: orgId(), projectId, changes },
      });
      toast.success(res.updated > 1 ? `Rescheduled ${res.updated} milestones` : "Milestone rescheduled");
      return res;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not reschedule");
      throw e;
    }
  };

  /** Flag a milestone as needing approval; returns the public link + expiry. */
  const requestApproval = async (eventId: string, days = 14) => {
    try {
      const res = await $fetch<{ ok: boolean; token: string; link: string; expires: string }>(
        `/api/org/project-events/${eventId}/request-approval`,
        { method: "POST", body: { orgId: orgId(), days } }
      );
      toast.success("Approval requested");
      return res;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not request approval");
      throw e;
    }
  };

  /** In-app approve / reject a milestone. */
  const decideApproval = async (eventId: string, decision: "approved" | "rejected", note?: string) => {
    try {
      const res = await $fetch<{ ok: boolean; decision: string }>(`/api/org/project-events/${eventId}/approve`, {
        method: "POST",
        body: { orgId: orgId(), decision, note },
      });
      toast.success(decision === "approved" ? "Milestone approved" : "Milestone sent back");
      return res;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not record decision");
      throw e;
    }
  };

  /** Spawn a follow-on project from a milestone (parent_event link). */
  const spawnProject = async (eventId: string, opts: { title?: string; start_date?: string } = {}) => {
    try {
      const res = await $fetch<{ ok: boolean; projectId: string; project: any }>(
        `/api/org/project-events/${eventId}/spawn-project`,
        { method: "POST", body: { orgId: orgId(), ...opts } }
      );
      toast.success("Project spawned");
      return res;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not spawn project");
      throw e;
    }
  };

  return {
    list, create, update, remove, previewEndDate,
    previewShifts, applyReschedule, requestApproval, decideApproval, spawnProject,
  };
};
