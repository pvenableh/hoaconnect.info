import { describe, it, expect } from "vitest";
import { emailActivitySpecs } from "#core/server/utils/email-activity-reads";

describe("emailActivitySpecs", () => {
  const since = "2026-11-18T05:00:00.000Z";
  const specs = emailActivitySpecs("org-1", since);
  const emails = { organization: { _eq: "org-1" }, date_created: { _gte: since } };

  it("reads the community's emails since the date, unlimited", () => {
    expect(specs.ea_emails).toMatchObject({ collection: "hoa_emails", filter: emails, limit: -1 });
  });

  it("names the same emails for their recipients and activity", () => {
    expect(specs.ea_recipients).toMatchObject({ collection: "hoa_email_recipients", filter: { email: emails }, limit: -1 });
    expect(specs.ea_activity).toMatchObject({ collection: "hoa_email_activity", filter: { email_recipient: { email: emails } }, limit: -1 });
  });

  it("keeps the fields the route read", () => {
    expect((specs.ea_recipients as any).fields).toEqual(["id", "email", "status", "sent_at"]);
    expect((specs.ea_activity as any).fields).toEqual(["id", "event", "date_created", "event_timestamp"]);
  });
});
