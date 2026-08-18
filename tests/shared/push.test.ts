import { describe, it, expect } from "vitest";
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  buildPushPayload,
  pushAllowed,
  pushTag,
  truncate,
} from "#core/shared/notifications/push";

const ORG = { id: "org-1", slug: "605-lincoln", name: "605 Lincoln Road" };

describe("pushAllowed", () => {
  it("defaults to on when nothing is configured", () => {
    expect(pushAllowed(null, "announcement")).toBe(true);
    expect(pushAllowed({}, "announcement")).toBe(true);
  });

  it("follows the per-category BELL toggle, not the email one", () => {
    // Email off, bell untouched → still push. This is the whole point of the
    // mapping: "stop emailing me" must not mean "stop notifying me".
    expect(pushAllowed({ announcement: false }, "announcement")).toBe(true);
    expect(pushAllowed({ announcement_bell: false }, "announcement")).toBe(false);
  });

  it("is silenced by the master mute", () => {
    expect(pushAllowed({ _all: false }, "announcement")).toBe(false);
    expect(pushAllowed({ _all: false, announcement_bell: true }, "announcement")).toBe(false);
  });

  it("gates each category independently", () => {
    const prefs = { announcement_bell: false };
    expect(pushAllowed(prefs, "announcement")).toBe(false);
    expect(pushAllowed(prefs, "payment")).toBe(true);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Roof project update", 80)).toBe("Roof project update");
  });

  it("collapses whitespace", () => {
    expect(truncate("  a   b\n c ", 80)).toBe("a b c");
  });

  it("cuts on a word boundary when one is near the limit", () => {
    expect(truncate("alpha beta gamma delta", 15)).toBe("alpha beta…");
  });

  it("hard-cuts when no boundary is near the limit", () => {
    const out = truncate("a".repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("tolerates empty input", () => {
    expect(truncate("", 10)).toBe("");
  });
});

describe("pushTag", () => {
  it("keys on collection + item so repeats collapse", () => {
    expect(pushTag("hoa_tasks", "abc")).toBe("hoa_tasks:abc");
  });

  it("is undefined when either half is missing", () => {
    expect(pushTag("hoa_tasks", null)).toBeUndefined();
    expect(pushTag(null, "abc")).toBeUndefined();
  });
});

describe("buildPushPayload", () => {
  it("scopes the link to the org", () => {
    const p = buildPushPayload({ title: "T", body: "B", org: ORG, path: "/admin/projects" });
    expect(p.url).toBe("/605-lincoln/admin/projects");
    expect(p.org).toEqual({ id: "org-1", slug: "605-lincoln", name: "605 Lincoln Road" });
  });

  it("absolutises against a supplied origin", () => {
    const p = buildPushPayload({
      title: "T",
      body: "B",
      org: ORG,
      path: "/admin/projects",
      origin: "https://605lincolnroad.com/",
    });
    expect(p.url).toBe("https://605lincolnroad.com/605-lincoln/admin/projects");
  });

  it("falls back to the org root with no path", () => {
    expect(buildPushPayload({ title: "T", body: "B", org: ORG }).url).toBe("/605-lincoln");
    expect(buildPushPayload({ title: "T", body: "B", org: ORG, path: "/" }).url).toBe("/605-lincoln");
  });

  it("tolerates a path missing its leading slash", () => {
    expect(buildPushPayload({ title: "T", body: "B", org: ORG, path: "admin/files" }).url).toBe(
      "/605-lincoln/admin/files"
    );
  });

  it("bounds title and body so the push service cannot reject an oversized payload", () => {
    const p = buildPushPayload({ title: "t".repeat(500), body: "b".repeat(2000), org: ORG });
    expect(p.title.length).toBeLessThanOrEqual(PUSH_TITLE_MAX);
    expect(p.body.length).toBeLessThanOrEqual(PUSH_BODY_MAX);
  });

  it("sets a collapse tag only when it has both halves", () => {
    expect(
      buildPushPayload({ title: "T", body: "B", org: ORG, collection: "hoa_tasks", item: "x" }).tag
    ).toBe("hoa_tasks:x");
    expect(buildPushPayload({ title: "T", body: "B", org: ORG }).tag).toBeUndefined();
  });

  it("normalizes the badge and drops a nonsense one", () => {
    expect(buildPushPayload({ title: "T", body: "B", org: ORG, badge: 3.7 }).badge).toBe(3);
    expect(buildPushPayload({ title: "T", body: "B", org: ORG, badge: -2 }).badge).toBe(0);
    expect(buildPushPayload({ title: "T", body: "B", org: ORG, badge: NaN }).badge).toBeUndefined();
    expect(buildPushPayload({ title: "T", body: "B", org: ORG }).badge).toBeUndefined();
  });
});
