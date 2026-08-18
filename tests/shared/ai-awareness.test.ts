import { describe, it, expect } from "vitest";
import {
  buildAwareness,
  excludedKeysOf,
  entityKnowledgeLabel,
} from "#core/shared/ai/awareness";

describe("buildAwareness", () => {
  it("always includes organization, included by default", () => {
    const items = buildAwareness({});
    expect(items.map((i) => i.key)).toEqual(["organization"]);
    expect(items[0]!.included).toBe(true);
  });

  it("adds documents only when RAG is available", () => {
    expect(buildAwareness({}).some((i) => i.key === "documents")).toBe(false);
    expect(buildAwareness({ ragAvailable: true }).some((i) => i.key === "documents")).toBe(true);
  });

  it("adds an entity source with a per-type label when focused", () => {
    const items = buildAwareness({ entityType: "vendor" });
    const ent = items.find((i) => i.key === "entity");
    expect(ent).toBeTruthy();
    expect(ent!.label.toLowerCase()).toContain("vendor");
  });

  it("marks excluded keys as not included (accepts array or Set)", () => {
    const viaArray = buildAwareness({ ragAvailable: true, entityType: "member", excluded: ["documents"] });
    expect(viaArray.find((i) => i.key === "documents")!.included).toBe(false);
    expect(viaArray.find((i) => i.key === "organization")!.included).toBe(true);

    const viaSet = buildAwareness({ ragAvailable: true, excluded: new Set(["organization"]) });
    expect(viaSet.find((i) => i.key === "organization")!.included).toBe(false);
  });

  it("excludedKeysOf returns exactly the toggled-off keys", () => {
    const items = buildAwareness({ ragAvailable: true, entityType: "project", excluded: ["documents"] });
    expect(excludedKeysOf(items)).toEqual(["documents"]);
    expect(excludedKeysOf(buildAwareness({}))).toEqual([]);
  });

  it("entityKnowledgeLabel falls back gracefully for unknown types", () => {
    expect(entityKnowledgeLabel("gizmo")).toContain("gizmo");
    expect(entityKnowledgeLabel("member").toLowerCase()).toContain("member");
  });
});
