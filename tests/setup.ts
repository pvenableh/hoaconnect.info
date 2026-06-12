import { vi } from "vitest";
import { computed, ref, readonly, reactive, watch } from "vue";

// Provide Nuxt auto-imports as globals so composables/utils import cleanly in
// plain vitest (no Nuxt runtime). Anything session/Directus-shaped is stubbed
// per-test with vi.stubGlobal.
vi.stubGlobal("computed", computed);
vi.stubGlobal("ref", ref);
vi.stubGlobal("reactive", reactive);
vi.stubGlobal("watch", watch);
vi.stubGlobal("readonly", readonly);
vi.stubGlobal("useState", (_key: string, init?: () => unknown) => ref(init?.()));

// h3's createError — return an Error carrying statusCode like H3Error does,
// so `throw createError({...})` is assertable in tests.
vi.stubGlobal("createError", (input: { statusCode?: number; message?: string }) =>
  Object.assign(new Error(input?.message || "error"), input)
);
