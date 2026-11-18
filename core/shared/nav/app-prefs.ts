/**
 * Per-user workspace preferences, stored on `directus_users.app_prefs` (JSON,
 * added by scripts/add-user-app-prefs-field.ts). Today: the tint (Phase 4,
 * plan §2.4, decisions 4 and 8).
 *
 * Shape: `{ tint: { on, swatch } }`. Every key optional, and a default is never
 * stored: Tint on and the community's swatch are what an absent key means, so
 * a person who never changed them stores nothing, and the community's colour
 * itself is never copied in (it is read from the community each time).
 *
 * Light, Dark and Auto are NOT here: they live on `directus_users.appearance`,
 * which useAppearance has always owned.
 *
 * The old `{ dock: { palette, position, labels, glass } }` keys are dropped on
 * read, and the next write leaves them out of the row (no community is live,
 * so nothing is carried over).
 *
 * Resolution (client, useAppearance): the user's stored value → this device's
 * localStorage cache → the default. The account value wins once it arrives,
 * which is what makes a tint chosen on the laptop follow you to the phone.
 *
 * Pure: the server routes sanitize every read and write through here, so a
 * body can never carry anything but these keys into the user row.
 */

import {
  DEFAULT_TINT_ON,
  DEFAULT_TINT_SWATCH,
  isTintSwatchId,
  type TintSwatchId,
} from "#core/shared/branding/accent";

export type { TintSwatchId };

export interface TintPrefs {
  on?: boolean;
  swatch?: TintSwatchId;
}

export interface AppPrefs {
  tint?: TintPrefs;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Keep only known keys with valid values; anything else is dropped, silently. */
export function sanitizeAppPrefs(input: unknown): AppPrefs {
  if (!isRecord(input) || !isRecord(input.tint)) return {};
  const t = input.tint;
  const tint: TintPrefs = {};
  if (typeof t.on === "boolean") tint.on = t.on;
  if (isTintSwatchId(t.swatch)) tint.swatch = t.swatch;
  return Object.keys(tint).length ? { tint } : {};
}

/** Drop what an absent key already means. */
function withoutDefaults(tint: TintPrefs): TintPrefs {
  const out: TintPrefs = { ...tint };
  if (out.on === DEFAULT_TINT_ON) delete out.on;
  if (out.swatch === DEFAULT_TINT_SWATCH) delete out.swatch;
  return out;
}

/**
 * `patch` over `base`, key by key; both are sanitized first, and the result
 * carries no default (choosing the default again removes the key).
 */
export function mergeAppPrefs(base: unknown, patch: unknown): AppPrefs {
  const a = sanitizeAppPrefs(base);
  const b = sanitizeAppPrefs(patch);
  const tint = withoutDefaults({ ...a.tint, ...b.tint });
  return Object.keys(tint).length ? { tint } : {};
}
