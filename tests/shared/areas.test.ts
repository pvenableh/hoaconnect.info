/**
 * The one area list (core/shared/transition/grants.ts, docs/spec-role-context.md).
 *
 * The grant keys are derived from it, so these tests pin what the derivation
 * must keep: the old nine keys in the old order (presets, revocation, the
 * ledger and the settings screen all walk them), and no grant without a gate.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AREAS,
  AREA_KEYS,
  GRANT_PRESETS,
  MANAGER_GRANT_KEYS,
  MANAGER_GRANT_LABELS,
  areaLabel,
  grantLabel,
  isAreaKey,
} from "#core/shared/transition/grants";

describe("the area list", () => {
  it("every area has a key, a noun label, and appears once", () => {
    expect(new Set(AREA_KEYS).size).toBe(AREAS.length);
    for (const a of AREAS) {
      expect(a.label, a.key).toBeTruthy();
      expect(a.label).not.toBe(a.key);
      expect(areaLabel(a.key)).toBe(a.label);
    }
  });

  it("holds vendors and billing", () => {
    expect(AREA_KEYS).toContain("vendors");
    expect(AREA_KEYS).toContain("billing");
  });

  it("grant keys derive from the areas, in the old order", () => {
    expect([...MANAGER_GRANT_KEYS]).toEqual([
      "inquiries",
      "violations",
      "directory",
      "documents",
      "communications",
      "feedback",
      "projects",
      "activity",
      "contact_platform",
    ]);
  });

  it("an area with no gate is not grantable", () => {
    for (const a of AREAS) {
      const grantable = (MANAGER_GRANT_KEYS as readonly string[]).includes(a.key);
      expect(grantable, a.key).toBe(a.gate !== null);
    }
    expect(MANAGER_GRANT_KEYS).not.toContain("vendors");
    expect(MANAGER_GRANT_KEYS).not.toContain("billing");
  });

  it("every gate is a real file that names its key", () => {
    for (const a of AREAS) {
      if (a.gate === null) continue;
      const path = join(process.cwd(), a.gate);
      expect(existsSync(path), a.gate).toBe(true);
      expect(readFileSync(path, "utf8"), `${a.gate} names ${a.key}`).toContain(a.key);
    }
  });

  it("presets cover exactly the grant keys", () => {
    for (const p of GRANT_PRESETS) {
      expect(Object.keys(p.grants).sort()).toEqual([...MANAGER_GRANT_KEYS].sort());
    }
  });

  it("grant labels are the area labels", () => {
    for (const k of MANAGER_GRANT_KEYS) {
      expect(MANAGER_GRANT_LABELS[k]).toBe(areaLabel(k));
      expect(grantLabel(k)).toBe(areaLabel(k));
    }
  });

  it("isAreaKey accepts areas only", () => {
    expect(isAreaKey("billing")).toBe(true);
    expect(isAreaKey("inquiries")).toBe(true);
    expect(isAreaKey("nope")).toBe(false);
    expect(isAreaKey(undefined)).toBe(false);
  });

  it("no client code keeps its own copy of the grant keys", () => {
    for (const file of [
      "core/app/composables/useCurrentDomainAccess.ts",
      "core/app/middleware/manager.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).not.toMatch(/"inquiries"\s*\|\s*"violations"/);
      expect(src, file).not.toMatch(/communications:\s*obj\./);
    }
  });
});
