// useAiAwareness — the reactive "what the AI can see" state behind the awareness
// chip. Reads the live focus (useAiContext) + whether RAG is available, produces
// the togglable knowledge list, and tracks which sources the user switched off.
//
// Exclusions are keyed by the current context so they reset automatically when
// the user moves to a different entity/section — no watchers to leak. The chat
// composable reads `excludedKeys` and sends it so the server enforces the gate.

import { buildAwareness, excludedKeysOf, type AwareItem } from "#core/shared/ai/awareness";

// Module-level shared state (mirrors useAiContext / useAiAssistant).
const ragAvailable = ref(false);
const excludedState = ref<{ key: string; set: Set<string> }>({ key: "", set: new Set() });

export const useAiAwareness = () => {
  const { currentContext } = useAiContext();

  // A stable key for "what we're grounded on right now" — the focused entity, or
  // the section/route. Changing it discards stale exclusions.
  const contextKey = computed(() => {
    const c = currentContext.value;
    return c.entityType && c.entityId ? `${c.entityType}:${c.entityId}` : c.scope || c.route || "";
  });

  const excludedSet = computed(() =>
    excludedState.value.key === contextKey.value ? excludedState.value.set : new Set<string>()
  );

  const knowledge = computed<AwareItem[]>(() =>
    buildAwareness({
      entityType: currentContext.value.entityType,
      ragAvailable: ragAvailable.value,
      excluded: excludedSet.value,
    })
  );

  /** Keys currently toggled OFF — sent to the chat route to gate grounding. */
  const excludedKeys = computed(() => excludedKeysOf(knowledge.value));

  function toggle(key: string) {
    const ck = contextKey.value;
    const set = new Set(excludedState.value.key === ck ? excludedState.value.set : []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    excludedState.value = { key: ck, set };
  }

  function setRagAvailable(v: boolean) {
    ragAvailable.value = v;
  }

  return { knowledge, excludedKeys, toggle, setRagAvailable, ragAvailable };
};
