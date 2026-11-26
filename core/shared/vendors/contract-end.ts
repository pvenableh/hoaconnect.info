// When a vendor's current contract or cover runs out.
//
// `contract_end` is that date. Before it existed, `active_until` (the day the
// relationship ended) stood in for it, and older rows still only carry that, so
// every reader asks here: the contract date first, then the old stand-in.

export interface VendorDates {
  contract_end?: string | null;
  active_until?: string | null;
}

/** The calendar day (YYYY-MM-DD) the vendor's contract or cover ends, or null. */
export function vendorEndsOn(v: VendorDates | null | undefined): string | null {
  const raw = v?.contract_end || v?.active_until || null;
  return raw ? String(raw).slice(0, 10) : null;
}

/** The Directus fields `vendorEndsOn` reads. */
export const VENDOR_END_FIELDS = ["contract_end", "active_until"] as const;
