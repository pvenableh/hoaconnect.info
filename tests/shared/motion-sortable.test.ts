import { describe, it, expect } from "vitest";
import { moveItem, keyboardTarget, moveToOptions, applyOrder, acceptsDrop } from "#core/shared/motion";

describe("sortable plans", () => {
  it("moves an item and never mutates", () => {
    const a = ["a", "b", "c", "d"];
    expect(moveItem(a, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(a, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(a, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveItem(a, 9, 0)).toEqual(a);
    expect(a).toEqual(["a", "b", "c", "d"]);
  });
  it("undo is the inverse move", () => {
    const a = ["a", "b", "c"];
    expect(moveItem(moveItem(a, 0, 2), 2, 0)).toEqual(a);
  });
  it("keyboard targets respect orientation and edges", () => {
    expect(keyboardTarget("ArrowRight", 0, 3, "horizontal")).toBe(1);
    expect(keyboardTarget("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(keyboardTarget("ArrowLeft", 0, 3)).toBeNull();
    expect(keyboardTarget("End", 0, 3)).toBe(2);
    expect(keyboardTarget("ArrowDown", 1, 3, "vertical")).toBe(2);
    expect(keyboardTarget("x", 1, 3)).toBeNull();
  });
  it("Move to… lists every other slot", () => {
    expect(moveToOptions(3, 1).map((o) => o.position)).toEqual([1, 3]);
  });
  it("a saved order survives new and removed keys", () => {
    expect(applyOrder(["a", "b", "c"], ["c", "x", "a"])).toEqual(["c", "a", "b"]);
    expect(applyOrder(["a", "b"], null)).toEqual(["a", "b"]);
  });
  it("drop accepts by type", () => {
    expect(acceptsDrop(undefined, ["Files"])).toBe(true);
    expect(acceptsDrop(["Files"], ["text/plain"])).toBe(false);
    expect(acceptsDrop(["Files"], ["Files"])).toBe(true);
  });
});
