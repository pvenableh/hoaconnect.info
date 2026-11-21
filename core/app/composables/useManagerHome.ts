/**
 * useManagerHome — the reads behind the property manager's home bands
 * (docs/plan-unified-experience.md §5): requests across the areas the manager
 * can work, shaped by `core/shared/home/manager-home.ts`. One read, shared by
 * the queue and the glance components through the same async-data key.
 */
import type { RoleContext } from "#core/shared/roles/role-context";
import { AREA_KEYS, type AreaKey } from "#core/shared/transition/grants";
import {
  delegatedQueue,
  loadByArea,
  loadByCommunity,
  assigneeOptions,
  responseHoursSeries,
  type CommunityRequest,
  type ManagerRequest,
} from "#core/shared/home/manager-home";

export const useManagerHome = (roleContext: Ref<RoleContext | null | undefined>) => {
  const orgId = useState<string | null>("selectedOrgId", () => null);
  const { list, assign } = useRequests();
  // The page already awaited useSelectedOrg, which fills this key.
  const { data: memberships } = useNuxtData<any[]>("user-members");
  const config = useRuntimeConfig();
  const requestItems = useDirectusItems<any>("hoa_requests");
  const memberItems = useDirectusItems<any>("hoa_members");

  const { data, pending } = useAsyncData(
    () => `manager-home-${orgId.value}`,
    async () => (await list({}, ["date_created"])) as unknown as ManagerRequest[],
    { watch: [orgId], server: false, default: () => [] as ManagerRequest[] },
  );

  const canWork = (area: AreaKey) => !!roleContext.value?.areas?.[area]?.canWork;
  const workable = computed(() => AREA_KEYS.filter((k) => k === "inquiries" || k === "violations").filter(canWork));
  const queue = computed(() => delegatedQueue(data.value ?? [], canWork));
  const load = computed(() => loadByArea(queue.value, workable.value));
  const response = computed(() => responseHoursSeries(data.value ?? [], new Date()));

  // Per community: every community this person manages (property-manager
  // memberships), else just the one they are in.
  const communities = computed(() => {
    const pmRole = config.public.directusRolePropertyManager;
    const rows = (memberships.value ?? []).filter((m) => m.organization?.id && m.role === pmRole);
    const picked = rows.length ? rows : (memberships.value ?? []).filter((m) => m.organization?.id === orgId.value);
    return picked.map((m) => ({ id: String(m.organization.id), name: String(m.organization.name ?? "Community") }));
  });
  const { data: acrossRows } = useAsyncData(
    () => `manager-home-communities-${communities.value.map((c) => c.id).join(",")}`,
    async () =>
      communities.value.length
        ? ((await requestItems.list({
            fields: ["id", "type", "status", "organization"],
            filter: { organization: { _in: communities.value.map((c) => c.id) }, status: { _nin: ["resolved", "closed"] } },
            limit: 500,
          })) as unknown as CommunityRequest[])
        : [],
    { watch: [communities], server: false, default: () => [] as CommunityRequest[] },
  );
  const communityLoad = computed(() => loadByCommunity(acrossRows.value ?? [], communities.value, canWork));

  // Who a request can be handed to: admins and property managers of this community.
  const { data: people } = useAsyncData(
    () => `manager-home-people-${orgId.value}`,
    async () =>
      orgId.value
        ? ((await memberItems.list({
            fields: ["user.id", "user.first_name", "user.last_name"],
            filter: {
              organization: { _eq: orgId.value },
              status: { _eq: "active" },
              role: { name: { _in: ["HOA Admin", "Property Manager"] } },
            },
            limit: 50,
          })) as any[])
        : [],
    { watch: [orgId], server: false, default: () => [] as any[] },
  );
  const assignees = computed(() => assigneeOptions((people.value ?? []).map((m: any) => m.user ?? {})));

  /** Hand a request to a person ("" clears it). Updates the row in place so the queue reflects it at once. */
  const reassign = async (requestId: string, userId: string) => {
    await assign({ id: requestId } as any, userId || null);
    const who = assignees.value.find((x) => x.id === userId);
    const [first_name, ...rest] = (who?.name ?? "").split(" ");
    // New array: async-data is a shallow ref, so a replaced row is what redraws.
    data.value = (data.value ?? []).map((r: any) =>
      r.id === requestId ? { ...r, assigned_to: userId ? { id: userId, first_name, last_name: rest.join(" ") } : null } : r,
    );
    return assignees.value.find((a) => a.id === userId)?.name ?? "Unassigned";
  };

  return { queue, load, response, pending, communities, communityLoad, assignees, reassign };
};
