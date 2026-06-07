// plugins/org-slug-sync.client.ts
// Keep the SELECTED org in lockstep with the org you're VIEWING (the URL slug).
// On a slug route the user is a member of, that org becomes the selected org so
// the dashboard hero/data and the dock (which gates on the slug org) never
// disagree.
//
// SSR + first load are handled inside useSelectedOrg (STEP 3.5). This plugin
// covers client-side navigation between orgs — manual links, browser
// back/forward — where memberships are already cached and the membership fetch
// doesn't re-run, so the in-fetch step wouldn't fire.
export default defineNuxtPlugin(async () => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) return;

  const route = useRoute();
  const { memberships, selectedOrgId, setOrganization } = await useSelectedOrg();

  watch(
    () => route.params.slug,
    (slug) => {
      if (!slug) return;
      const list = (memberships.value as any[]) || [];
      const match = list.find((m: any) => m?.organization?.slug === slug);
      const id = match?.organization?.id;
      if (id && selectedOrgId.value !== id) setOrganization(id);
    }
  );
});
