// useAppNav — the "Apps" model for the floating dock navigation.
//
// The dock's one setting is "Show app names" (Session 18, off by default),
// which useAppearance owns with the tint: it sits at the bottom and wears the
// person's tint, so there are no palettes, no position and no glass chrome
// switch here. The one ramp left, LANDING_RAMP, colours the
// PUBLIC landing's dock (Org/Landing/LandingDock.vue), which keeps its own
// look: it is the "fresh" ramp that was every visitor's default.

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface AppDef {
  key: string;
  label: string;
  /** Short label shown under the dock icon (keeps chip spacing even) */
  shortName: string;
  icon: string; // lucide icon name (without the i-lucide- prefix)
  /** Path relative to the org root, e.g. "/admin/meetings" or "/meetings" */
  path: string;
  /** Route fragments that mark this app active ("__root__" = exact "/") */
  match: string[];
  /** For a hub gated on a list of modules: those module keys. Informational. */
  children?: string[];
}

import { NAV_LAYOUTS, isHub, navEntry, type NavEntry } from "#core/shared/nav/registry";

// Aquamarine through bright sky blue (ported from Earnest's Sea Mist).
export const LANDING_RAMP: readonly HSL[] = [
  { h: 163, s: 100, l: 75 },
  { h: 171, s: 80, l: 69 },
  { h: 180, s: 66, l: 63 },
  { h: 188, s: 70, l: 61 },
  { h: 194, s: 73, l: 59 },
  { h: 202, s: 69, l: 59 },
  { h: 213, s: 64, l: 56 },
  { h: 239, s: 53, l: 59 },
  { h: 261, s: 60, l: 56 },
  { h: 278, s: 70, l: 52 },
];

// Gappy sampling: spread `count` picks across a ramp of `sourceLen` (Earnest)
export function pickGappy(sourceLen: number, count: number): number[] {
  if (count <= 1) return [0];
  if (count >= sourceLen)
    return Array.from({ length: count }, (_, i) => Math.min(i, sourceLen - 1));
  const step = (sourceLen - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

// Map unread notifications onto per-app badge counts, keyed by app `key`. A
// single notification type fans out to BOTH the admin hub key and the member
// leaf key (e.g. a meeting → "records" for the admin dock AND "meetings" for the
// member dock) — extra keys are harmless since each surface only reads
// counts[app.key] for the apps it actually renders. Keeping this in one place is
// what stops the dock and the sidebar badge maps from drifting apart.
const NOTIF_BADGE_KEYS: Record<string, string[]> = {
  announcement: ["comms"],
  email: ["comms"],
  meeting: ["records", "meetings"],
  document: ["records", "documents"],
  payment: ["payments", "pay"],
  membership: ["people"],
  request: ["requests", "my-requests"],
};

export function badgeCountsFor(
  notifications: readonly { readonly type?: string | null; readonly isRead?: boolean }[] | null | undefined,
  // Unread channel messages. Channels are deliberately off the dock (they open
  // as a slide-over from the top nav), but they live UNDER Communications, so
  // their unread rolls into that section's badge — otherwise the one surface
  // that counts unread messages is the one place the dock stays silent about.
  // Passed in rather than read here so this stays a pure mapping function.
  channelUnread = 0,
  // Emails of this org mid-send (the send queue, Phase 3b): Communications
  // shows them until they finish, so a send running in the background is
  // visible from anywhere.
  sendingEmails = 0
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of notifications || []) {
    if (n.isRead) continue;
    for (const key of NOTIF_BADGE_KEYS[n.type ?? ""] ?? []) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const channels = Math.max(0, Math.floor(Number(channelUnread) || 0));
  if (channels) counts.comms = (counts.comms || 0) + channels;
  const sending = Math.max(0, Math.floor(Number(sendingEmails) || 0));
  if (sending) counts.comms = (counts.comms || 0) + sending;
  return counts;
}

// The dock's apps come from the nav registry (core/shared/nav/registry.ts), the
// only source of nav entries; see docs/spec-capability-nav.md. An AppDef is the
// dock's view of one entry. These derived lists keep the shape the page
// transitions read: the admin sections in dock order and the member apps.
export function toAppDef(e: NavEntry): AppDef {
  const modules = e.needs.flatMap((n) => ("module" in n && typeof n.module !== "string" ? [...n.module] : []));
  return {
    key: e.id,
    label: e.label,
    shortName: e.shortName,
    icon: e.icon,
    path: e.path,
    match: [...(e.match ?? (e.path === "/" ? ["__root__"] : [e.path.split("?")[0]]))],
    ...(modules.length ? { children: modules } : {}),
  };
}

const layoutApps = (ids: readonly string[]): AppDef[] =>
  ids.flatMap((id) => {
    const e = navEntry(id);
    return e ? [toAppDef(e)] : [];
  });

/** The admin dock's sections, in dock order (the queue aside: it is the hat's). */
export const ADMIN_APPS: readonly AppDef[] = layoutApps(NAV_LAYOUTS.admin.filter((id) => id !== "queue"));
/** The member dock's apps (Money is a hub, so it lives with the admin sections). */
export const MEMBER_APPS: readonly AppDef[] = layoutApps(NAV_LAYOUTS.member.filter((id) => !isHub(id)));

export function useAppNav() {
  const route = useRoute();
  const { buildOrgPath, navigateToOrg } = useOrgNavigation();

  // Per-chip accents for the PUBLIC landing's dock: gappy picks across the
  // fixed ramp, so neighbours contrast.
  const accentsForApps = (apps: readonly unknown[]): HSL[] => {
    const idx = pickGappy(LANDING_RAMP.length, apps.length);
    return apps.map((_, i) => LANDING_RAMP[idx[i]!]!);
  };

  const activeKeyFor = (apps: AppDef[]): string | null => {
    const slug = route.params.slug as string | undefined;
    const rel = slug ? route.path.replace(new RegExp(`^/${slug}`), "") || "/" : route.path;
    let best: { key: string; len: number } | null = null;
    for (const app of apps) {
      for (const m of app.match) {
        const hit = m === "__root__" ? rel === "/" : rel.startsWith(m);
        if (hit && (!best || m.length > best.len)) best = { key: app.key, len: m.length };
      }
    }
    return best?.key ?? null;
  };

  const go = (app: AppDef) => navigateToOrg(app.path);

  return {
    accentsForApps,
    activeKeyFor,
    go,
    buildOrgPath,
  };
}
