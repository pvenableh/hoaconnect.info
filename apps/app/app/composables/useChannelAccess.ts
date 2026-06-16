// useChannelAccess — does the current user have any channel membership in the
// org they're viewing? Channels is an internal admin/board tool, but a regular
// member can be invited into a single channel (a hoa_channel_members row). Such
// members aren't admins or board, so the dock (App/Dock.vue) needs this signal
// to show them the Channels app. Board members are covered separately via
// useCurrentDomainAccess().isBoardMemberOfCurrentDomain.
//
// Result is cached per (org, user) in shared state so the lightweight lookup
// runs once per org view, not on every render.
export const useChannelAccess = () => {
  const { activeHoa } = useActiveHoa();
  const { user } = useDirectusAuth();
  const { list } = useDirectusItems("hoa_channel_members");

  const orgId = computed(() => (activeHoa.value as any)?.id ?? null);
  const cache = useState<Record<string, boolean>>("channel-membership", () => ({}));

  const key = computed(() =>
    orgId.value && user.value?.id ? `${orgId.value}:${user.value.id}` : null
  );

  const hasChannelMembership = computed(() =>
    key.value ? !!cache.value[key.value] : false
  );

  const refresh = async () => {
    if (!key.value || !orgId.value || !user.value?.id) return;
    try {
      const rows = await list({
        fields: ["id"],
        filter: {
          user: { _eq: user.value.id },
          channel: { organization: { _eq: orgId.value } },
        },
        limit: 1,
      });
      cache.value = { ...cache.value, [key.value]: (rows?.length || 0) > 0 };
    } catch {
      // Best-effort; absence of access just hides the dock icon.
    }
  };

  return { hasChannelMembership, refresh };
};
