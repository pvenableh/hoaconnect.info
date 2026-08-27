import { describe, it, expect } from "vitest";
import {
  normalizeInvitationStatus,
  isOutstandingInvitation,
  isExpiredInvitation,
  indexInvitationsByEmail,
  onboardingFor,
  onboardingIndexFor,
  onboardingCounts,
  onboardingEmailKey,
} from "#core/shared/members/onboarding";

const NOW = new Date("2026-08-27T12:00:00Z");
const LIVE = "2026-09-30T00:00:00Z";
const DEAD = "2026-01-05T19:13:19.366Z";

const member = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  email: "dana@example.com",
  user: null,
  status: "active",
  ...over,
});

const invitation = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  email: "dana@example.com",
  invitation_status: "pending",
  expires_at: LIVE,
  date_created: "2026-08-20T00:00:00Z",
  ...over,
});

describe("normalizeInvitationStatus", () => {
  it("trims — the Directus choice list itself carries `canceled ` with a trailing space", () => {
    expect(normalizeInvitationStatus("canceled ")).toBe("canceled");
    expect(normalizeInvitationStatus("Canceled")).toBe("canceled");
    expect(normalizeInvitationStatus("  PENDING  ")).toBe("pending");
  });

  it("is null for anything that is not a non-empty string", () => {
    for (const v of [null, undefined, "", "   ", 7, {}]) {
      expect(normalizeInvitationStatus(v)).toBeNull();
    }
  });
});

describe("isOutstandingInvitation", () => {
  it("is over once accepted or canceled — either spelling of canceled", () => {
    expect(isOutstandingInvitation(invitation({ invitation_status: "accepted" }))).toBe(false);
    expect(isOutstandingInvitation(invitation({ invitation_status: "canceled" }))).toBe(false);
    expect(isOutstandingInvitation(invitation({ invitation_status: "canceled " }))).toBe(false);
  });

  it("stays outstanding while pending or expired — an expired invite was still asked", () => {
    expect(isOutstandingInvitation(invitation({ invitation_status: "pending" }))).toBe(true);
    expect(isOutstandingInvitation(invitation({ invitation_status: "expired" }))).toBe(true);
  });

  it("treats an unrecognized status as outstanding — Directus does not enforce choices", () => {
    expect(isOutstandingInvitation(invitation({ invitation_status: "COMPLETE-GARBAGE" }))).toBe(true);
    expect(isOutstandingInvitation(invitation({ invitation_status: null }))).toBe(true);
  });
});

describe("isExpiredInvitation", () => {
  it("reads a lapsed expires_at even while the status still says pending", () => {
    // The status is only flipped to `expired` lazily, when someone tries to use
    // a dead token. Nothing sweeps them.
    expect(isExpiredInvitation(invitation({ invitation_status: "pending", expires_at: DEAD }), NOW)).toBe(true);
  });

  it("is false for a live invitation and true for a stored expired one", () => {
    expect(isExpiredInvitation(invitation(), NOW)).toBe(false);
    expect(isExpiredInvitation(invitation({ invitation_status: "expired", expires_at: LIVE }), NOW)).toBe(true);
  });

  it("does not declare an invitation dead on a missing or unparseable date", () => {
    expect(isExpiredInvitation(invitation({ expires_at: null }), NOW)).toBe(false);
    expect(isExpiredInvitation(invitation({ expires_at: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("onboardingEmailKey / indexInvitationsByEmail", () => {
  it("joins case- and whitespace-insensitively", () => {
    expect(onboardingEmailKey("  Dana@Example.COM ")).toBe("dana@example.com");
    const index = indexInvitationsByEmail([invitation({ email: " DANA@example.com " })]);
    expect(index.get("dana@example.com")).toHaveLength(1);
  });

  it("skips rows with no usable email instead of bucketing them together", () => {
    const index = indexInvitationsByEmail([invitation({ email: null }), invitation({ email: "" })]);
    expect(index.size).toBe(0);
  });

  it("uses a Map, so a member emailed __proto__ cannot reach an object prototype", () => {
    const index = indexInvitationsByEmail([]);
    expect(index.get("__proto__")).toBeUndefined();
  });
});

describe("onboardingFor — the three states", () => {
  it("has an account when hoa_members.user is set, in any shape Directus returns", () => {
    for (const user of ["u1", { id: "u1" }]) {
      expect(onboardingFor(member({ user }), [], { asOf: NOW }).state).toBe("account");
    }
  });

  it("is 'invited' for an active member with a pending invitation", () => {
    const result = onboardingFor(member(), [invitation()], { asOf: NOW });
    expect(result.state).toBe("invited");
    expect(result.expired).toBe(false);
    expect(result.invitationId).toBe("i1");
    expect(result.invitedAt).toBe("2026-08-20T00:00:00Z");
  });

  it("is 'invited' but expired when the link has lapsed — resend, not re-invite", () => {
    const result = onboardingFor(member(), [invitation({ expires_at: DEAD })], { asOf: NOW });
    expect(result.state).toBe("invited");
    expect(result.expired).toBe(true);
  });

  it("is 'not invited' with no invitation at all — the 58 of 1033 Lenox", () => {
    // ⚠️ This member is ACTIVE. Never having signed in is normal and correct;
    // it is a portal fact, not a membership one, and nothing here reads status.
    const result = onboardingFor(member(), [], { asOf: NOW });
    expect(result.state).toBe("not_invited");
    expect(result.lastInvitationStatus).toBeNull();
  });

  it("is 'not invited' when the only invitation was canceled — and says so", () => {
    // The one real row in production today: canceled, 605 Lincoln Road.
    const result = onboardingFor(
      member(),
      [invitation({ invitation_status: "canceled", expires_at: DEAD })],
      { asOf: NOW }
    );
    expect(result.state).toBe("not_invited");
    expect(result.lastInvitationStatus).toBe("canceled");
  });

  it("prefers the newest outstanding invitation when an earlier one was canceled", () => {
    const result = onboardingFor(
      member(),
      [
        invitation({ id: "old", invitation_status: "canceled", date_created: "2026-07-01T00:00:00Z" }),
        invitation({ id: "new", invitation_status: "pending", date_created: "2026-08-20T00:00:00Z" }),
      ],
      { asOf: NOW }
    );
    expect(result.state).toBe("invited");
    expect(result.invitationId).toBe("new");
  });

  it("lets the account win over an accepted invitation, and reports that status anyway", () => {
    const result = onboardingFor(
      member({ user: { id: "u1" } }),
      [invitation({ invitation_status: "accepted" })],
      { asOf: NOW }
    );
    expect(result.state).toBe("account");
    expect(result.lastInvitationStatus).toBe("accepted");
  });

  it("never looks at membership status — archived and active read identically", () => {
    const archived = onboardingFor(member({ status: "archived" }), [], { asOf: NOW });
    const active = onboardingFor(member({ status: "active" }), [], { asOf: NOW });
    expect(archived.state).toBe(active.state);
  });
});

describe("onboardingIndexFor / onboardingCounts", () => {
  const roster = [
    member({ id: "a", email: "a@x.com", user: { id: "u1" } }),
    member({ id: "b", email: "B@x.com" }),
    member({ id: "c", email: "c@x.com" }),
  ];
  const invitations = [invitation({ id: "ib", email: "b@x.com" })];

  it("keys each member's state by id, joining on email case-insensitively", () => {
    const index = onboardingIndexFor(roster, invitations, { asOf: NOW });
    expect(index.get("a")!.state).toBe("account");
    expect(index.get("b")!.state).toBe("invited");
    expect(index.get("c")!.state).toBe("not_invited");
  });

  it("counts each state, plus the total", () => {
    expect(onboardingCounts(roster, invitations, { asOf: NOW })).toEqual({
      all: 3,
      account: 1,
      invited: 1,
      not_invited: 1,
    });
  });

  it("survives empty and null inputs", () => {
    expect(onboardingCounts(null, null)).toEqual({ all: 0, account: 0, invited: 0, not_invited: 0 });
    expect(onboardingIndexFor(null, null).size).toBe(0);
  });
});
