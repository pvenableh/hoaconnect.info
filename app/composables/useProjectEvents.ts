/**
 * useProjectEvents — CRUD for milestones/phases on a project, plus the
 * business-day end-date helper (shared with the server).
 */
import { toast } from "vue-sonner";
import { computeEndDate } from "~~/shared/projects/schedule";

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
  cost_amount?: number | string | null;
  sort?: number | null;
  tasks?: any[] | null;
  spawned_projects?: any[] | null;
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

  return { list, create, update, remove, previewEndDate };
};
