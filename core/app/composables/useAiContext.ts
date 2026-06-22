// useAiContext — the page→assistant context bus.
//
// Pages push a small structured hint about what the user is looking at
// (useAiContext().setContext({ label: "March 2026 Minutes", entityType:
// "meeting", entityId })). The assistant panel reads currentContext and sends
// it with each chat turn so the model knows the user's vantage point WITHOUT
// scraping the DOM. The current route is always included.
//
// Context self-expires: it's stamped with the route it was set on, so when the
// user navigates away the entity hint is dropped automatically — no watchers to
// leak, and no stale "you're viewing X" bleeding onto the next page.

export interface AiPageContext {
  /** Human label for what's on screen, e.g. "March 2026 Minutes". */
  label?: string;
  /** Coarse entity kind, e.g. "meeting" | "document" | "member" | "request". */
  entityType?: string;
  /** Id of the focused entity, if any. */
  entityId?: string;
  /** A short blurb the page wants the assistant to know about this view. */
  summary?: string;
}

/** What the panel sends to the chat route. */
export interface AiResolvedContext extends AiPageContext {
  route: string;
}

const pageContext = ref<(AiPageContext & { _path: string }) | null>(null);

export const useAiContext = () => {
  const route = useRoute();

  const setContext = (ctx: AiPageContext | null) => {
    pageContext.value = ctx ? { ...ctx, _path: route.fullPath } : null;
  };
  const clearContext = () => {
    pageContext.value = null;
  };

  const currentContext = computed<AiResolvedContext>(() => {
    const base: AiResolvedContext = { route: route.fullPath };
    const ctx = pageContext.value;
    if (ctx && ctx._path === route.fullPath) {
      const { _path: _drop, ...rest } = ctx;
      return { ...base, ...rest };
    }
    return base;
  });

  return { pageContext, currentContext, setContext, clearContext };
};
