/**
 * Shared "there is unsaved input on screen" flag.
 *
 * The update system silently reloads a backgrounded client (see
 * app/plugins/app-update.client.ts). That silent reload is free UX — unless
 * someone is mid-way through a form, where it would throw away what they typed.
 * Forms register their dirty state here and the updater holds off while anything
 * is dirty. The update is deferred, never lost: the prompt still appears when
 * they return, and the silent reload retries on the next clean background.
 */
export function useUnsavedWork() {
  // A COUNT, not a boolean: several forms can be mounted at once (an admin
  // editor with multiple sections, a modal over a page), and each must be able
  // to release only its own hold.
  const count = useState<number>("unsaved-work-count", () => 0);

  /**
   * Bind a form's "is dirty" ref to the global count for the lifetime of the
   * calling component. Increments when it goes dirty, decrements when it goes
   * clean, and always releases on unmount — a component that unmounts while
   * dirty must not leave the count stuck above zero forever, which would
   * disable silent updates for the rest of the session.
   */
  function guardUnsaved(isDirty: Ref<boolean> | ComputedRef<boolean>) {
    // Nothing to track during SSR — there is no user typing into a server
    // render. Phrased as "not on the server" rather than "on the client" so the
    // guard means what it says outside Nuxt too (tests, any other runtime).
    if (import.meta.server) return;
    let counted = false;
    const sync = (dirty: boolean) => {
      if (dirty && !counted) {
        count.value++;
        counted = true;
      } else if (!dirty && counted) {
        count.value = Math.max(0, count.value - 1);
        counted = false;
      }
    };
    watch(isDirty, sync, { immediate: true });
    onScopeDispose(() => sync(false));
  }

  const hasUnsavedWork = () => count.value > 0;

  return { guardUnsaved, hasUnsavedWork, count };
}
