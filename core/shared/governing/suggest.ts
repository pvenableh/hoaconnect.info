/**
 * Governing documents: checking what the model proposes (Session 4; spec §5).
 * Pure: no Directus, no model call.
 *
 * The model may only point: "this provision, this reference from the curated
 * library, and these words of the provision are why". It writes no rule, no
 * citation and no conclusion. Everything it returns is checked here, and what
 * does not check out is dropped:
 *   - the provision must be one that was sent;
 *   - the reference must be in the library that was sent;
 *   - the quote must be found in the provision's text exactly as stored.
 */

/** A quote shorter than this (not counting spaces) says nothing about why. */
export const MIN_QUOTE_CHARS = 10;
/** One run never saves more than this. */
export const MAX_SUGGESTIONS = 60;

export type RawSuggestion = { provision_id?: unknown; reference_id?: unknown; quote?: unknown };
export type AcceptedSuggestion = { provision: string; reference: string; quote: string };
export type RejectReason = "malformed" | "unknown_provision" | "unknown_reference" | "quote_not_in_text" | "quote_too_short" | "duplicate" | "already_flagged" | "over_limit";
export type RejectedSuggestion = { reason: RejectReason; provision: string | null; reference: string | null };

export const pairKey = (provision: string, reference: string) => `${provision}|${reference}`;

export function validateSuggestions(
  raw: unknown,
  known: {
    /** Provision id → its text, exactly as stored. */
    provisions: ReadonlyMap<string, string>;
    /** Ids of the library references that were offered. */
    references: ReadonlySet<string>;
    /** `pairKey`s that already have a flag of any status, so a re-run adds nothing twice. */
    existing: ReadonlySet<string>;
  }
): { accepted: AcceptedSuggestion[]; rejected: RejectedSuggestion[] } {
  const accepted: AcceptedSuggestion[] = [];
  const rejected: RejectedSuggestion[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw) ? (raw as RawSuggestion[]) : [];

  for (const item of list) {
    const provision = typeof item?.provision_id === "string" ? item.provision_id : null;
    const reference = typeof item?.reference_id === "string" ? item.reference_id : null;
    const quote = typeof item?.quote === "string" ? item.quote : null;
    const reject = (reason: RejectReason) => rejected.push({ reason, provision, reference });

    if (!provision || !reference || quote === null) reject("malformed");
    else if (!known.provisions.has(provision)) reject("unknown_provision");
    else if (!known.references.has(reference)) reject("unknown_reference");
    else if (quote.replace(/\s/g, "").length < MIN_QUOTE_CHARS) reject("quote_too_short");
    else if (!known.provisions.get(provision)!.includes(quote)) reject("quote_not_in_text");
    else if (seen.has(pairKey(provision, reference))) reject("duplicate");
    else if (known.existing.has(pairKey(provision, reference))) reject("already_flagged");
    else if (accepted.length >= MAX_SUGGESTIONS) reject("over_limit");
    else {
      seen.add(pairKey(provision, reference));
      accepted.push({ provision, reference, quote });
    }
  }
  return { accepted, rejected };
}

export const countRejections = (rejected: RejectedSuggestion[]) =>
  rejected.reduce<Partial<Record<RejectReason, number>>>((counts, r) => ({ ...counts, [r.reason]: (counts[r.reason] ?? 0) + 1 }), {});

/** Split provisions into batches the model reads in one pass each, by size of text. */
export function batchBySize<T extends { text: string }>(items: T[], maxChars: number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length && size + item.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}
