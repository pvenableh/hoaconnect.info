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
  pendingRequests: { id: string; kind: string; action: string; target_id: string | null; payload?: Record<string, any> | null }[];
  /** The units the resident is linked to here, primary first. */
  units: { id: string; unit_number: string | null }[];
  /** The units they own here, primary first: an owner may report a lease on one. */
  ownedUnits: { id: string; unit_number: string | null }[];
  /** Active leases they are the owner or tenant of. */
  leases: HouseholdLease[];
}

export interface HouseholdLease {
  id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  document?: string | null;
  owner?: string | null;
  unit?: { id: string; unit_number?: string | null } | null;
  tenant?: { id: string; first_name?: string | null; last_name?: string | null } | null;
  /** Invited by the owner's report; set until they join. */
  invited_tenant?: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

export type ChangeKind = "contact" | "mailing_address" | "vehicle" | "pet" | "lease";
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
    $fetch<{ success: boolean; status: string; lease?: { tenant: string; tenantName: string; unitNumber: string | null } }>(
      `/api/org/change-requests/${id}/decide`,
      {
        method: "POST",
        body: { orgId: orgId(), decision, note },
      }
    );

  /** An owner's signed lease (one PDF), stored for a lease report. */
  const uploadLeaseDocument = (file: File) => {
    const form = new FormData();
    form.append("orgId", orgId());
    form.append("file", file, file.name);
    return $fetch<{ id: string; filename: string }>("/api/org/change-requests/lease-document", { method: "POST", body: form });
  };

  /** Where a reviewer or the owner opens a lease report's document. */
  const requestDocumentUrl = (requestId: string) =>
    `/api/org/change-requests/${requestId}/document?orgId=${encodeURIComponent(orgId())}`;

  return { fetchHousehold, submitChange, listRequests, decide, uploadLeaseDocument, requestDocumentUrl };
};
