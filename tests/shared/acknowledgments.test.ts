import { describe, expect, it } from "vitest";
import {
  ackKey,
  isOverdue,
  outstandingFor,
  reachesRecipient,
  unacknowledgedBy,
  type AckNotice,
  type AckRecipient,
} from "#core/shared/home/acknowledgments";

const now = new Date("2026-11-21T12:00:00Z");
const n = (id: string, over: Partial<AckNotice> = {}): AckNotice => ({
  id,
  organization: "org1",
  status: "published",
  target_audience: "all",
  requires_acknowledgment: true,
  ...over,
});
const tenant: AckRecipient = { memberId: "m1", organization: "org1", residency: "tenant", board: false };
const owner: AckRecipient = { memberId: "m2", organization: "org1", residency: "owner", board: false };
const boardOwner: AckRecipient = { memberId: "m3", organization: "org1", residency: "owner", board: true };

describe("acknowledgments", () => {
  it("matches audience by residency and board hat, hats adding", () => {
    expect(reachesRecipient("owners", tenant)).toBe(false);
    expect(reachesRecipient("tenants", tenant)).toBe(true);
    expect(reachesRecipient("board members", owner)).toBe(false);
    expect(reachesRecipient("owners", boardOwner)).toBe(true);
    expect(reachesRecipient("board members", boardOwner)).toBe(true);
    expect(reachesRecipient(null, owner)).toBe(true);
    expect(reachesRecipient("nonsense", owner)).toBe(false);
  });

  it("lists what a person still owes, soonest due first, undated last", () => {
    const notices = [n("c", { title: "C" }), n("b", { ack_due: "2026-12-05" }), n("a", { ack_due: "2026-11-25" })];
    expect(outstandingFor(tenant, notices, [], now).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("drops notices already acknowledged, only for that member", () => {
    const acks = [{ announcement: "a", member: "m1", organization: "org1" }];
    expect(outstandingFor(tenant, [n("a"), n("b")], acks, now).map((x) => x.id)).toEqual(["b"]);
    expect(outstandingFor(owner, [n("a")], acks, now).map((x) => x.id)).toEqual(["a"]);
  });

  it("ignores another organization's notices and acknowledgments", () => {
    expect(outstandingFor(tenant, [n("x", { organization: "org2" })], [], now)).toEqual([]);
    const otherOrgAck = [{ announcement: "a", member: "m1", organization: "org2" }];
    expect(outstandingFor(tenant, [n("a")], otherOrgAck, now).map((x) => x.id)).toEqual(["a"]);
  });

  it("skips notices that do not require it, are drafts, not started or expired, or miss the audience", () => {
    const notices = [
      n("off", { requires_acknowledgment: false }),
      n("draft", { status: "draft" }),
      n("future", { publish_date: "2026-12-01T00:00:00Z" }),
      n("expired", { expiry_date: "2026-11-01T00:00:00Z" }),
      n("owners", { target_audience: "owners" }),
      n("ok", { target_audience: "tenants" }),
    ];
    expect(outstandingFor(tenant, notices, [], now).map((x) => x.id)).toEqual(["ok"]);
  });

  it("lists who has not acknowledged, within the notice's organization and audience", () => {
    const notice = n("a", { target_audience: "owners" });
    const other: AckRecipient = { memberId: "m9", organization: "org2", residency: "owner", board: false };
    const acks = [{ announcement: "a", member: "m2", organization: "org1" }];
    expect(unacknowledgedBy(notice, [tenant, owner, boardOwner, other], acks).map((r) => r.memberId)).toEqual(["m3"]);
  });

  it("flags overdue by date and builds the unique key", () => {
    expect(isOverdue({ ack_due: "2026-11-20" }, "2026-11-21")).toBe(true);
    expect(isOverdue({ ack_due: "2026-11-21" }, "2026-11-21")).toBe(false);
    expect(isOverdue({ ack_due: null }, "2026-11-21")).toBe(false);
    expect(ackKey("a", "m")).toBe("a:m");
  });
});
