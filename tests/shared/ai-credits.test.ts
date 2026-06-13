import { describe, it, expect } from "vitest";
import {
  CREDITS_PER_DOLLAR,
  DEFAULT_MARGIN_MULTIPLIER,
  MODEL_PRICING,
  MODEL_TIERS,
  DRAFT_MODEL,
  priceFor,
  blendedCostUsd,
  creditsForUsage,
  estimateCredits,
  CREDIT_PACKS,
  packById,
  walletBalance,
  canAfford,
  splitDebit,
  applyDebit,
  applyCredit,
  resetAllowance,
  deriveBalance,
  type Wallet,
  type LedgerEntry,
} from "~~/shared/ai/credits";

describe("priceFor", () => {
  it("returns the row for a known model", () => {
    expect(priceFor("claude-haiku-4-5")).toEqual(MODEL_PRICING["claude-haiku-4-5"]);
  });
  it("falls back to the standard (Sonnet) tier for unknown ids", () => {
    expect(priceFor("totally-made-up")).toEqual(MODEL_PRICING[MODEL_TIERS.standard]);
  });
  it("uses Haiku as the cheap draft model", () => {
    expect(DRAFT_MODEL).toBe("claude-haiku-4-5");
  });
});

describe("blendedCostUsd", () => {
  it("prices input + output per the published rates", () => {
    // Haiku: $1/MTok in, $5/MTok out. 1M in + 1M out = $1 + $5 = $6.
    const cost = blendedCostUsd(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "claude-haiku-4-5"
    );
    expect(cost).toBeCloseTo(6, 6);
  });

  it("bills cache reads at 0.1x input and cache writes at 1.25x input", () => {
    // Sonnet: 1M cache-read = $0.30, 1M cache-write = $3.75.
    const cost = blendedCostUsd(
      { cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 },
      "claude-sonnet-4-6"
    );
    expect(cost).toBeCloseTo(0.3 + 3.75, 6);
  });

  it("treats missing/negative/NaN channels as zero", () => {
    expect(
      blendedCostUsd(
        { input_tokens: null, output_tokens: -50, cache_read_input_tokens: NaN },
        "claude-opus-4-8"
      )
    ).toBe(0);
  });

  it("scales linearly with token count", () => {
    const one = blendedCostUsd({ output_tokens: 1000 }, "claude-opus-4-8");
    const ten = blendedCostUsd({ output_tokens: 10_000 }, "claude-opus-4-8");
    expect(ten).toBeCloseTo(one * 10, 9);
  });
});

describe("creditsForUsage", () => {
  it("applies margin and the $-per-credit anchor, rounding up", () => {
    // Cost $6 (Haiku, 1M+1M) × 4 margin × 1000 cpd = 24,000 credits.
    const credits = creditsForUsage(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "claude-haiku-4-5"
    );
    expect(credits).toBe(6 * DEFAULT_MARGIN_MULTIPLIER * CREDITS_PER_DOLLAR);
    expect(credits).toBe(24_000);
  });

  it("honors a custom margin and creditsPerDollar", () => {
    const credits = creditsForUsage(
      { output_tokens: 1_000_000 },
      "claude-haiku-4-5",
      { marginMultiplier: 5, creditsPerDollar: 2000 }
    );
    // $5 × 5 × 2000 = 50,000.
    expect(credits).toBe(50_000);
  });

  it("charges at least 1 credit for any non-zero usage", () => {
    expect(creditsForUsage({ output_tokens: 1 }, "claude-haiku-4-5")).toBe(1);
  });

  it("charges 0 for empty usage", () => {
    expect(creditsForUsage({}, "claude-opus-4-8")).toBe(0);
  });

  it("rounds fractional credits up (never undercharges)", () => {
    // tiny output → sub-credit raw cost → ceil to 1.
    const credits = creditsForUsage({ output_tokens: 3 }, "claude-haiku-4-5");
    expect(credits).toBe(1);
  });
});

describe("estimateCredits", () => {
  it("matches creditsForUsage for the same uncached token counts", () => {
    const est = estimateCredits({ inputTokens: 1500, outputTokens: 500 }, "claude-haiku-4-5");
    const actual = creditsForUsage(
      { input_tokens: 1500, output_tokens: 500 },
      "claude-haiku-4-5"
    );
    expect(est).toBe(actual);
  });

  it("a ~1-page announcement draft lands in a sane credit range", () => {
    // Plan's worked example: ~1.5k in / 0.5k out — cents of cost, a couple
    // hundred credits at most on the cheap tier.
    const est = estimateCredits({ inputTokens: 1500, outputTokens: 500 }, DRAFT_MODEL);
    expect(est).toBeGreaterThan(0);
    expect(est).toBeLessThan(100);
  });
});

describe("credit packs", () => {
  it("exposes Small/Medium/Large with volume bonuses on the bigger packs", () => {
    expect(CREDIT_PACKS.map((p) => p.id)).toEqual(["small", "medium", "large"]);
    const small = packById("small")!;
    const medium = packById("medium")!;
    const large = packById("large")!;
    // Effective credits-per-dollar rises with pack size.
    expect(medium.credits / medium.priceUsd).toBeGreaterThan(small.credits / small.priceUsd);
    expect(large.credits / large.priceUsd).toBeGreaterThan(medium.credits / medium.priceUsd);
  });

  it("returns undefined for an unknown pack id", () => {
    expect(packById("ginormous")).toBeUndefined();
  });
});

describe("wallet balance & gating", () => {
  const w: Wallet = { allowance: 100, purchased: 50 };

  it("sums both pools", () => {
    expect(walletBalance(w)).toBe(150);
  });

  it("clamps negative pools out of the total", () => {
    expect(walletBalance({ allowance: -10, purchased: 50 })).toBe(50);
  });

  it("affords amounts up to the balance and refuses beyond", () => {
    expect(canAfford(w, 150)).toBe(true);
    expect(canAfford(w, 151)).toBe(false);
    expect(canAfford(w, 0)).toBe(true);
    expect(canAfford({ allowance: 0, purchased: 0 }, 1)).toBe(false);
  });
});

describe("splitDebit / applyDebit (allowance-first spend order)", () => {
  it("drains allowance before purchased", () => {
    const s = splitDebit({ allowance: 100, purchased: 50 }, 120);
    expect(s).toEqual({ ok: true, fromAllowance: 100, fromPurchased: 20 });
  });

  it("uses only allowance when it covers the debit", () => {
    const s = splitDebit({ allowance: 100, purchased: 50 }, 60);
    expect(s).toEqual({ ok: true, fromAllowance: 60, fromPurchased: 0 });
  });

  it("refuses (ok:false, zero split) when the wallet can't cover it", () => {
    const s = splitDebit({ allowance: 100, purchased: 50 }, 151);
    expect(s).toEqual({ ok: false, fromAllowance: 0, fromPurchased: 0 });
  });

  it("applyDebit subtracts from the right pools", () => {
    expect(applyDebit({ allowance: 100, purchased: 50 }, 120)).toEqual({
      allowance: 0,
      purchased: 30,
    });
  });

  it("applyDebit throws rather than overdrawing", () => {
    expect(() => applyDebit({ allowance: 10, purchased: 0 }, 11)).toThrow(/insufficient/i);
  });

  it("a zero/negative debit is a no-op split", () => {
    expect(splitDebit({ allowance: 5, purchased: 5 }, 0)).toEqual({
      ok: true,
      fromAllowance: 0,
      fromPurchased: 0,
    });
  });
});

describe("applyCredit / resetAllowance", () => {
  it("purchases and refunds land in the permanent purchased pool", () => {
    expect(applyCredit({ allowance: 0, purchased: 0 }, 10_000, "purchase")).toEqual({
      allowance: 0,
      purchased: 10_000,
    });
    expect(applyCredit({ allowance: 0, purchased: 5 }, 5, "refund")).toEqual({
      allowance: 0,
      purchased: 10,
    });
  });

  it("grants land in the resetting allowance pool", () => {
    expect(applyCredit({ allowance: 0, purchased: 0 }, 50_000, "grant")).toEqual({
      allowance: 50_000,
      purchased: 0,
    });
  });

  it("ignores non-positive credits", () => {
    const w = { allowance: 1, purchased: 1 };
    expect(applyCredit(w, 0, "purchase")).toBe(w);
    expect(applyCredit(w, -5, "grant")).toBe(w);
  });

  it("resetAllowance replaces allowance and leaves purchased intact", () => {
    expect(resetAllowance({ allowance: 3, purchased: 99 }, 250_000)).toEqual({
      allowance: 250_000,
      purchased: 99,
    });
  });
});

describe("deriveBalance (ledger is truth)", () => {
  it("replays grant → purchase → debits with allowance-first ordering", () => {
    const ledger: LedgerEntry[] = [
      { type: "grant", credits: 100 }, // allowance 100
      { type: "purchase", credits: 50 }, // purchased 50
      { type: "debit", credits: 120 }, // -100 allowance, -20 purchased
    ];
    expect(deriveBalance(ledger)).toEqual({ allowance: 0, purchased: 30 });
  });

  it("a refund restores purchased credits", () => {
    const ledger: LedgerEntry[] = [
      { type: "purchase", credits: 100 },
      { type: "debit", credits: 40 },
      { type: "refund", credits: 10 },
    ];
    expect(deriveBalance(ledger)).toEqual({ allowance: 0, purchased: 70 });
  });

  it("clamps a debit that would overdraw a malformed ledger to zero", () => {
    const ledger: LedgerEntry[] = [
      { type: "grant", credits: 10 },
      { type: "debit", credits: 999 },
    ];
    expect(deriveBalance(ledger)).toEqual({ allowance: 0, purchased: 0 });
  });

  it("an empty ledger is a zero wallet", () => {
    expect(deriveBalance([])).toEqual({ allowance: 0, purchased: 0 });
  });

  it("agrees with stepwise apply* for the same sequence", () => {
    let w: Wallet = { allowance: 0, purchased: 0 };
    w = applyCredit(w, 250_000, "grant");
    w = applyCredit(w, 10_000, "purchase");
    w = applyDebit(w, 180);
    expect(deriveBalance([
      { type: "grant", credits: 250_000 },
      { type: "purchase", credits: 10_000 },
      { type: "debit", credits: 180 },
    ])).toEqual(w);
  });
});
