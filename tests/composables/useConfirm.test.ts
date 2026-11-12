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

  it("prompt resolves the trimmed text on the action and null on cancel", async () => {
    const { prompt, current, settle } = useConfirm();
    const given = prompt({ title: "Report this message?", label: "Reason (optional)", multiline: true, confirmLabel: "Report" });
    expect(current.value?.kind).toBe("prompt");
    expect(current.value?.field).toMatchObject({ label: "Reason (optional)", multiline: true, defaultValue: "" });
    settle(current.value!.id, true, "  spam  ");
    await expect(given).resolves.toBe("spam");

    const blank = prompt({ title: "Note?" });
    settle(current.value!.id, true, "");
    await expect(blank).resolves.toBe("");

    const cancelled = prompt({ title: "Note?", defaultValue: "kept" });
    expect(current.value?.field?.defaultValue).toBe("kept");
    settle(current.value!.id, false, "typed anyway");
    await expect(cancelled).resolves.toBeNull();
    expect(current.value).toBeNull();
  });

  it("a required prompt ignores a blank or too-long action and stays open", async () => {
    const { prompt, current, settle } = useConfirm();
    const p = prompt({ title: "New project title", required: true, maxLength: 5 });
    const id = current.value!.id;
    settle(id, true, "   ");
    settle(id, true, "toolong");
    expect(current.value?.id).toBe(id);
    settle(id, true, "Pool");
    await expect(p).resolves.toBe("Pool");
  });

  it("queues a prompt behind a confirm like any other dialog", async () => {
    const { confirm, prompt, current, settle } = useConfirm();
    const first = confirm("First?");
    const second = prompt({ title: "Then a note" });
    settle(current.value!.id, true);
    expect(current.value?.kind).toBe("prompt");
    settle(current.value!.id, true, "ok");
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe("ok");
  });
});
