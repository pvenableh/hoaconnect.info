import { describe, expect, it } from "vitest";
import { agendaItems, agendaText } from "#core/shared/meetings/agenda-order";
import { moveItem } from "#core/shared/motion";

describe("agenda order", () => {
  it("reads one item per non-blank line", () => {
    expect(agendaItems("Budget\n\n  Gutters  \r\nParty").map((i) => i.text)).toEqual(["Budget", "Gutters", "Party"]);
    expect(agendaItems(null)).toEqual([]);
    expect(agendaItems("Budget, gutters, party.")).toHaveLength(1);
  });

  it("keys repeated lines apart", () => {
    const keys = agendaItems("Vote\nVote").map((i) => i.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("a move rewrites the text in the new order", () => {
    const items = agendaItems("1. Budget\n2. Gutters\n3. Party");
    expect(agendaText(moveItem(items, 2, 0))).toBe("3. Party\n1. Budget\n2. Gutters");
  });
});
