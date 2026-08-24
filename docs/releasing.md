# Releasing & versioning

HOA Connect's version number is **auto-counted from git** — you almost never touch it by hand. This doc explains the model, the one manual lever you do have, and the one thing you must write when you pull it.

## How the version number works

The version shown in-app (Account → About, and the "new version available" prompt) is `MAJOR.MINOR.PATCH`, resolved at build time in [`core/nuxt.config.ts`](../core/nuxt.config.ts) → `resolveAppVersion()`:

```
   2.1   from package.json "version"  ─┐
                                       ├──►   2.1.1027
   1027  git rev-list --count HEAD    ─┘        │    │
                                                │    └── PATCH = total commits   (automatic)
                                                └─────── MAJOR.MINOR = the line  (manual)
```

- **PATCH (third number)** climbs by itself on **every push that deploys**. No action needed. That movement is the point — it is the at-a-glance signal that a fresh build shipped.
- **MAJOR.MINOR** is `package.json`'s `version`, and bumping it is the **only** manual lever.

> **Two different mechanisms, don't confuse them.** The per-deploy **freshness check** — the "A new version is available · Refresh" prompt — keys off `buildId` (the deploy id / commit SHA), *not* off this number. The version is the human-readable **label**; `buildId` is the **signal**. Changing one never affects the other.

### Tag-free by design

An earlier scheme in the Earnest codebase derived the number from `git describe --tags`. It broke on Vercel: the authenticated clone of a private remote fetches commits but **not tags**, so `describe` failed on every deploy and the version silently froze at the static `package.json` value for months. Counting commits needs only commit history — which `git fetch --unshallow` can restore and Vercel's clone supports — never tags. That is why `resolveAppVersion()` counts instead of describing.

### What happens on a shallow clone

Vercel checks out a shallow clone. `resolveAppVersion()` tries `--unshallow` / `--deepen`, then **re-checks** whether the repo is still shallow, because on some build containers the deepen cannot succeed. Only a genuinely complete history is trusted for the count — a shallow one would freeze the label at the clone depth (the "stuck at 2.0.10" bug). If it stays shallow, the patch falls back to the deploy's **commit SHA**: `2.1.a1b2c3d`. That is honest and it still changes on every deploy. Nothing parses the version as numeric semver, so a hex patch is safe.

The build log always says which path it took:

```
[version] app version resolved to 2.1.1027
```

Check that line in the Vercel deploy log if a number ever looks wrong.

### Overriding it

Set `NUXT_PUBLIC_APP_VERSION` in the environment and it wins over everything. That is the escape hatch for a one-off build, not the normal path.

## Cutting a release (bumping MAJOR or MINOR)

```bash
pnpm release:minor
```

That is: a new feature line, `2.0.x → 2.1.0`, tag `v2.1`. For a breaking change or a new era:

```bash
pnpm release:major
```

Preview without changing anything, or pick the number yourself:

```bash
node scripts/bump-version.mjs minor --dry-run
node scripts/bump-version.mjs 2.5
```

The script writes `package.json` and creates the annotated tag on your current commit. It **does not commit or push** — it prints the exact commands so you decide when the new number ships.

### Then write the release note — this is not optional

Add an entry for the new line at the top of [`core/shared/app/release-notes.ts`](../core/shared/app/release-notes.ts):

```ts
{
  version: "2.1",
  date: "2026-09-01",
  title: "One sentence a resident would understand",
  highlights: [
    { icon: "i-lucide-sparkles", title: "…", body: "…" },
  ],
},
```

`tests/shared/release-notes.test.ts` **fails** if the current `MAJOR.MINOR` has no entry, so a release line physically cannot ship without one. That is deliberate: a release nobody wrote up is a release that shipped silently.

The note is what powers the **"What's new"** sheet — it appears once, on the first load after the line changes (which for most people is the load right after they tap Refresh on the update prompt), and can be reopened any time from **Account → About → What's new**.

Notes are keyed per **line**, never per patch. The patch moves on every push; writing a note per patch would mean writing one per commit.

### Ship it

```bash
git add package.json core/shared/app/release-notes.ts
git commit -m "chore(release): 2.1.0"
git push && git push origin v2.1
```

> ⚠️ **VS Code's Sync / Push does not send tags.** Use `git push origin v2.1`, or `Cmd+Shift+P` → **Git: Push Tags**, or the GitHub Release never gets filed.

## What happens after you push a tag

1. The next Vercel build bakes the new base in → the app shows `2.1.0`, then `2.1.1`, `2.1.2`… as you keep pushing.
2. [`.github/workflows/release.yml`](../.github/workflows/release.yml) fires on the tag push and creates a **GitHub Release** named `v2.1`, with notes auto-generated from the commits since the previous tag. That is the engineering changelog; `release-notes.ts` is the resident-facing one. They are different audiences on purpose.

## Rules of thumb

| You want… | Do this |
|---|---|
| Ship code, don't care about the number | Just push — the patch auto-increments |
| Mark a new feature line | `pnpm release:minor`, write the note, push the tag |
| Mark a breaking change / new era | `pnpm release:major`, write the note, push the tag |
| A specific number | `node scripts/bump-version.mjs 2.5`, then as above |
| Force a number for one build | `NUXT_PUBLIC_APP_VERSION=…` in the environment |

## Notes

- Tag format is **`vMAJOR.MINOR`** (`v2.1`, `v3.0`) — two parts, no patch. The patch is always the auto-counted commit total.
- `package.json`'s `version` patch digit (the `.0` in `2.1.0`) is **only** a fallback, used if git is unreachable at build time. The build never displays it when git works.
- The version resolver lives in the **core layer**, so every app extending `./core` gets the same scheme. It reads the *consuming* app's `package.json`, not one of its own.
