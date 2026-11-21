import { describe, expect, it } from "vitest";
import { PERSONAS, ownerDues, personaEmail, scenarioDates } from "#core/shared/demo/scenario";

const now = new Date("2026-11-21T12:00:00Z");

describe("demo scenario", () => {
  it("has one login per non-admin role, all on the demo domain", () => {
    expect(PERSONAS.map(personaEmail)).toEqual([
      "demo-tenant@hoaconnect.info",
      "demo-owner@hoaconnect.info",
      "demo-board@hoaconnect.info",
      "demo-team@hoaconnect.info",
      "demo-manager@hoaconnect.info",
    ]);
  });

  it("bills the owner ten paid months, this month overdue and next month due", () => {
    const dues = ownerDues(now);
    expect(dues).toHaveLength(12);
    expect(dues.filter((d) => d.status === "paid")).toHaveLength(10);
    expect(dues.find((d) => d.status === "overdue")?.due_date).toBe("2026-11-01");
    expect(dues.at(-1)).toMatchObject({ status: "active", due_date: "2026-12-01" });
    expect(dues.filter((d) => d.status === "paid").every((d) => d.paid_at)).toBe(true);
  });

  it("builds dates relative to now", () => {
    const { at, day } = scenarioDates(now);
    expect(day(2)).toBe("2026-11-23");
    expect(at(-1, 9)).toBe("2026-11-20T09:00:00.000Z");
  });
});

import { demoPdf } from "#core/shared/demo/scenario";
describe("demo pdf", () => {
  it("is a well-formed one-page pdf with the title in it and a correct xref offset", () => {
    const pdf = demoPdf("Bylaws (draft)", "Body");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(Bylaws \\(draft\\)) Tj");
    const offset = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(offset, offset + 4)).toBe("xref");
  });
});

import { SECOND_COMMUNITY_REQUESTS } from "#core/shared/demo/scenario";
describe("manager with several communities", () => {
  it("gives the second community open items of more than one type", () => {
    expect(SECOND_COMMUNITY_REQUESTS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SECOND_COMMUNITY_REQUESTS.map((r) => r.type)).size).toBeGreaterThan(1);
    expect(SECOND_COMMUNITY_REQUESTS.every((r) => r.status !== "resolved")).toBe(true);
  });
});
