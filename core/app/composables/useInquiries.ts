/**
 * useInquiries — the manage pages' requests, through the inquiries routes
 * (docs/spec-delegation.md). The same work as useRequests, read and written
 * with the app's token behind requireAreaWork, so a helper or committee
 * holding the area (a plain HOA Member in Directus) works it as a manager does.
 * The admin and resident request pages keep useRequests.
 */
import type { RequestRow } from "#core/app/composables/useRequests";
import { getStateMeta, getWorkflow } from "#core/app/config/requestWorkflows";

export interface LinkedChannel {
  id: string;
  name: string;
  slug: string;
}

export const useInquiries = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { announce } = useNotifyEvent();
  const orgId = () => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return selectedOrgId.value;
  };

  const list = () =>
    $fetch<{ requests: RequestRow[] }>("/api/org/inquiries", { query: { orgId: orgId() } }).then((r) => r.requests);

  const getOne = (id: string) =>
    $fetch<{ request: RequestRow; channel: LinkedChannel | null }>(`/api/org/inquiries/${id}`, { query: { orgId: orgId() } });

  /** Move a request along its workflow; the server picks the status and writes the note. */
  const transition = async (id: string, to: string) => {
    const res = await $fetch<{ request: RequestRow; commentId: string | null; announce: boolean }>(
      `/api/org/inquiries/${id}/transition`,
      { method: "POST", body: { orgId: orgId(), to } }
    );
    if (res.announce && res.commentId) announce("hoa_comments", res.commentId);
    return res.request;
  };

  const saveDetails = (id: string, details: Record<string, unknown>) =>
    $fetch<{ request: RequestRow }>(`/api/org/inquiries/${id}`, { method: "PATCH", body: { orgId: orgId(), details } }).then(
      (r) => r.request
    );

  /** A follow-up task on a ticket, through the manager create route. */
  const spawnTask = (parent: RequestRow, input: { title: string; description?: string | null; member?: string | null; unit?: string | null }) => {
    const initial = getWorkflow("task").initialState;
    return $fetch<{ request: { id: string } }>("/api/hoa/requests/manager-create", {
      method: "POST",
      body: {
        organization: orgId(),
        type: "task",
        title: input.title,
        description: input.description || null,
        member: input.member || null,
        unit: input.unit || null,
        status: getStateMeta("task", initial).status,
        metadata: { workflow_state: initial },
        parent_request: parent.id,
      },
    }).then((r) => r.request);
  };

  return { list, getOne, transition, saveDetails, spawnTask };
};
