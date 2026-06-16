/**
 * useProjects — list/get/create/update/archive projects and promote a request
 * into a project. All calls go through the elevated /api/org/projects routes
 * (server enforces admin / PM-projects / team-lead write access and member
 * read scoping), NOT the Directus client directly.
 */
import { toast } from "vue-sonner";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export interface ProjectAssignee {
  directus_users_id?: { id: string; first_name?: string; last_name?: string; avatar?: string | null } | string;
}

export interface ProjectRow {
  id: string;
  status?: ProjectStatus | string | null;
  title?: string | null;
  description?: string | null;
  team?: { id: string; name?: string; color?: string | null; icon?: string | null } | string | null;
  parent_project?: { id: string; title?: string } | string | null;
  parent_event?: { id: string; title?: string } | string | null;
  start_date?: string | null;
  due_date?: string | null;
  completion_date?: string | null;
  color?: string | null;
  icon?: string | null;
  member_visible?: boolean | null;
  budget_amount?: number | string | null;
  actual_spend?: number | string | null;
  sort?: number | null;
  assigned_to?: ProjectAssignee[] | null;
  events?: any[] | null;
  tasks?: any[] | null;
  children?: any[] | null;
  requests?: any[] | null;
  vendors?: ProjectVendor[] | null;
  files?: any[] | null;
  /** Σ of payment_expenses.project rolled up server-side (elevated only). */
  expense_total?: number | null;
  date_created?: string | null;
  date_updated?: string | null;
}

export interface ProjectVendor {
  id: string;
  role?: string | null;
  hoa_vendors_id?: { id: string; name?: string; category?: string | null } | string | null;
}

export const PROJECT_STATUS_META: Record<string, { label: string; tone: string }> = {
  planning: { label: "Planning", tone: "sky" },
  active: { label: "Active", tone: "emerald" },
  on_hold: { label: "On Hold", tone: "amber" },
  completed: { label: "Completed", tone: "violet" },
  archived: { label: "Archived", tone: "stone" },
};

export const BOARD_COLUMNS: { key: ProjectStatus; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
];

export const useProjects = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

  const orgId = () => {
    const id = selectedOrgId.value;
    if (!id) throw new Error("No organization selected");
    return id;
  };

  const list = (params: { status?: string; team?: string; parent?: string } = {}) =>
    $fetch<ProjectRow[]>("/api/org/projects", { query: { orgId: orgId(), ...params } });

  const getOne = (id: string) =>
    $fetch<ProjectRow>(`/api/org/projects/${id}`, { query: { orgId: orgId() } });

  /** All projects + their events, compact, for the org-wide timeline view. */
  const timeline = () =>
    $fetch<ProjectRow[]>("/api/org/projects-timeline", { query: { orgId: orgId() } });

  /** Replace a project's vendor set (M2M). Each entry: { vendor, role? }. */
  const setVendors = async (id: string, vendors: { vendor: string; role?: string | null }[]) => {
    try {
      return await $fetch<ProjectRow>(`/api/org/projects/${id}`, {
        method: "PATCH",
        body: { orgId: orgId(), vendors },
      });
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not update vendors");
      throw e;
    }
  };

  const create = async (input: Partial<ProjectRow> & { title: string; assigned_to?: string[] }) => {
    try {
      const created = await $fetch<ProjectRow>("/api/org/projects", {
        method: "POST",
        body: { orgId: orgId(), ...input },
      });
      toast.success("Project created");
      return created;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not create project");
      throw e;
    }
  };

  const update = async (id: string, patch: Partial<ProjectRow> & { assigned_to?: string[] }) => {
    try {
      return await $fetch<ProjectRow>(`/api/org/projects/${id}`, {
        method: "PATCH",
        body: { orgId: orgId(), ...patch },
      });
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not update project");
      throw e;
    }
  };

  const setStatus = (id: string, status: ProjectStatus) => update(id, { status });

  const archive = (id: string) => update(id, { status: "archived" });

  const remove = async (id: string) => {
    try {
      await $fetch(`/api/org/projects/${id}`, { method: "DELETE", query: { orgId: orgId() } });
      toast.success("Project deleted");
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not delete project");
      throw e;
    }
  };

  /** Promote a request into a brand-new project. */
  const promoteRequest = async (
    requestId: string,
    opts: { title?: string; team?: string; member_visible?: boolean } = {}
  ) => {
    try {
      const res = await $fetch<{ ok: boolean; projectId: string; project: ProjectRow }>(
        `/api/org/requests/${requestId}/promote`,
        { method: "POST", body: { orgId: orgId(), ...opts } }
      );
      toast.success("Request promoted to project");
      return res;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not promote request");
      throw e;
    }
  };

  /** Group projects into kanban columns by status (archived excluded). */
  const groupByStatus = (projects: ProjectRow[]) => {
    const cols: Record<string, ProjectRow[]> = {};
    for (const c of BOARD_COLUMNS) cols[c.key] = [];
    for (const p of projects) {
      const key = (p.status as string) || "planning";
      if (cols[key]) cols[key].push(p);
    }
    return cols;
  };

  return {
    list, getOne, timeline, create, update, setStatus, archive, remove,
    setVendors, promoteRequest, groupByStatus,
  };
};
