// The one rule the whole versioning system reduces to. Getting it wrong is
// user-visible in the worst way: reloading a page someone is typing into.
import { describe, it, expect } from "vitest";
import { decideUpdateAction } from "#core/shared/app/update-policy";

describe("decideUpdateAction", () => {
  it("reloads silently when nobody is looking and nothing is at stake", () => {
    expect(decideUpdateAction({ visible: false, dirty: false })).toBe("reload");
  });

  it("defers rather than throwing away unsaved input", () => {
    expect(decideUpdateAction({ visible: false, dirty: true })).toBe("defer");
  });

  it("never reloads a page the user is looking at", () => {
    expect(decideUpdateAction({ visible: true, dirty: false })).toBe("prompt");
    expect(decideUpdateAction({ visible: true, dirty: true })).toBe("prompt");
  });

  it("never silently reloads while a form is dirty, whatever the visibility", () => {
    // The property that actually matters — stated directly so a future change
    // to the branch order can't quietly break it.
    for (const visible of [true, false]) {
      expect(decideUpdateAction({ visible, dirty: true })).not.toBe("reload");
    }
  });
});
