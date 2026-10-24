import { describe, it, expect } from "vitest";
import { useConfirm } from "#core/app/composables/useConfirm";

describe("useConfirm", () => {
  it("resolves true on accept and false on dismiss", async () => {
    const { confirm, current, settle } = useConfirm();
    const yes = confirm({ title: "Delete this unit?", destructive: true });
    expect(current.value?.title).toBe("Delete this unit?");
    expect(current.value?.confirmLabel).toBe("Delete");
    settle(current.value!.id, true);
    await expect(yes).resolves.toBe(true);

    const no = confirm("Leave without saving?");
    expect(current.value?.confirmLabel).toBe("Confirm");
    settle(current.value!.id, false);
    await expect(no).resolves.toBe(false);
    expect(current.value).toBeNull();
  });

  it("queues a second call instead of replacing the first", async () => {
    const { confirm, current, settle } = useConfirm();
    const first = confirm("First?");
    const second = confirm("Second?");
    expect(current.value?.title).toBe("First?");
    settle(current.value!.id, false);
    expect(current.value?.title).toBe("Second?");
    settle(current.value!.id, true);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });

  it("ignores a stale settle for a dialog no longer on screen", async () => {
    const { confirm, current, settle } = useConfirm();
    const p = confirm("Only once?");
    const id = current.value!.id;
    settle(id, true);
    settle(id, false);
    await expect(p).resolves.toBe(true);
  });

  it("alert resolves on dismiss whatever the answer, with an OK label", async () => {
    const { alert, current, settle } = useConfirm();
    const done = alert({ title: "Saved", body: "Your changes are live." });
    expect(current.value?.kind).toBe("alert");
    expect(current.value?.confirmLabel).toBe("OK");
    settle(current.value!.id, false);
    await expect(done).resolves.toBeUndefined();
  });
});
