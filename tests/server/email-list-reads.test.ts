import { describe, it, expect } from "vitest";
import { emailListFilter, emailListSpecs } from "#core/server/utils/email-list-reads";

describe("emailListFilter", () => {
  it("names the community, and the status only when one is asked for", () => {
    expect(emailListFilter("org-1")).toEqual({ organization: { _eq: "org-1" } });
    expect(emailListFilter("org-1", "")).toEqual({ organization: { _eq: "org-1" } });
    expect(emailListFilter("org-1", "sent")).toEqual({ organization: { _eq: "org-1" }, status: { _eq: "sent" } });
  });
});

describe("emailListSpecs", () => {
  const filter = emailListFilter("org-1", "sent");

  it("reads the page newest first, at the page's offset", () => {
    expect(emailListSpecs(filter, 3, 20).el_emails).toMatchObject({
      collection: "hoa_emails",
      filter,
      sort: ["-date_created"],
      limit: 20,
      offset: 40,
    });
    expect(emailListSpecs(filter, 1, 5).el_emails).toMatchObject({ limit: 5, offset: 0 });
  });

  it("keeps the fields the route read", () => {
    expect((emailListSpecs(filter, 1, 20).el_emails as any).fields).toEqual([
      "id", "status", "subject", "email_type", "date_created", "sent_at", "scheduled_at",
      "recipient_count", "delivered_count", "failed_count",
    ]);
  });

  it("counts every email the filter names, not the page", () => {
    expect(emailListSpecs(filter, 2, 20).el_total).toEqual({ collection: "hoa_emails", count: "*", filter });
  });
});
