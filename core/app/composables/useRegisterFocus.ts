// useRegisterFocus — the responsibilities register's focus, kept in the URL
// (Session 18): `?holder=` (a rail key: "member:<id>", "office:treasurer", …)
// and `?unassigned=` ("0" hides the jobs nobody holds, "1" shows them; absent
// is the page's default). Grid and Map read the same two, so switching views
// keeps the focus and a link reopens it. The rules are pure, in
// core/shared/responsibilities/focus.ts.
//
// Like a segmented control's `?tab=` (useTabQuery), a change replaces the URL
// rather than pushing: Back leaves the page instead of stepping through picks.
import { parseUnassigned, type RegisterFocus } from "#core/shared/responsibilities/focus";

export function useRegisterFocus(opts: { unassignedDefault: boolean }) {
  const route = useRoute();
  const router = useRouter();

  function write(patch: Record<string, string | null>) {
    const query = { ...route.query };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete query[k];
      else query[k] = v;
    }
    void router.replace({ query });
  }

  const holder = computed<string | null>({
    get: () => {
      const raw = route.query.holder;
      const v = Array.isArray(raw) ? raw[0] : raw;
      return typeof v === "string" && v ? v : null;
    },
    set: (v) => write({ holder: v || null }),
  });

  const unassigned = computed<boolean>({
    get: () => parseUnassigned(route.query.unassigned, opts.unassignedDefault),
    // The default stays out of the URL.
    set: (v) => write({ unassigned: v === opts.unassignedDefault ? null : v ? "1" : "0" }),
  });

  const focus = computed<RegisterFocus>(() => ({ holder: holder.value, unassigned: unassigned.value }));

  /** "Show all" from an empty focus: everyone, and the jobs nobody holds. */
  function showAll() {
    write({ holder: null, unassigned: opts.unassignedDefault ? null : "1" });
  }

  return { holder, unassigned, focus, showAll };
}
