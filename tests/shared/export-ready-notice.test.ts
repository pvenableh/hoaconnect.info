// The "your export is ready" receipt. Directus used to email the bell row and
// was the only email; Session H turned that off, so the app sends its own. The
// bell (written by the worker) and the email (sent by the app) share this text.
import { describe, expect, it } from "vitest";
import { EXPORT_READY_CTA, exportReadyNotice } from "#core/shared/export/ready-notice";

const input = {
  orgName: "Oak <Court>",
  slug: "oak",
  tier: "full" as const,
  days: 7,
  expiresAt: "2026-11-17T12:00:00.000Z",
  appUrl: "https://app.hoaconnect.info",
};

describe("exportReadyNotice", () => {
  it("keeps the bell row's wording", () => {
    const n = exportReadyNotice(input);
    expect(n.subject).toBe("Your Oak <Court> data export is ready");
    expect(n.message).toBe(
      "The full export you requested has finished. Download it from Settings → Your data " +
        "(https://app.hoaconnect.info/oak/admin/settings/data). It stays available for 7 days, until 2026-11-17."
    );
  });

  it("drops the bell's link, not the notice, without an app URL or slug", () => {
    const n = exportReadyNotice({ ...input, appUrl: "", tier: "shareable" });
    expect(n.message).toContain("The shareable export");
    expect(n.message).toContain("Settings → Your data.");
  });

  it("gives the email a body and an org-relative button to the same page", () => {
    const { bodyHtml } = exportReadyNotice(input);
    expect(bodyHtml).toContain("until 2026-11-17");
    expect(bodyHtml).not.toContain("href=");
    expect(EXPORT_READY_CTA.path).toBe("/admin/settings/data");
  });
});
