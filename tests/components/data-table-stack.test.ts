/**
 * Stacked rows for AppDataTable (app/components/App/data-table-stack.ts): which
 * columns land on which line. The component only draws what this returns, so a
 * page that names a column wrongly falls back to the plain table instead of
 * drawing an empty one.
 */
import { describe, it, expect } from "vitest";
import { resolveStack } from "~/components/App/data-table-stack";

const cols = ["title", "who", "cadence", "basis", "status"].map((key) => ({ key }));
const keys = (cs: { key: string }[]) => cs.map((c) => c.key);

describe("resolveStack", () => {
  it("no stack is no stacked view", () => {
    expect(resolveStack(cols, undefined)).toBeNull();
    expect(resolveStack(cols, null)).toBeNull();
  });

  it("puts the primary and the end on line one and the meta columns on line two, in the order given", () => {
    const v = resolveStack(cols, { primary: "title", end: "status", meta: ["cadence", "who", "basis"] })!;
    expect(v.primary.key).toBe("title");
    expect(v.end?.key).toBe("status");
    expect(keys(v.meta)).toEqual(["cadence", "who", "basis"]);
  });

  it("an end column is optional", () => {
    const v = resolveStack(cols, { primary: "title", meta: ["who"] })!;
    expect(v.end).toBeNull();
  });

  it("a primary that is not a column is no stack: the page falls back to the table", () => {
    expect(resolveStack(cols, { primary: "nope", meta: ["who"] })).toBeNull();
  });

  it("ignores meta columns that do not exist", () => {
    const v = resolveStack(cols, { primary: "title", meta: ["who", "typo", "cadence"] })!;
    expect(keys(v.meta)).toEqual(["who", "cadence"]);
  });

  it("draws no column twice: the primary and the end are not repeated on line two", () => {
    const v = resolveStack(cols, { primary: "title", end: "status", meta: ["title", "who", "status", "cadence"] })!;
    expect(keys(v.meta)).toEqual(["who", "cadence"]);
  });

  it("an end that is not a column is dropped", () => {
    expect(resolveStack(cols, { primary: "title", end: "nope", meta: [] })!.end).toBeNull();
  });

  it("bare names the meta columns drawn without their label", () => {
    const v = resolveStack(cols, { primary: "title", meta: ["who", "cadence"], bare: ["who"] })!;
    expect(v.bare.has("who")).toBe(true);
    expect(v.bare.has("cadence")).toBe(false);
    expect(resolveStack(cols, { primary: "title", meta: [] })!.bare.size).toBe(0);
  });

  it("keeps the caller's column objects, so slots and values still resolve", () => {
    const withValue = [{ key: "title", value: () => "x" }, { key: "who" }];
    const v = resolveStack(withValue, { primary: "title", meta: ["who"] })!;
    expect(v.primary).toBe(withValue[0]);
  });
});
