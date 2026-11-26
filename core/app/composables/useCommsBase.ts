/**
 * Where the email pages live for this viewer: under /admin/communications for
 * an admin, under /manage/communications for a property manager or a helper
 * or committee holding the communications area (docs/spec-delegation.md). The
 * Email* page components are shared; each navigates under the base it was
 * opened from, so a helper never lands on an admin-only page.
 */
export const useCommsBase = () => {
  const route = useRoute();
  const managed = computed(() => route.path.includes("/manage/communications"));
  const base = computed(() => (managed.value ? "/manage/communications" : "/admin/communications"));
  return { managed, base, path: (sub = "") => `${base.value}${sub}` };
};
