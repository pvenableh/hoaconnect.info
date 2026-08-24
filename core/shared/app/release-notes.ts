// release-notes — what changed in each release LINE, written by hand, shipped
// with the build.
//
// Deliberately NOT a Directus collection. There is one author, the notes are
// about the code in this commit, and a note that ships in the same artifact as
// the feature it describes can never drift out of sync with it or be missing on
// a fresh environment. The cost is that adding a note is a commit — which is the
// same cost as adding the feature.
//
// Keyed by MAJOR.MINOR (the release LINE), never the full version. The patch is
// the git commit count (see core/nuxt.config.ts → resolveAppVersion), so it moves
// on every deploy; writing a note per patch would mean writing one per push.
// "What's new" is a story about a feature line, not about a deploy.

/** One bullet in the sheet. `icon` is a Lucide name (`i-lucide-…`). */
export interface ReleaseHighlight {
  icon?: string;
  title: string;
  body: string;
}

export interface ReleaseNote {
  /** MAJOR.MINOR, e.g. `"2.1"` — matches the `vX.Y` git tag for the line. */
  version: string;
  /** ISO `YYYY-MM-DD` the line was cut. Shown as the sheet's dateline. */
  date: string;
  /** The line's one-sentence headline. */
  title: string;
  highlights: ReleaseHighlight[];
}

/**
 * Newest first. Add a new entry at the TOP whenever `pnpm release:minor` bumps
 * the line — `tests/shared/release-notes.test.ts` fails the build if the current
 * MAJOR.MINOR has no entry, so a release cannot ship silently.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2.0",
    date: "2026-08-22",
    title: "A calmer workspace that opens on your content",
    highlights: [
      {
        icon: "i-lucide-layout-dashboard",
        title: "Sections open on content, not menus",
        body: "Requests, money, projects and people land you straight on the thing you came for instead of a card menu you have to click through first.",
      },
      {
        icon: "i-lucide-sparkles",
        title: "A new liquid-glass surface",
        body: "Cards, sheets and the dock share one refracted material, so depth reads the same everywhere — in light and dark.",
      },
      {
        icon: "i-lucide-bar-chart-3",
        title: "Charts and glances on the dashboard",
        body: "A chart kit runs across the workspace, the Gantt view is promoted out of its tab, and dashboard widgets are yours to arrange.",
      },
      {
        icon: "i-lucide-shield-check",
        title: "Community isolation, verified",
        body: "Notifications, tasks and project links are each checked against the community you are acting in — never just the record you asked for.",
      },
    ],
  },
];

/**
 * The release LINE for a full version string: `"2.1.1027"` → `"2.1"`.
 *
 * Tolerates the sha7 patch fallback (`"2.1.a1b2c3d"`) that `resolveAppVersion`
 * emits on a shallow, un-deepenable clone — only the first two segments are read.
 */
export function releaseLine(version?: string | null): string | null {
  const m = String(version ?? "").match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** The note for a full version string, or `null` when that line has none. */
export function noteForVersion(version?: string | null): ReleaseNote | null {
  const line = releaseLine(version);
  if (!line) return null;
  return RELEASE_NOTES.find((n) => n.version === line) ?? null;
}

/** The newest note — the fallback when the running version can't be read. */
export const LATEST_RELEASE: ReleaseNote | undefined = RELEASE_NOTES[0];

/**
 * localStorage key holding the last release line the user was shown.
 *
 * Storing the LINE (not a boolean) is what makes the sheet self-arming: after
 * 2.1 ships, the stored `"2.0"` no longer matches and the sheet shows once more.
 */
export const WHATS_NEW_SEEN_KEY = "hoa:whats-new-seen-line";
