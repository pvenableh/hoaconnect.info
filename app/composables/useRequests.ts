/**
 * useRequests — list/create/update the generic requests/tickets system and
 * drive Tier-2 workflow transitions (app/config/requestWorkflows.ts). Status
 * and assignment changes post a system comment to the request's hoa_comments
 * thread so the timeline is the single source of truth.
 *
 * Backed by the hoa_requests collection (scripts/create-requests-collections.ts).
 */
import {
  getWorkflow,
  getStateMeta,
  type RequestType,
} from "~/config/requestWorkflows";

export interface RequestRow {
  id: string;
  status?: string | null;
  type?: RequestType | string | null;
  title?: string | null;
  description?: string | null;
  priority?: "low" | "normal" | "high" | "urgent" | string | null;
  category?: string | null;
  submitted_by?: { id: string; first_name?: string; last_name?: string } | string | null;
  assigned_to?: { id: string; first_name?: string; last_name?: string } | string | null;
  unit?: string | { id: string } | null;
  member?: string | { id: string } | null;
  due_date?: string | null;
  attachments?: string[] | null;
  metadata?: Record<string, any> | null;
  organization?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
}

const REQUEST_FIELDS = [
  "id",
  "status",
  "type",
  "title",
  "description",
  "priority",
  "category",
  "due_date",
  "attachments",
  "metadata",
  "organization",
  "date_created",
  "date_updated",
  "submitted_by.id",
  "submitted_by.first_name",
  "submitted_by.last_name",
  "assigned_to.id",
  "assigned_to.first_name",
  "assigned_to.last_name",
  "unit.id",
  "member.id",
  "member.first_name",
  "member.last_name",
];

export const useRequests = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list, get, create, update } = useDirectusItems<RequestRow>("hoa_requests");

  const list_ = (filter: Record<string, any> = {}, sort: string[] = ["-date_updated"]) =>
    list({ fields: REQUEST_FIELDS, filter: { organization: { _eq: selectedOrgId.value }, ...filter }, sort, limit: 100 });

  const getOne = (id: string) => get(id, { fields: REQUEST_FIELDS });

  const createRequest = async (input: {
    type: RequestType;
    title: string;
    description?: string;
    priority?: string;
    category?: string;
    unit?: string | null;
    member?: string | null;
    due_date?: string | null;
    attachments?: string[];
    metadata?: Record<string, any>;
    parent_request?: string | null;
  }) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    const wf = getWorkflow(input.type);
    return create({
      type: input.type,
      title: input.title,
      description: input.description || null,
      priority: input.priority || "normal",
      category: input.category || null,
      status: getStateMeta(input.type, wf.initialState).status,
      submitted_by: user.value?.id || null,
      unit: input.unit || null,
      member: input.member || null,
      due_date: input.due_date || null,
      attachments: input.attachments?.length ? input.attachments : null,
      metadata: { ...(input.metadata || {}), workflow_state: wf.initialState },
      organization: selectedOrgId.value,
      ...(input.parent_request ? { parent_request: input.parent_request } : {}),
    } as RequestRow);
  };

  const updateRequest = (id: string, patch: Partial<RequestRow>) => update(id, patch);

  // Apply a workflow transition: store the new workflow_state + mapped status,
  // then post a system comment to the request thread.
  const applyTransition = async (
    request: RequestRow,
    toState: string,
    label: string
  ) => {
    const stateMeta = getStateMeta(request.type, toState);
    await update(request.id, {
      status: stateMeta.status,
      metadata: { ...(request.metadata || {}), workflow_state: toState },
    } as Partial<RequestRow>);

    // System comment so the timeline records the change.
    try {
      const { createComment } = useComments("hoa_requests", () => request.id);
      await createComment({
        body: `<p><em>${label} — status set to <strong>${stateMeta.label}</strong></em></p>`,
      });
    } catch (e) {
      console.warn("Could not post status system comment:", e);
    }
  };

  const assign = async (request: RequestRow, userId: string | null) => {
    await update(request.id, { assigned_to: userId } as any);
    try {
      const { createComment } = useComments("hoa_requests", () => request.id);
      await createComment({
        body: `<p><em>Assignment updated.</em></p>`,
        isInternal: true,
      });
    } catch {
      /* non-fatal */
    }
  };

  const currentState = (request: RequestRow): string => {
    const wf = getWorkflow(request.type);
    return (request.metadata?.workflow_state as string) || wf.initialState;
  };

  return {
    list: list_,
    getOne,
    createRequest,
    updateRequest,
    applyTransition,
    assign,
    currentState,
    REQUEST_FIELDS,
  };
};
