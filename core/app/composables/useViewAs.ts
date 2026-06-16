// useViewAs — persistent "view as" preview mode for admins.
//
// `?as=member` was only a per-page query on the clean root, so navigating to any
// other page dropped it and the UI reverted to the admin view. This keeps the
// member preview STICKY across the whole workspace (a session cookie) until the
// admin explicitly exits. The PUBLIC-landing preview stays query-driven
// (`?preview`) and is unrelated to this.
//
// Read by the role-gated UI (showAdminUI in App/Nav · Dock · Sidebar, and the
// member-dashboard switch in [slug]/index.vue). It only ever *relaxes* an admin's
// UI to the member view — it never grants extra access, and non-admins are
// unaffected (they're not admins, so the `&& !isPreviewingMember` gate is moot).
export const useViewAs = () => {
  // Session cookie (no maxAge) → survives navigation + reloads within the session
  // but clears when the browser closes, so an admin never gets permanently stuck
  // in member view. SSR-readable, so first paint after a hard nav is correct.
  const viewAs = useCookie<"admin" | "member">("org-view-as", {
    default: () => "admin",
    sameSite: "lax",
    path: "/",
  });

  const isPreviewingMember = computed(() => viewAs.value === "member");

  const setViewAs = (mode: "admin" | "member") => {
    viewAs.value = mode;
  };

  return { viewAs, isPreviewingMember, setViewAs };
};
