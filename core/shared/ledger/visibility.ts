/**
 * The visibility policy — "may this person see this entry?", decided once.
 *
 * VISION Pillar B asks for a "central visibility-policy module — decided once,
 * enforced everywhere", and lists the reason immediately after it: the first
 * named risk to this whole product is a delinquency-shaming incident. A rule
 * that lives in each reader is a rule that is one forgotten `if` away from
 * showing a neighbour's payment history to the neighbourhood.
 *
 * Two entry points, and the difference between them matters:
 *
 * - `visibleTiersFor(viewer)` returns the tiers a viewer may read, so a QUERY
 *   can be narrowed before it runs (`visibility: { _in: [...] }`). Post-filtering
 *   a page of rows would make every count and every "load more" cursor lie —
 *   a viewer would page through gaps and reach the end early.
 * - `canView(entry, viewer)` answers for ONE row, for drill-downs, single-entry
 *   fetches, and the exporter.
 *
 * They must agree, so `canView` is defined in terms of `visibleTiersFor`.
 *
 * **Fails closed, in both directions.** An unrecognised `visibility` string is
 * treated as `board` — a row written by a newer deploy with a tier this build
 * has never heard of is withheld rather than leaked. A viewer with no seat in
 * the community sees nothing at all, regardless of what hats they wear
 * elsewhere; tenant isolation is the caller's job, but this will not help them
 * get it wrong.
 *
 * Pure: no Directus, no H3, no clock.
 */

import type { LedgerVisibility } from "./entry";
import { LEDGER_VISIBILITIES } from "./entry";

/**
 * The hats a caller wears in ONE organization. Assembled by the route from the
 * existing server utils (`checkAdminAccess`, `getBoardPosition`,
 * `getManagerGrants`, `checkMembership`) — this module never looks anything up.
 */
export interface LedgerViewer {
  /** Has a seat in this community: an active `hoa_members` row. */
  readonly isMember: boolean;
  /** Holds a current-term board office. */
  readonly isBoard: boolean;
  /** An active property manager of this community. */
  readonly isManager: boolean;
  /** Org administrator. */
  readonly isAdmin: boolean;
}

export const NO_ACCESS: LedgerViewer = {
  isMember: false,
  isBoard: false,
  isManager: false,
  isAdmin: false,
};

/**
 * Whatever is stored in the column, as a tier this build understands.
 * Anything unrecognised — including `null`, a typo, or a tier from a newer
 * deploy — becomes `board`, the narrower of the two.
 */
export function normalizeVisibility(value: unknown): LedgerVisibility {
  return LEDGER_VISIBILITIES.includes(value as LedgerVisibility)
    ? (value as LedgerVisibility)
    : "board";
}

/**
 * The tiers this viewer may read, narrowest first. Empty means "no ledger at
 * all", which the route should turn into a 403 rather than an empty feed — a
 * stranger deserves a closed door, not the impression that the community has
 * no history.
 *
 * Admin, board office and property manager each imply a seat: `checkAdminAccess`
 * and the manager lookup both resolve through an active membership row, and a
 * board office is keyed to one. They are not required to also assert
 * `isMember`, so a caller that only resolved one hat still gets the right
 * answer.
 */
export function visibleTiersFor(viewer: LedgerViewer): readonly LedgerVisibility[] {
  if (viewer.isAdmin || viewer.isBoard || viewer.isManager) return ["owners", "board"];
  if (viewer.isMember) return ["owners"];
  return [];
}

/** True when the viewer may see any of the ledger at all. */
export function canViewLedger(viewer: LedgerViewer): boolean {
  return visibleTiersFor(viewer).length > 0;
}

/** May this viewer see this one entry? */
export function canView(
  entry: { readonly visibility?: unknown },
  viewer: LedgerViewer
): boolean {
  return visibleTiersFor(viewer).includes(normalizeVisibility(entry.visibility));
}

/**
 * The visible subset of a list, order preserved.
 *
 * For a list that was NOT narrowed by the query — an export archive, a cached
 * page, a fixture. A route reading from Directus should narrow with
 * `visibleTiersFor` instead; see the header.
 */
export function filterVisible<T extends { readonly visibility?: unknown }>(
  entries: readonly T[],
  viewer: LedgerViewer
): readonly T[] {
  const tiers = visibleTiersFor(viewer);
  if (!tiers.length) return [];
  if (tiers.length === LEDGER_VISIBILITIES.length) return entries;
  return entries.filter((e) => tiers.includes(normalizeVisibility(e.visibility)));
}

/**
 * The Directus filter fragment for a viewer, or `null` when they may see
 * nothing. Returned as data so the route stays declarative and the shape of the
 * narrowing is unit-testable rather than buried in a query builder.
 */
export function visibilityFilter(
  viewer: LedgerViewer
): { readonly visibility: { readonly _in: readonly LedgerVisibility[] } } | null {
  const tiers = visibleTiersFor(viewer);
  return tiers.length ? { visibility: { _in: tiers } } : null;
}
