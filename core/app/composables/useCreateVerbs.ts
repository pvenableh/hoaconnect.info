// useCreateVerbs — the gated create verbs for the org being viewed, and the
// one way to run them. The declarations and the gate are in
// core/shared/create-verbs.ts; read its header first.
//
// Consumers: the Nav's "+ New" menu (App/CreateMenu.vue) and Spotlight's
// Create group. Both read `verbs` (already gated) and call `run`; neither
// carries a gate of its own.
import {
  createVerb,
  matchVerbs,
  visibleVerbs,
  type CreateVerb,
  type VerbId,
} from "#core/shared/create-verbs";

export function useCreateVerbs() {
  const route = useRoute();
  const { isEnabled } = useModules();
  const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
  const { isPreviewingMember } = useViewAs();
  const { navigateToOrg } = useOrgNavigation();

  const verbs = computed<CreateVerb[]>(() =>
    visibleVerbs({
      isAdmin: !!route.params.slug && !isPreviewingMember.value && isAdminOfCurrentDomain.value,
      isEnabled,
    })
  );

  /** Navigate to the verb's page; the page opens its own form (useCreateIntent). */
  const run = (id: VerbId) => {
    // Belt and braces: every list is gated already, but `run` is exported.
    if (!verbs.value.some((v) => v.id === id)) return;
    return navigateToOrg(createVerb(id).to);
  };

  const matching = (query: string) => matchVerbs(query, verbs.value);

  return { verbs, run, matching };
}
