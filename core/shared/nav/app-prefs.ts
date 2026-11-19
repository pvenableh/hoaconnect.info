/**
 * Per-user workspace preferences, stored on `directus_users.app_prefs` (JSON,
 * added by scripts/add-user-app-prefs-field.ts). Today: the tint (Phase 4,
 * plan §2.4, decisions 4 and 8) and whether the dock names its apps
 * (Session 18; off by default, which reverses Session 12's "labels on"), and
 * whether the attention line is open (Session 18: "What needs you" on the
 * dashboard, open by default; "Worth a look" on the hub pages, shut by
 * default). Per person rather than per device: a board member who keeps it
 * shut on the laptop keeps it shut on the phone.
 *
 * Shape: `{ tint: { on, swatch }, dock: { names }, attention: { home, hubs } }`. Every key optional, and
 * a default is never stored: Tint on, the community's swatch and names off are
 * what an absent key means, so a person who never changed them stores nothing
 * (`dock.names: true` is the only dock value ever written), and the
 * community's colour itself is never copied in (it is read from the community
 * each time).
 *
 * Light, Dark and Auto are NOT here: they live on `directus_users.appearance`,
 * which useAppearance has always owned.
 *
 * The old `{ dock: { palette, position, labels, glass } }` keys are dropped on
 * read, and the next write leaves them out of the row (no community is live,
 * so nothing is carried over). The old `labels` was the pre-Phase 4 switch;
 * `names` is the new one, so an old row's `labels: true` does not turn names on.
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

export interface DockPrefs {
  /** Show each app's name under its icon. Off (absent) by default. */
  names?: boolean;
}

/** Is the attention line open: on the dashboard (`home`), on the hub pages (`hubs`). */
export interface AttentionPrefs {
  home?: boolean;
  hubs?: boolean;
}

export interface AppPrefs {
  tint?: TintPrefs;
  dock?: DockPrefs;
  attention?: AttentionPrefs;
}

/** What needs you opens on the dashboard; Worth a look stays one line on the hubs. */
export const DEFAULT_ATTENTION_OPEN: Required<AttentionPrefs> = { home: true, hubs: false };

/** Names under the dock's icons: off unless a person turns them on. */
export const DEFAULT_DOCK_NAMES = false;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** The sections that hold something, and nothing else. */
function compact(prefs: AppPrefs): AppPrefs {
  const out: AppPrefs = {};
  if (prefs.tint && Object.keys(prefs.tint).length) out.tint = prefs.tint;
  if (prefs.dock && Object.keys(prefs.dock).length) out.dock = prefs.dock;
  if (prefs.attention && Object.keys(prefs.attention).length) out.attention = prefs.attention;
  return out;
}

/**
 * Keep only known keys with valid values; anything else is dropped, silently.
 * A default may come through here (a write may choose it, to clear the key);
 * `mergeAppPrefs` is what drops it before anything is stored.
 */
export function sanitizeAppPrefs(input: unknown): AppPrefs {
  if (!isRecord(input)) return {};
  const tint: TintPrefs = {};
  if (isRecord(input.tint)) {
    const t = input.tint;
    if (typeof t.on === "boolean") tint.on = t.on;
    if (isTintSwatchId(t.swatch)) tint.swatch = t.swatch;
  }
  const dock: DockPrefs = {};
  if (isRecord(input.dock) && typeof input.dock.names === "boolean") dock.names = input.dock.names;
  const attention: AttentionPrefs = {};
  if (isRecord(input.attention)) {
    if (typeof input.attention.home === "boolean") attention.home = input.attention.home;
    if (typeof input.attention.hubs === "boolean") attention.hubs = input.attention.hubs;
  }
  return compact({ tint, dock, attention });
}

/** Drop what an absent key already means. */
function withoutDefaults(prefs: AppPrefs): AppPrefs {
  const tint: TintPrefs = { ...prefs.tint };
  if (tint.on === DEFAULT_TINT_ON) delete tint.on;
  if (tint.swatch === DEFAULT_TINT_SWATCH) delete tint.swatch;
  const dock: DockPrefs = { ...prefs.dock };
  if (dock.names === DEFAULT_DOCK_NAMES) delete dock.names;
  const attention: AttentionPrefs = { ...prefs.attention };
  if (attention.home === DEFAULT_ATTENTION_OPEN.home) delete attention.home;
  if (attention.hubs === DEFAULT_ATTENTION_OPEN.hubs) delete attention.hubs;
  return compact({ tint, dock, attention });
}

/**
 * `patch` over `base`, key by key; both are sanitized first, and the result
 * carries no default (choosing the default again removes the key).
 */
export function mergeAppPrefs(base: unknown, patch: unknown): AppPrefs {
  const a = sanitizeAppPrefs(base);
  const b = sanitizeAppPrefs(patch);
  return withoutDefaults({
    tint: { ...a.tint, ...b.tint },
    dock: { ...a.dock, ...b.dock },
    attention: { ...a.attention, ...b.attention },
  });
}
