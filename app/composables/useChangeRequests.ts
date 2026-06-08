// Client API for the member self-service review workflow. Residents fetch their
// household + submit changes; reviewers list pending + decide. All calls hit the
// org-scoped server routes which enforce membership / reviewer access.

export interface HouseholdData {
  memberId: string;
  member: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    mailing_address?: { line1?: string; line2?: string; city?: string; state?: string; zip?: string } | null;
  };
  vehicles: any[];
  pets: any[];
  pendingRequests: { id: string; kind: string; action: string; target_id: string | null }[];
}

export type ChangeKind = "contact" | "mailing_address" | "vehicle" | "pet";
export type ChangeAction = "create" | "update" | "delete";

export const useChangeRequests = () => {
  // Read the shared org-selection state directly (kept in sync by useSelectedOrg,
  // which runs in the authed layout) so this composable stays synchronous.
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

  const orgId = () => {
    const id = selectedOrgId.value;
    if (!id) throw new Error("No organization selected");
    return id;
  };

  const fetchHousehold = () =>
    $fetch<HouseholdData>("/api/org/my-household", { query: { orgId: orgId() } });

  const submitChange = (input: {
    kind: ChangeKind;
    action?: ChangeAction;
    targetId?: string | null;
    payload?: Record<string, any>;
    note?: string;
  }) =>
    $fetch("/api/org/change-requests", {
      method: "POST",
      body: { orgId: orgId(), action: "update", ...input },
    });

  const listRequests = (scope: "mine" | "pending" | "all" = "mine") =>
    $fetch<{ scope: string; requests: any[] }>("/api/org/change-requests", {
      query: { orgId: orgId(), scope },
    });

  const decide = (id: string, decision: "approve" | "reject", note?: string) =>
    $fetch(`/api/org/change-requests/${id}/decide`, {
      method: "POST",
      body: { orgId: orgId(), decision, note },
    });

  return { fetchHousehold, submitChange, listRequests, decide };
};
