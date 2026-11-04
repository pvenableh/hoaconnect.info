import { describe, expect, it } from "vitest";
import { MANIFEST_SHORTCUTS, buildManifest, manifestShortcuts } from "#core/shared/pwa/manifest";

const base = {
  name: "Oak Court",
  shortName: "Oak Court",
  description: "d",
  themeColor: "#123456",
  backgroundColor: "#ffffff",
  icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
};

describe("buildManifest", () => {
  it("pins an id and starts at /?source=pwa", () => {
    const m = buildManifest(base);
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/?source=pwa");
    expect(m).toMatchObject({ display: "standalone", name: "Oak Court", theme_color: "#123456", icons: base.icons });
  });

  it("shortcuts: Pay dues, Requests, Documents, Channels — under the community's slug", () => {
    const m = buildManifest({ ...base, slug: "oak" });
    expect(m.shortcuts!.map((s) => s.name)).toEqual(["Pay dues", "Requests", "Documents", "Channels"]);
    expect(m.shortcuts!.map((s) => s.url)).toEqual([
      "/oak/payments?source=shortcut",
      "/oak/requests?source=shortcut",
      "/oak/documents?source=shortcut",
      "/oak/admin/channels?source=shortcut",
    ]);
    expect(m.shortcuts!.every((s) => s.short_name === s.name)).toBe(true);
  });

  it("a host with no community (the platform's own) gets no shortcuts, not links that 404", () => {
    expect(buildManifest(base)).not.toHaveProperty("shortcuts");
    expect(buildManifest({ ...base, slug: null })).not.toHaveProperty("shortcuts");
    expect(manifestShortcuts("")).toEqual([]);
  });

  it("the list is the four the plan names", () => {
    expect(MANIFEST_SHORTCUTS.map(([n]) => n)).toEqual(["Pay dues", "Requests", "Documents", "Channels"]);
  });
});
