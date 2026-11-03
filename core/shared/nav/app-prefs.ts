/**
 * Per-user workspace preferences, stored on `directus_users.app_prefs` (JSON,
 * added by scripts/add-user-app-prefs-field.ts). Today: the dock's appearance.
 *
 * Shape: `{ dock: { palette, position, labels, glass } }`. Every key optional —
 * an absent key means "the default", so a user who never opened the
 * appearance menu stores nothing.
 *
 * Resolution (client, useAppNav): the user's stored value → this device's
 * localStorage cache → the default. localStorage is the SSR-safe cache that
 * paints the right dock on the first frame; the account value arrives a moment
 * later and wins, which is what makes a dock you set on the laptop follow you
 * to the phone.
 *
 * Pure: the server routes sanitize every read and write through here, so a
 * body can never carry anything but these four keys into the user row.
 */

export const DOCK_PALETTE_IDS = ["fresh", "aurora", "neutral", "vivid"] as const;
export type PaletteId = (typeof DOCK_PALETTE_IDS)[number];
export type DockPosition = "bottom" | "top";

export interface DockPrefs {
  palette?: PaletteId;
  position?: DockPosition;
  labels?: boolean;
  glass?: boolean;
}

export interface AppPrefs {
  dock?: DockPrefs;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Keep only known keys with valid values; anything else is dropped, silently. */
export function sanitizeAppPrefs(input: unknown): AppPrefs {
  if (!isRecord(input) || !isRecord(input.dock)) return {};
  const d = input.dock;
  const dock: DockPrefs = {};
  if (typeof d.palette === "string" && (DOCK_PALETTE_IDS as readonly string[]).includes(d.palette)) {
    dock.palette = d.palette as PaletteId;
  }
  if (d.position === "bottom" || d.position === "top") dock.position = d.position;
  if (typeof d.labels === "boolean") dock.labels = d.labels;
  if (typeof d.glass === "boolean") dock.glass = d.glass;
  return Object.keys(dock).length ? { dock } : {};
}

/** `patch` over `base`, key by key; both are sanitized first. */
export function mergeAppPrefs(base: unknown, patch: unknown): AppPrefs {
  const a = sanitizeAppPrefs(base);
  const b = sanitizeAppPrefs(patch);
  const dock = { ...a.dock, ...b.dock };
  return Object.keys(dock).length ? { dock } : {};
}
