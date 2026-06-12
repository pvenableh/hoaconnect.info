/**
 * useTasks — polymorphic task CRUD, schedule buckets, subtask-tree assembly,
 * and kanban reorder. Calls the elevated /api/org/tasks routes.
 */
import { toast } from "vue-sonner";

export type TaskStatus = "new" | "approved" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSchedule = "today" | "this_week" | "later" | "unscheduled";

export interface TaskAssignee {
  directus_users_id?: { id: string; first_name?: string; last_name?: string; avatar?: string | null } | string;
}

export interface TaskRow {
  id: string;
  status?: TaskStatus | string | null;
  title?: string | null;
  description?: string | null;
  priority?: TaskPriority | string | null;
  schedule?: TaskSchedule | string | null;
  due_date?: string | null;
  date_completed?: string | null;
  parent_task?: string | null;
  category?: string | null;
  project?: { id: string; title?: string } | string | null;
  project_event?: { id: string; title?: string } | string | null;
  request?: { id: string; title?: string } | string | null;
  team?: string | null;
  sort?: number | null;
  assigned_to?: TaskAssignee[] | null;
  subtasks?: TaskRow[] | null;
}

/** A task plus its nested children, assembled from a flat list by parent_task. */
export interface TaskNode extends TaskRow {
  children: TaskNode[];
  depth: number;
}

export const TASK_STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "new", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Done" },
];

export const SCHEDULE_BUCKETS: { key: TaskSchedule; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "later", label: "Later" },
  { key: "unscheduled", label: "Unscheduled" },
];

export const TASK_PRIORITY_META: Record<string, { label: string; tone: string }> = {
  low: { label: "Low", tone: "stone" },
  medium: { label: "Medium", tone: "sky" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "rose" },
};

export const useTasks = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const orgId = () => {
    const id = selectedOrgId.value;
    if (!id) throw new Error("No organization selected");
    return id;
  };

  const list = (params: {
    project?: string;
    event?: string;
    request?: string;
    team?: string;
    schedule?: string;
    assignee?: "me";
    parent?: "none";
  } = {}) => $fetch<TaskRow[]>("/api/org/tasks", { query: { orgId: orgId(), ...params } });

  const create = async (input: Partial<TaskRow> & { title: string; assigned_to?: string[] }) => {
    try {
      const created = await $fetch<TaskRow>("/api/org/tasks", {
        method: "POST",
        body: { orgId: orgId(), ...input },
      });
      return created;
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not create task");
      throw e;
    }
  };

  const update = async (id: string, patch: Partial<TaskRow> & { assigned_to?: string[] }) => {
    try {
      return await $fetch<TaskRow>(`/api/org/tasks/${id}`, {
        method: "PATCH",
        body: { orgId: orgId(), ...patch },
      });
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not update task");
      throw e;
    }
  };

  const toggleComplete = (task: TaskRow) =>
    update(task.id, { status: task.status === "completed" ? "in_progress" : "completed" });

  const remove = async (id: string) => {
    try {
      await $fetch(`/api/org/tasks/${id}`, { method: "DELETE", query: { orgId: orgId() } });
    } catch (e: any) {
      toast.error(e?.statusMessage || e?.message || "Could not delete task");
      throw e;
    }
  };

  /** Persist a kanban move (sort + optional status/schedule) for many tasks. */
  const reorder = (items: { id: string; sort: number; status?: string; schedule?: string; parent_task?: string | null }[]) =>
    $fetch<{ ok: boolean; updated: number }>("/api/org/tasks/reorder", {
      method: "POST",
      body: { orgId: orgId(), items },
    });

  /** Build a parent→children tree from a flat task list (depth-capped at 3). */
  const buildTree = (tasks: TaskRow[], maxDepth = 3): TaskNode[] => {
    const byId = new Map<string, TaskNode>();
    for (const t of tasks) byId.set(t.id, { ...t, children: [], depth: 0 });
    const roots: TaskNode[] = [];
    for (const node of byId.values()) {
      const parentId = node.parent_task;
      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        node.depth = Math.min(parent.depth + 1, maxDepth);
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (nodes: TaskNode[]) => {
      nodes.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  };

  /** Group tasks into status columns for a kanban board. */
  const groupByStatus = (tasks: TaskRow[]) => {
    const cols: Record<string, TaskRow[]> = {};
    for (const c of TASK_STATUS_COLUMNS) cols[c.key] = [];
    for (const t of tasks) {
      // "approved" rides in the To Do column.
      const key = t.status === "approved" ? "new" : (t.status as string) || "new";
      if (cols[key]) cols[key].push(t);
    }
    return cols;
  };

  /** Group tasks into schedule buckets for the list view. */
  const groupBySchedule = (tasks: TaskRow[]) => {
    const buckets: Record<string, TaskRow[]> = {};
    for (const b of SCHEDULE_BUCKETS) buckets[b.key] = [];
    for (const t of tasks) {
      const key = (t.schedule as string) || "unscheduled";
      if (buckets[key]) buckets[key].push(t);
    }
    return buckets;
  };

  return {
    list, create, update, toggleComplete, remove, reorder,
    buildTree, groupByStatus, groupBySchedule,
  };
};
