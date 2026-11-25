import { describe, it, expect } from "vitest";
import { pollListRowsFor, pollListSpecs } from "#core/server/utils/poll-reads";
import { decidePollAccess, visibleStatusesFor } from "#core/shared/polls/access";

const ORG = "org-1";
const manager = decidePollAccess({ isAdmin: true, isBoard: false, isMember: true, hasFeedbackGrant: false });
const member = decidePollAccess({ isAdmin: false, isBoard: false, isMember: true, hasFeedbackGrant: false });

describe("pollListSpecs", () => {
  it("reads nothing for no status", () => {
    expect(pollListSpecs(ORG, [])).toEqual({});
  });

  it("reads once when no draft is asked for", () => {
    const specs = pollListSpecs(ORG, ["open", "closed"]);
    expect(Object.keys(specs)).toEqual(["polls_all"]);
    expect(specs.polls_all).toMatchObject({
      collection: "hoa_polls",
      filter: { organization: { _eq: ORG }, status: { _in: ["open", "closed"] } },
      sort: ["-date_created"],
      limit: 100,
    });
  });

  it("adds the read without drafts when drafts are asked for with something else", () => {
    const specs = pollListSpecs(ORG, ["open", "draft"]);
    expect((specs.polls_public as any).filter.status._in).toEqual(["open"]);
  });

  it("reads once when only drafts are asked for", () => {
    expect(Object.keys(pollListSpecs(ORG, ["draft"]))).toEqual(["polls_all"]);
  });
});

describe("pollListRowsFor", () => {
  const rows = { polls_all: [{ id: "a" }, { id: "d" }], polls_public: [{ id: "a" }] };
  const pick = (access: typeof member, requested: string[]) =>
    pollListRowsFor(rows, requested, visibleStatusesFor(access, requested));

  it("gives a manager every requested status", () => {
    expect(pick(manager, ["open", "draft"])).toEqual(rows.polls_all);
  });

  it("gives a member the read without drafts", () => {
    expect(pick(member, ["open", "draft"])).toEqual(rows.polls_public);
  });

  it("gives a member asking only for drafts nothing", () => {
    expect(pick(member, ["draft"])).toEqual([]);
  });

  it("uses the one read when no draft was asked for", () => {
    expect(pick(member, ["open"])).toEqual(rows.polls_all);
  });
});
