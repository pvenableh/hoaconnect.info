import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useHomeAmbient,
  normalizeAmbient,
  nextAmbient,
  readStoredAmbient,
  type AmbientStyle,
} from "../../core/app/composables/useHomeAmbient";

// The composable defers its storage read to onNuxtReady on purpose (reading it
// during the hydration render would diverge from SSR). Run the callback
// immediately here so the read is observable.
const readyCallbacks: Array<() => void> = [];
vi.stubGlobal("onNuxtReady", (cb: () => void) => {
  readyCallbacks.push(cb);
  cb();
});

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

beforeEach(() => {
  store.clear();
  readyCallbacks.length = 0;
});

describe("normalizeAmbient", () => {
  it("accepts the three real styles", () => {
    for (const s of ["waves", "orbs", "off"] as AmbientStyle[]) {
      expect(normalizeAmbient(s)).toBe(s);
    }
  });

  it("falls back to waves for anything else, including nothing stored", () => {
    expect(normalizeAmbient(null)).toBe("waves");
    expect(normalizeAmbient(undefined)).toBe("waves");
    expect(normalizeAmbient("sparkles")).toBe("waves");
  });
});

describe("nextAmbient", () => {
  it("cycles waves → orbs → off → waves", () => {
    expect(nextAmbient("waves")).toBe("orbs");
    expect(nextAmbient("orbs")).toBe("off");
    expect(nextAmbient("off")).toBe("waves");
  });
});

describe("useHomeAmbient", () => {
  it("defaults to waves with nothing stored", () => {
    const a = useHomeAmbient();
    expect(a.style.value).toBe("waves");
    expect(a.on.value).toBe(true);
  });

  it("persists the choice so the preference is per-device", () => {
    const a = useHomeAmbient();
    a.set("orbs");
    expect(store.get("hoa.home.ambient")).toBe("orbs");
    expect(a.style.value).toBe("orbs");
  });

  // The kill switch the plan's Risk 7 asks for: one control, and "off" really
  // means the layer is not rendered at all.
  it("turns the whole field off", () => {
    const a = useHomeAmbient();
    a.set("off");
    expect(a.on.value).toBe(false);
    expect(a.label.value).toBe("Off");
    expect(a.nextLabel.value).toBe("Waves");
  });

  it("reads a stored preference back on the next visit", () => {
    store.set("hoa.home.ambient", "off");
    expect(readStoredAmbient()).toBe("off");
  });

  it("reads the default when storage itself throws", () => {
    const real = globalThis.localStorage;
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readStoredAmbient()).toBe("waves");
    vi.stubGlobal("localStorage", real);
  });

  it("survives storage throwing, as it does in private mode", () => {
    const a = useHomeAmbient();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => a.cycle()).not.toThrow();
    expect(a.style.value).toBe("orbs");
  });
});
