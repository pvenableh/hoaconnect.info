/**
 * readItemsBatch's translation (core/server/utils/directus-graphql.ts): REST
 * specs to one GraphQL query, and GraphQL rows back to REST's shape.
 */
import { describe, expect, it } from "vitest";
import { buildBatchQuery, gqlFilter, gqlLiteral, relationMapOf, restCounts, restShaped } from "#core/server/utils/directus-graphql";

const rel = relationMapOf(
  [
    { collection: "hoa_members", field: "user", related_collection: "directus_users" },
    { collection: "hoa_members", field: "organization", related_collection: "hoa_organizations" },
    { collection: "hoa_members", field: "role", related_collection: "directus_roles" },
    { collection: "hoa_board_members", field: "hoa_member", related_collection: "hoa_members", meta: { one_field: "board_member_terms" } },
    { collection: "money_approvals", field: "organization", related_collection: "hoa_organizations" },
    { collection: "money_approvals", field: "charge", related_collection: "payment_requests" },
    { collection: "money_approval_decisions", field: "approval", related_collection: "money_approvals" },
    { collection: "payment_requests", field: "member", related_collection: "hoa_members" },
    { collection: "directus_files", field: "folder", related_collection: null }, // m2a-like: skipped
  ],
  [
    { collection: "payment_requests", field: "amount", type: "decimal", schema: { numeric_scale: 2 } },
    { collection: "money_approvals", field: "amount", type: "decimal", schema: { numeric_scale: 2 } },
    { collection: "payment_requests", field: "title", type: "string", schema: { numeric_scale: null } },
  ]
);

describe("gqlLiteral", () => {
  it("writes input objects with bare keys and JSON scalars", () => {
    expect(gqlLiteral({ a: { _in: ["x", 'q"t'] }, n: 1.5, b: true, z: null, u: undefined })).toBe(
      '{a: {_in: ["x", "q\\"t"]}, n: 1.5, b: true, z: null}'
    );
  });
});

describe("gqlFilter", () => {
  it("compares an m2o's id, and reaches through it for the related row's fields", () => {
    expect(gqlFilter("money_approvals", { organization: { _eq: "o1" }, state: { _in: ["pending"] } }, rel)).toEqual({
      organization: { id: { _eq: "o1" } },
      state: { _in: ["pending"] },
    });
    expect(gqlFilter("money_approval_decisions", { approval: { organization: { _eq: "o1" }, id: { _eq: "a1" } } }, rel)).toEqual({
      approval: { organization: { id: { _eq: "o1" } }, id: { _eq: "a1" } },
    });
  });

  it("recurses through _and/_or, inside a relation too", () => {
    expect(gqlFilter("hoa_members", { _or: [{ user: { _null: true } }, { role: { _and: [{ name: { _eq: "x" } }] } }] }, rel)).toEqual({
      _or: [{ user: { id: { _null: true } } }, { role: { _and: [{ name: { _eq: "x" } }] } }],
    });
  });
});

describe("buildBatchQuery", () => {
  it("selects bare relations as { id }, nests dotted fields, and turns deep into arguments", () => {
    const q = buildBatchQuery(
      {
        members: {
          collection: "hoa_members",
          filter: { organization: { _eq: "o1" } },
          fields: ["id", "user", "role", "board_member_terms.title", "board_member_terms.term_end"],
          deep: { board_member_terms: { _filter: { status: { _eq: "published" } }, _limit: -1 } },
          limit: -1,
        },
        approvals: {
          collection: "money_approvals",
          fields: ["id", "charge.id", "charge.member.first_name"],
          sort: ["-date_created"],
        },
      },
      rel
    );
    expect(q).toContain(
      'members: hoa_members(filter: {organization: {id: {_eq: "o1"}}}, limit: -1) { id user { id } role { id } board_member_terms(filter: {status: {_eq: "published"}}, limit: -1) { title term_end } }'
    );
    expect(q).toContain('approvals: money_approvals(sort: ["-date_created"]) { id charge { id member { first_name } } }');
  });

  it("refuses what it cannot translate, so the caller falls back to REST", () => {
    expect(() => buildBatchQuery({ a: { collection: "hoa_members", fields: ["*"] } }, rel)).toThrow(/wildcard/);
    expect(() => buildBatchQuery({ a: { collection: "hoa_members", fields: ["first_name.x"] } }, rel)).toThrow(/not a relation/);
    expect(() => buildBatchQuery({ "a-b": { collection: "hoa_members", fields: ["id"] } }, rel)).toThrow(/GraphQL name/);
  });
});

describe("counts", () => {
  it("count by primary key under groupBy (countAll reads null there), with offset on a page", () => {
    const q = buildBatchQuery(
      {
        counts: { collection: "money_approvals", count: "*", groupBy: ["kind", "state"], filter: { organization: { _eq: "o1" } }, limit: -1 },
        page: { collection: "money_approvals", fields: ["id"], limit: 2, offset: 4 },
      },
      rel
    );
    expect(q).toContain('counts: money_approvals_aggregated(filter: {organization: {id: {_eq: "o1"}}}, groupBy: ["kind", "state"], limit: -1) { group count { id } }');
    expect(q).toContain("page: money_approvals(limit: 2, offset: 4) { id }");
  });

  it("groups by an m2o's raw key, as REST does", () => {
    const q = buildBatchQuery({ c: { collection: "money_approvals", count: "*", groupBy: ["organization"], limit: -1 } }, rel);
    expect(q).toContain('c: money_approvals_aggregated(groupBy: ["organization"], limit: -1) { group count { id } }');
    expect(restCounts([{ group: { organization: "o1" }, count: { id: 2 } }])).toEqual([{ organization: "o1", count: "2" }]);
  });

  it("refuses to group by an o2m or a related field, so the caller falls back to REST", () => {
    expect(() => buildBatchQuery({ c: { collection: "hoa_members", count: "*", groupBy: ["board_member_terms"] } }, rel)).toThrow(/not a field/);
    expect(() => buildBatchQuery({ c: { collection: "money_approvals", count: "*", groupBy: ["charge.member"] } }, rel)).toThrow(/not a field/);
  });

  it("come back as REST's: the group's fields and count as text", () => {
    expect(restCounts([{ group: { kind: "waive", state: "pending" }, count: { id: 3 } }, { group: null, count: { id: 7 } }])).toEqual([
      { kind: "waive", state: "pending", count: "3" },
      { count: "7" },
    ]);
  });
});

describe("fields the schema does not have", () => {
  const full = relationMapOf(
    [{ collection: "hoa_members", field: "organization", related_collection: "hoa_organizations" }],
    [
      { collection: "hoa_members", field: "id" },
      { collection: "hoa_members", field: "organization" },
      { collection: "hoa_organizations", field: "id" },
      { collection: "hoa_organizations", field: "name" },
    ],
    true
  );

  it("are left out of the selection, as REST leaves them out of the row", () => {
    const q = buildBatchQuery({ m: { collection: "hoa_members", fields: ["id", "logo.id", "organization.name", "organization.gone"] } }, full);
    expect(q).toContain("m: hoa_members { id organization { name } }");
  });

  it("are kept when the field rows are not the whole schema", () => {
    expect(() => buildBatchQuery({ m: { collection: "hoa_members", fields: ["id", "logo.id"] } }, rel)).toThrow(/not a relation/);
  });
});

describe("restShaped", () => {
  it("flattens id-only relations, keeps nested ones, and writes decimals at their scale", () => {
    const rows = restShaped(
      "money_approvals",
      ["id", "organization", "amount", "charge.id", "charge.amount", "charge.member.first_name"],
      [
        { id: "a1", organization: { id: "o1" }, amount: 25, charge: { id: "c1", amount: 100, member: { first_name: "Ann" } } },
        { id: "a2", organization: null, amount: null, charge: null },
      ],
      rel
    );
    expect(rows).toEqual([
      { id: "a1", organization: "o1", amount: "25.00", charge: { id: "c1", amount: "100.00", member: { first_name: "Ann" } } },
      { id: "a2", organization: null, amount: null, charge: null },
    ]);
  });

  it("turns an o2m alias selected bare into its ids, and nested into rows", () => {
    expect(restShaped("hoa_members", ["board_member_terms"], [{ board_member_terms: [{ id: "t1" }, { id: "t2" }] }], rel)).toEqual([
      { board_member_terms: ["t1", "t2"] },
    ]);
    expect(restShaped("hoa_members", ["board_member_terms.title"], [{ board_member_terms: [{ title: "president" }] }], rel)).toEqual([
      { board_member_terms: [{ title: "president" }] },
    ]);
  });
});
