import { describe, expect, it } from "vitest";
import {
  formReaches,
  isFormOverdue,
  openForms,
  outstandingFormsFor,
  signKey,
  unsignedBy,
  type FormRecipient,
  type SignForm,
} from "#core/shared/home/forms";

const f = (id: string, over: Partial<SignForm> = {}): SignForm => ({
  id,
  organization: "org1",
  status: "open",
  audience: "owners",
  ...over,
});
const tenant: FormRecipient = { memberId: "m1", organization: "org1", residency: "tenant", board: false };
const owner: FormRecipient = { memberId: "m2", organization: "org1", residency: "owner", board: false };
const boardOwner: FormRecipient = { memberId: "m3", organization: "org1", residency: "owner", board: true };
const boardTenant: FormRecipient = { memberId: "m4", organization: "org1", residency: "tenant", board: true };

describe("forms to sign", () => {
  it("matches audience by residency and board hat, hats adding", () => {
    expect(formReaches("owners", tenant)).toBe(false);
    expect(formReaches("tenants", tenant)).toBe(true);
    expect(formReaches("board", owner)).toBe(false);
    expect(formReaches("board", boardTenant)).toBe(true);
    expect(formReaches("owners", boardOwner)).toBe(true);
    expect(formReaches("all", tenant)).toBe(true);
    expect(formReaches("nonsense", owner)).toBe(false);
  });

  it("defaults a missing audience to owners", () => {
    expect(formReaches(null, owner)).toBe(true);
    expect(formReaches(undefined, tenant)).toBe(false);
  });

  it("lists what a person still owes, soonest due first, undated last", () => {
    const forms = [f("c", { title: "C" }), f("b", { due_date: "2026-12-05" }), f("a", { due_date: "2026-11-25" })];
    expect(outstandingFormsFor(owner, forms, []).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("drops forms already signed, only for that member", () => {
    const sigs = [{ form: "a", member: "m2", organization: "org1" }];
    expect(outstandingFormsFor(owner, [f("a"), f("b")], sigs).map((x) => x.id)).toEqual(["b"]);
    expect(outstandingFormsFor(boardOwner, [f("a")], sigs).map((x) => x.id)).toEqual(["a"]);
  });

  it("ignores another organization's forms and signatures", () => {
    expect(outstandingFormsFor(owner, [f("x", { organization: "org2" })], [])).toEqual([]);
    const otherOrgSig = [{ form: "a", member: "m2", organization: "org2" }];
    expect(outstandingFormsFor(owner, [f("a")], otherOrgSig).map((x) => x.id)).toEqual(["a"]);
  });

  it("skips drafts and closed forms and forms that miss the audience", () => {
    const forms = [
      f("draft", { status: "draft" }),
      f("closed", { status: "closed" }),
      f("tenants", { audience: "tenants" }),
      f("ok"),
    ];
    expect(outstandingFormsFor(owner, forms, []).map((x) => x.id)).toEqual(["ok"]);
    expect(openForms(forms, "org1").map((x) => x.id)).toEqual(["tenants", "ok"]);
  });

  it("keeps a past-due form listed and flags it overdue by date", () => {
    const late = f("late", { due_date: "2026-11-01" });
    expect(outstandingFormsFor(owner, [late], []).map((x) => x.id)).toEqual(["late"]);
    expect(isFormOverdue(late, "2026-11-21")).toBe(true);
    expect(isFormOverdue({ due_date: "2026-11-21" }, "2026-11-21")).toBe(false);
    expect(isFormOverdue({ due_date: null }, "2026-11-21")).toBe(false);
  });

  it("lists who has not signed, within the form's organization and audience", () => {
    const form = f("a", { audience: "owners" });
    const other: FormRecipient = { memberId: "m9", organization: "org2", residency: "owner", board: false };
    const sigs = [{ form: "a", member: "m2", organization: "org1" }];
    expect(unsignedBy(form, [tenant, owner, boardOwner, other], sigs).map((r) => r.memberId)).toEqual(["m3"]);
  });

  it("builds the unique key", () => {
    expect(signKey("a", "m")).toBe("a:m");
  });
});
