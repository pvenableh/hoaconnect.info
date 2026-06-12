import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useModules, CORE_MODULE_KEYS } from "~/composables/useModules";

let activeHoa: ReturnType<typeof ref<Record<string, unknown> | null>>;

beforeEach(() => {
  activeHoa = ref<Record<string, unknown> | null>(null);
  vi.stubGlobal("useActiveHoa", () => ({ activeHoa }));
});

describe("useModules", () => {
  it("treats a missing modules column as everything enabled", () => {
    activeHoa.value = { id: "org-1" };
    const { isEnabled } = useModules();
    expect(isEnabled("payments")).toBe(true);
    expect(isEnabled("channels")).toBe(true);
  });

  it("treats a missing key as enabled (existing orgs lose nothing)", () => {
    activeHoa.value = { modules: { payments: false } };
    const { isEnabled } = useModules();
    expect(isEnabled("announcements")).toBe(true);
  });

  it("disables a module explicitly set to false", () => {
    activeHoa.value = { modules: { payments: false } };
    const { isEnabled } = useModules();
    expect(isEnabled("payments")).toBe(false);
  });

  it("enables a module explicitly set to true", () => {
    activeHoa.value = { modules: { board: true } };
    const { isEnabled } = useModules();
    expect(isEnabled("board")).toBe(true);
  });

  it("core modules are always enabled, even if the org tries to disable them", () => {
    activeHoa.value = {
      modules: Object.fromEntries(CORE_MODULE_KEYS.map((k) => [k, false])),
    };
    const { isEnabled } = useModules();
    for (const key of CORE_MODULE_KEYS) {
      expect(isEnabled(key), `core module "${key}"`).toBe(true);
    }
  });

  it("handles a malformed modules payload gracefully", () => {
    activeHoa.value = { modules: "oops" };
    const { isEnabled } = useModules();
    expect(isEnabled("documents")).toBe(true);
  });

  it("reacts to org switches", () => {
    activeHoa.value = { modules: { polls: false } };
    const { isEnabled } = useModules();
    expect(isEnabled("polls")).toBe(false);
    activeHoa.value = { modules: { polls: true } };
    expect(isEnabled("polls")).toBe(true);
  });
});
