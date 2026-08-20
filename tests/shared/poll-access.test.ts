/**
 * Who may read, run and vote in a community's polls.
 *
 * The assertion this file exists for is the gap between `canManage` and
 * `canVote`. A property manager can be trusted by an admin to run a community's
 * polls without being a member of that community — and a management company
 * that could cast votes in the communities it manages would be able to put its
 * thumb on decisions the community believes are its own. The two answers must
 * never collapse into one.
 *
 * The second is that the manager's access is a GRANT: it comes from a switch
 * this community's admin owns, not from the Property Manager role, which is the
 * same in every community they work for.
 */

import { describe, it, expect } from "vitest";
import {
  NO_POLL_ACCESS,
  decidePollAccess,
  visibleStatusesFor,
  type PollViewerHats,
} from "#core/shared/polls/access";

const hats = (over: Partial<PollViewerHats> = {}): PollViewerHats => ({
  isAdmin: false,
  isBoard: false,
  isMember: false,
  hasFeedbackGrant: false,
  ...over,
});

const admin = decidePollAccess(hats({ isAdmin: true, isMember: true }));
const board = decidePollAccess(hats({ isBoard: true, isMember: true }));
const owner = decidePollAccess(hats({ isMember: true }));
const grantedManager = decidePollAccess(hats({ hasFeedbackGrant: true }));
const plainManager = decidePollAccess(hats());

describe("a property manager reads on the community's grant", () => {
  it("sees polls and may close them when the grant is on", () => {
    expect(grantedManager.canRead).toBe(true);
    expect(grantedManager.canManage).toBe(true);
  });

  it("sees nothing at all when it is off", () => {
    // The switch has to be able to take it away again, or it is not a switch.
    expect(plainManager.canRead).toBe(false);
    expect(plainManager.canManage).toBe(false);
  });

  it("never gets a ballot, however much the community trusts them", () => {
    // The assertion this module exists for. A manager runs the vote; the
    // community casts it.
    expect(grantedManager.canVote).toBe(false);
    expect(plainManager.canVote).toBe(false);
  });

  it("is marked as reading on a grant, so the page can say so", () => {
    expect(grantedManager.viaGrant).toBe(true);
    // An admin or board member who ALSO happens to hold the grant is not
    // reading on it — they would see these polls regardless.
    expect(decidePollAccess(hats({ isAdmin: true, hasFeedbackGrant: true })).viaGrant).toBe(false);
    expect(decidePollAccess(hats({ isBoard: true, hasFeedbackGrant: true })).viaGrant).toBe(false);
  });
});

describe("the community's own people", () => {
  it("lets an owner read and vote but not run the poll", () => {
    expect(owner.canRead).toBe(true);
    expect(owner.canVote).toBe(true);
    expect(owner.canManage).toBe(false);
  });

  it("lets an admin and a board member run polls", () => {
    expect(admin.canManage).toBe(true);
    expect(board.canManage).toBe(true);
  });

  it("gives a resident admin a ballot, and a non-resident one none", () => {
    // Membership is what carries the vote, not the office.
    expect(admin.canVote).toBe(true);
    expect(decidePollAccess(hats({ isAdmin: true })).canVote).toBe(false);
  });
});

describe("a stranger", () => {
  it("gets nothing", () => {
    const none = decidePollAccess(hats());
    expect(none).toEqual({ ...NO_POLL_ACCESS });
    expect(NO_POLL_ACCESS.canRead).toBe(false);
  });
});

describe("drafts belong to whoever can put them to the community", () => {
  const requested = ["open", "closed", "draft"];

  it("shows drafts to anyone who can run a poll, including a granted manager", () => {
    for (const access of [admin, board, grantedManager]) {
      expect(visibleStatusesFor(access, requested)).toContain("draft");
    }
  });

  it("hides them from an owner, who has not been asked yet", () => {
    expect(visibleStatusesFor(owner, requested)).toEqual(["open", "closed"]);
  });

  it("does not invent statuses that were not requested", () => {
    expect(visibleStatusesFor(admin, ["open"])).toEqual(["open"]);
    expect(visibleStatusesFor(owner, ["draft"])).toEqual([]);
  });
});
