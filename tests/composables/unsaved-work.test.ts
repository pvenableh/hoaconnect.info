// The interlock that stops a background reload from eating someone's half-typed
// announcement. It is a COUNT because several forms can be mounted at once, and
// the failure mode of getting that wrong is silent: a stuck count above zero
// disables silent updates for the rest of the session.
import { describe, it, expect, beforeEach } from "vitest";
import { ref, effectScope } from "vue";
import { useUnsavedWork } from "#core/app/composables/useUnsavedWork";

beforeEach(() => {
  // tests/setup.ts clears the shared useState store between tests.
});

describe("useUnsavedWork", () => {
  it("starts clean", () => {
    expect(useUnsavedWork().hasUnsavedWork()).toBe(false);
  });

  it("tracks one form going dirty and clean again", async () => {
    const { guardUnsaved, hasUnsavedWork } = useUnsavedWork();
    const dirty = ref(false);
    const scope = effectScope();
    scope.run(() => guardUnsaved(dirty));

    expect(hasUnsavedWork()).toBe(false);
    dirty.value = true;
    await Promise.resolve();
    expect(hasUnsavedWork()).toBe(true);
    dirty.value = false;
    await Promise.resolve();
    expect(hasUnsavedWork()).toBe(false);
    scope.stop();
  });

  it("counts several forms independently — one going clean doesn't unblock the other", async () => {
    const { guardUnsaved, hasUnsavedWork, count } = useUnsavedWork();
    const a = ref(true);
    const b = ref(true);
    const scope = effectScope();
    scope.run(() => {
      guardUnsaved(a);
      guardUnsaved(b);
    });

    expect(count.value).toBe(2);
    a.value = false;
    await Promise.resolve();
    expect(hasUnsavedWork()).toBe(true);
    b.value = false;
    await Promise.resolve();
    expect(hasUnsavedWork()).toBe(false);
    scope.stop();
  });

  it("does not double-count a form that reports dirty twice", async () => {
    const { guardUnsaved, count } = useUnsavedWork();
    const dirty = ref(true);
    const scope = effectScope();
    scope.run(() => guardUnsaved(dirty));
    expect(count.value).toBe(1);
    dirty.value = true; // no transition
    await Promise.resolve();
    expect(count.value).toBe(1);
    scope.stop();
  });

  it("releases its hold when a component unmounts while still dirty", async () => {
    const { guardUnsaved, hasUnsavedWork } = useUnsavedWork();
    const dirty = ref(true);
    const scope = effectScope();
    scope.run(() => guardUnsaved(dirty));
    expect(hasUnsavedWork()).toBe(true);

    scope.stop(); // component unmounts, still dirty
    expect(hasUnsavedWork()).toBe(false);
  });

  it("never goes negative", async () => {
    const { guardUnsaved, count } = useUnsavedWork();
    const dirty = ref(false);
    const scope = effectScope();
    scope.run(() => guardUnsaved(dirty));
    scope.stop();
    expect(count.value).toBe(0);
  });
});
