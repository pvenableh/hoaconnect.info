// useCreateIntent — open a page's own create flow when the URL asks for it.
//
// A create verb (core/shared/create-verbs.ts) runs by navigating to the page
// that owns the form with `?new=<verb>`. That page calls this ONCE with its own
// opener — the same function its "Add …" button calls — so Spotlight, the Nav's
// "+ New" menu and the page's button all open one form, never a second copy.
//
// The param is consumed (replaced away) once the opener has run, so a refresh,
// a Back into the page or a shared link opens the page, not the form again.
// Watches the query as well as mount: a verb run while already on its page
// changes only the query, and the page does not remount.
import type { VerbId } from "#core/shared/create-verbs";

export function useCreateIntent(verb: VerbId, open: () => void) {
  const route = useRoute();
  const router = useRouter();

  const consume = async () => {
    if (route.query.new !== verb) return;
    open();
    // After the opener's own reactive work has flushed, so a query write it
    // triggers (a tab, a filter) lands first and this one builds on it rather
    // than racing it with a stale copy of the query.
    await nextTick();
    if (route.query.new !== verb) return;
    const { new: _consumed, ...rest } = route.query;
    await router.replace({ query: rest });
  };

  onMounted(consume);
  watch(
    () => route.query.new,
    (v) => {
      if (v === verb) consume();
    }
  );
}
