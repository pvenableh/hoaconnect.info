// A release line with nothing written about it is a release that shipped
// silently. These tests are the thing that makes "What's new" impossible to
// forget: bump package.json's MINOR without adding a note and CI goes red.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RELEASE_NOTES,
  LATEST_RELEASE,
  releaseLine,
  noteForVersion,
} from "#core/shared/app/release-notes";

const pkgVersion = String(
  JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")).version,
);

describe("release notes", () => {
  it("has an entry for the version this build ships as", () => {
    const line = releaseLine(pkgVersion);
    expect(line).not.toBeNull();
    expect(
      RELEASE_NOTES.map((n) => n.version),
      `package.json is ${pkgVersion} — add a "${line}" entry to core/shared/app/release-notes.ts`,
    ).toContain(line);
  });

  it("is ordered newest first, so LATEST_RELEASE is the top entry", () => {
    const rank = (v: string) => {
      const [maj = "0", min = "0"] = v.split(".");
      return Number(maj) * 1000 + Number(min);
    };
    const ranks = RELEASE_NOTES.map((n) => rank(n.version));
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(LATEST_RELEASE).toBe(RELEASE_NOTES[0]);
  });

  it("has one entry per line, each dated and with something to say", () => {
    const seen = new Set<string>();
    for (const note of RELEASE_NOTES) {
      expect(seen.has(note.version), `${note.version} appears twice`).toBe(false);
      seen.add(note.version);

      expect(note.version, `${note.version} is not a MAJOR.MINOR line`).toMatch(/^\d+\.\d+$/);
      expect(note.date, `${note.version} has no ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.title.length, `${note.version} has no title`).toBeGreaterThan(0);
      expect(note.highlights.length, `${note.version} has no highlights`).toBeGreaterThan(0);
      for (const h of note.highlights) {
        expect(h.title.length).toBeGreaterThan(0);
        expect(h.body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("releaseLine", () => {
  it("reduces a full version to its line", () => {
    expect(releaseLine("2.1.1027")).toBe("2.1");
    expect(releaseLine("10.0.3")).toBe("10.0");
  });

  it("survives the sha7 patch that a shallow clone falls back to", () => {
    // resolveAppVersion emits `MAJOR.MINOR.<sha7>` when git history can't be
    // completed on the build container — the line must still resolve.
    expect(releaseLine("2.0.a1b2c3d")).toBe("2.0");
  });

  it("returns null for anything that isn't a version", () => {
    expect(releaseLine(undefined)).toBeNull();
    expect(releaseLine(null)).toBeNull();
    expect(releaseLine("")).toBeNull();
    expect(releaseLine("dev")).toBeNull();
  });
});

describe("noteForVersion", () => {
  it("matches on the line, not the patch", () => {
    const note = noteForVersion("2.0.99999");
    expect(note?.version).toBe("2.0");
  });

  it("returns null for a line with no note rather than guessing", () => {
    expect(noteForVersion("99.9.1")).toBeNull();
    expect(noteForVersion(undefined)).toBeNull();
  });
});
