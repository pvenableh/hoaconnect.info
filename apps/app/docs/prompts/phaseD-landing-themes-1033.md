# Track D — per-tenant landing themes + 1033 migration

Status: **landing theming done; 1033 migration scaffolded, not run.**

## 1. Per-tenant landing themes — DONE

- The org's style is stored on `block_settings.theme`
  (`hoa_organizations.settings`). `app/pages/[slug]/index.vue` now reads it and
  calls `forceThemeStyle(style)` (SSR-safe via useHead; does not persist to the
  visitor's own preferences).
- `BrandingSettingsForm.vue` already offered classic | modern | **luxury** and
  saves `settings.theme`, so the full style set is already exposed in org
  settings — no UI change needed.
- `scripts/extend-landing-theme.ts` (`pnpm extend:landing-theme`) widens the
  Directus `block_settings.theme` dropdown to include `luxury` (the column is a
  string, so luxury already saved; this aligns the admin UI + generated types).
  Run it, then `pnpm generate:types`.

## 2. Migrate 1033 as tenant #1 — SCAFFOLDED (needs the data source)

- `scripts/migrate-1033.ts` (`pnpm migrate:1033`, `-- --dry` for a no-write
  report). 1033 runs on its **own Directus** (collections `corporation`,
  `units`, `people`/`persons`, `junction_directus_users_units`, `board`, …). The
  script reads from that source and upserts onto the HOA Connect `hoa_*`
  collections: org (slug `1033-lenox`, `settings.theme=classic`), units →
  `hoa_units`, people → `hoa_members`, junction → `hoa_member_units`, board →
  `hoa_board_members`. Idempotent (matches on natural keys). The 1033 finance
  engine is intentionally left behind.

### To run (needs you)
1. **Confirm the source mapping.** The `SOURCE` map at the top of the script is
   a best-guess from the 1033 codebase — verify collection/field names against
   the live 1033 Directus schema (esp. `people` vs `persons`, the junction
   field names, and the `board` person/title fields).
2. **Provide source credentials**: `SOURCE_1033_DIRECTUS_URL` +
   `SOURCE_1033_TOKEN` (a read token for 1033's Directus) in `.env`.
3. Dry-run first: `pnpm migrate:1033 -- --dry`, eyeball the create/update plan,
   then run for real.
4. Verify units/members/board in HOA Connect and the public landing at
   `/1033-lenox` (classic style).
