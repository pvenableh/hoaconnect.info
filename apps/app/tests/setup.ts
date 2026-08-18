import { vi, beforeEach } from "vitest";
import { computed, ref, readonly, reactive, watch, watchEffect, nextTick, onScopeDispose } from "vue";

// Provide Nuxt auto-imports as globals so composables/utils import cleanly in
// plain vitest (no Nuxt runtime). Anything session/Directus-shaped is stubbed
// per-test with vi.stubGlobal.
vi.stubGlobal("computed", computed);
vi.stubGlobal("ref", ref);
vi.stubGlobal("reactive", reactive);
vi.stubGlobal("watch", watch);
vi.stubGlobal("watchEffect", watchEffect);
vi.stubGlobal("nextTick", nextTick);
vi.stubGlobal("readonly", readonly);
vi.stubGlobal("onScopeDispose", onScopeDispose);

// useState dedupes by key like real Nuxt (two callers of useState("x") share
// one ref) — composables like useAppSlideOverStack rely on that. The store
// resets between tests.
const stateStore = new Map<string, ReturnType<typeof ref>>();
vi.stubGlobal("useState", (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) stateStore.set(key, ref(init?.()));
  return stateStore.get(key)!;
});
beforeEach(() => {
  stateStore.clear();
});

// h3's createError — return an Error carrying statusCode like H3Error does,
// so `throw createError({...})` is assertable in tests.
vi.stubGlobal("createError", (input: { statusCode?: number; message?: string }) =>
  Object.assign(new Error(input?.message || "error"), input)
);
