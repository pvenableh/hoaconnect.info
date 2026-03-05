# Follow-Up: Clean Up Remaining `isCustomDomain` References

## Context

We removed APEX/custom domain support from the core SaaS platform in commit `33b350f`. Custom domain setups are now handled as separate bespoke Nuxt projects delivered as an agency service.

As part of that change, `useActiveHoa().isCustomDomain` was kept as `computed(() => false)` to avoid breaking ~15 consumer files. This follow-up pass removes all dead `isCustomDomain` branches and simplifies the code that depended on them.

## Goal

- Remove the `isCustomDomain` export from `useActiveHoa` composable entirely
- Simplify all consumer files by evaluating `isCustomDomain` as `false` and removing dead branches
- Clean up stale comments referencing custom domains
- Remove the `docs/SSL-FIX-605lincolnroad.md` file (no longer relevant)
- Remove one stale comment in `server/api/hoa/invite-member.post.ts` line 175

## Rules

- Do NOT re-introduce any custom domain logic
- Do NOT modify any file that was not listed below
- Do NOT delete the `docs/follow-up-cleanup-isCustomDomain.md` file (this file)
- Commit with message: `Clean up remaining isCustomDomain dead code after APEX domain removal`

---

## Files to Modify

### 1. `app/composables/useActiveHoa.ts`

Remove the `isCustomDomain` line from the return object:
```ts
// REMOVE THIS LINE:
isCustomDomain: computed(() => false),
```

### 2. `app/composables/useOrgNavigation.ts`

- Remove `const { isCustomDomain } = useActiveHoa();`
- Simplify `isOrgRoute`: was `!!orgSlug.value || isCustomDomain.value` → becomes `!!orgSlug.value`
- Remove the `if (isCustomDomain.value)` branch in `orgPath()` — it returned path without slug prefix; since it's always false, just keep the slug-based path logic
- Remove `isCustomDomain` from the return object
- Clean up comments mentioning custom domains

### 3. `app/composables/useCurrentDomainAccess.ts`

- Remove `const { activeHoa, isCustomDomain } = useActiveHoa();` — change to `const { activeHoa } = useActiveHoa();`
- Simplify `isOnOrgContext`: was `isCustomDomain.value || !!route.params.slug` → becomes `!!route.params.slug`
- Clean up the JSDoc comment on line 10 about custom domains

### 4. `app/components/App/Nav.vue`

- Remove `isCustomDomain` from the `useActiveHoa()` destructure
- `showOrgSwitcher` (line 34): was `!isCustomDomain.value && !isOnOrgPage.value` → becomes `!isOnOrgPage.value`
- `showAdminLink` (lines 73, 84): `isOnOrgPage.value || isCustomDomain.value` → `isOnOrgPage.value`
- `shouldShowOrgBranding` (line 130): same simplification
- `orgBrandingPath` (line 146): remove `if (isCustomDomain.value)` branch
- Template line 534: `v-if="!isOnOrgPage && !isCustomDomain"` → `v-if="!isOnOrgPage"`
- Clean up comments on lines 29, 32, 66, 72, 128, 145

### 5. `app/pages/documents/upload.vue`

- Remove `const { isCustomDomain } = useActiveHoa();`
- Simplify `basePath`: was `isCustomDomain.value ? '' : \`/\${currentOrg.value.organization.slug}\`` → becomes `` `/${currentOrg.value.organization.slug}` ``
- Remove comment "On custom domains, don't include slug in URL"

### 6. `app/pages/members/index.vue`

Same pattern as `documents/upload.vue`:
- Remove `const { isCustomDomain } = useActiveHoa();`
- Simplify `basePath` to always use slug
- Remove custom domain comment

### 7. `app/pages/units/index.vue`

Same pattern as above.

### 8. `app/pages/settings/organization.vue`

Same pattern as above.

### 9. `app/pages/signup.vue`

- Remove `isCustomDomain` from the `useActiveHoa()` destructure
- Template line 68: `v-if="isCustomDomain && activeHoa?.logo"` → this whole block is dead code (never renders). Remove it.
- Template line 76: `v-else-if="isCustomDomain && activeHoa?.name"` → dead code. Remove it.
- Template line 83: simplify the ternary `isCustomDomain && activeHoa?.name ? activeHoa.name : 'home'` → just `'home'`

### 10. `app/pages/board.vue`

- Remove `isCustomDomain` from the `useActiveHoa()` destructure
- Check if `isCustomDomain` is used elsewhere in the file; if not, just clean the destructure

### 11. `app/pages/index.vue`

- Remove `isCustomDomain` from the `useActiveHoa()` destructure (line 322)
- Template line 6: `v-if="isMainDomain && !isCustomDomain"` → `v-if="isMainDomain"`

### 12. `app/middleware/admin.ts`

- Remove `isCustomDomain` from the `useActiveHoa()` destructure
- Line 32: `isCustomDomain.value || !!to.params.slug` → `!!to.params.slug`
- Clean up comment on line 31

### 13. `server/api/hoa/invite-member.post.ts`

- Line 175: Remove stale comment `// Use custom domain if available, otherwise fall back to main app URL` — replace with `// Build invitation URL`

## Files to Delete

### 14. `docs/SSL-FIX-605lincolnroad.md`

This file contains APEX domain SSL troubleshooting instructions that are no longer relevant to the core platform.

---

## Verification

After making changes, run:
```bash
# Ensure no remaining references to isCustomDomain
grep -r "isCustomDomain" --include="*.ts" --include="*.vue" .

# Should return zero results
```

Also ensure no TypeScript errors were introduced — the app should still build cleanly.
