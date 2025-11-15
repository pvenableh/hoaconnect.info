# Directus Migration Comprehensive Overview
**Project:** 605-Lincoln  
**Analysis Date:** 2025-11-15

---

## OVERVIEW

The codebase is **undergoing migration from directus-nuxt-layer to direct Directus SDK usage**. The migration is **partially complete (40% done)** with **5 critical issues** blocking full functionality.

### Files Generated
1. **DIRECTUS_MIGRATION_ANALYSIS.md** - Detailed 300+ line technical analysis
2. **DIRECTUS_QUICK_REFERENCE.md** - Quick issue summary and priority fixes
3. **DIRECTUS_FILE_INVENTORY.txt** - Complete file listing and status
4. **This summary document**

---

## CRITICAL ISSUES SUMMARY

### Issue #1: Return Type Mismatch in useDirectusItems
**Severity:** CRITICAL - Breaks 4+ files  
**File:** `/home/user/605-Lincoln/composables/useDirectusItems.ts` (lines 50-60)

Composable returns raw array but components expect `.data.value` wrapper:
```typescript
// Returns: DirectusItem<T>[]
// Expected by: InviteMemberForm.vue, OrganizationSetupForm.vue, 
//             pages/members/index.vue, pages/dashboard.vue
```

**Affected Components:**
- `/home/user/605-Lincoln/components/InviteMemberForm.vue` (lines 39, 51)
- `/home/user/605-Lincoln/components/OrganizationSetupForm.vue` (lines 142, 150)
- `/home/user/605-Lincoln/pages/members/index.vue` (lines 23-51, 59-85)
- `/home/user/605-Lincoln/pages/dashboard.vue` (lines 19-28, 37-46, 53-62)

---

### Issue #2: Missing member Property Export
**Severity:** CRITICAL - Runtime error  
**Files:** 
- `/home/user/605-Lincoln/composables/useDirectusAuth.ts` (doesn't export `member`)
- `/home/user/605-Lincoln/composables/useDirectusItems.ts` (line 16, tries to import `member`)

useDirectusAuth returns: `user`, `profile`, `isAuthenticated`, `loading`, `error`  
useDirectusItems expects: `member` (which doesn't exist)

**Impact:** Line 25, 99 in useDirectusItems will fail:
```typescript
if (!member.value?.organization) { ... }  // member is undefined
```

---

### Issue #3: Undefined useDirectusServer() Function
**Severity:** CRITICAL - Endpoint broken  
**File:** `/home/user/605-Lincoln/server/api/directus/items/[collection]/[...id].ts` (line 24)

```typescript
const directus = await useDirectusServer()  // This doesn't exist!
```

Should be using `getUserDirectus(event)` from `/server/utils/directus.ts`

---

### Issue #4: Missing Import for createItems
**Severity:** CRITICAL - ReferenceError  
**File:** `/home/user/605-Lincoln/server/api/directus/items/[collection]/[...id].ts` (line 74)

```typescript
createItems(collection as any, body)  // Not imported, will throw ReferenceError
```

Should import: `import { createItems } from '@directus/sdk'`

---

### Issue #5: Missing HOA Collection Types
**Severity:** HIGH - No type safety  
**File:** `/home/user/605-Lincoln/types/directus-schema.ts`

Missing critical types:
- HoaOrganization (used in ~10 files)
- HoaMember (used in ~15 files)
- HoaInvitation (used in ~5 files)
- HoaUnit (used in ~4 files)
- HoaDocument (used in ~3 files)

---

## IMPLEMENTATION STATUS BY CATEGORY

### Composables
| File | Status | Issues |
|------|--------|--------|
| useDirectusAuth.ts | PARTIAL | Missing member export |
| useDirectusItems.ts | BROKEN | Return type mismatch + missing member |
| useSelectedOrg.ts | WORKING* | *but depends on broken useDirectusItems |

**Location:** `/home/user/605-Lincoln/composables/`

---

### Server-Side Utilities
| File | Status | Notes |
|------|--------|-------|
| directus.ts | EXCELLENT | Fully typed, all functions working |
| directus-typed.ts | LEGACY | Duplicate of directus.ts, should remove |

**Location:** `/home/user/605-Lincoln/server/utils/`

---

### Authentication Endpoints
| File | Status | Notes |
|------|--------|-------|
| login.post.ts | WORKING | Uses SDK correctly |
| register.post.ts | BROKEN | Mixed auth patterns |
| logout.post.ts | ASSUMED OK | Not examined |
| session.get.ts | ASSUMED OK | Not examined |
| oauth/google/callback.get.ts | NOT EXAMINED | - |
| **MISSING:** me.get.ts | - | Referenced but not found |
| **MISSING:** refresh.post.ts | - | Referenced but not found |

**Location:** `/home/user/605-Lincoln/server/api/auth/`

---

### Directus CRUD Proxy Endpoints
| File | Status | Issues |
|------|--------|--------|
| items/[collection].get.ts | WORKING | Properly implemented |
| items/[collection].post.ts | WORKING | Properly implemented |
| items/[collection]/[...id].ts | BROKEN | Undefined utility, missing imports |

**Location:** `/home/user/605-Lincoln/server/api/directus/`

---

### HOA Organization Endpoints
| File | Status | Notes |
|------|--------|-------|
| setup-organization.post.ts | WORKING | Uses typed Directus client |
| invite-member.post.ts | WORKING | Uses typed Directus client |
| accept-invitation.post.ts | NOT EXAMINED | - |
| verify-invitation.post.ts | PARTIAL | - |
| check-slug.get.ts | NOT EXAMINED | - |
| by-slug.get.ts | NOT EXAMINED | - |
| by-domain.get.ts | NOT EXAMINED | - |

**Location:** `/home/user/605-Lincoln/server/api/hoa/`

---

### Components
| File | Status | Issue |
|------|--------|-------|
| Auth/LoginForm.vue | WORKING | Uses simple login() |
| Auth/RegisterForm.vue | WORKING | Uses simple register() |
| InviteMemberForm.vue | BROKEN | Wrong data destructuring |
| OrganizationSetupForm.vue | BROKEN | Wrong data destructuring |

**Location:** `/home/user/605-Lincoln/components/`

---

### Pages
| File | Status | Issue |
|------|--------|-------|
| members/index.vue | BROKEN | Uses result.data.value |
| dashboard.vue | BROKEN | Uses result.data.value |
| units/index.vue | UNKNOWN | Not examined |
| documents/index.vue | UNKNOWN | Not examined |

**Location:** `/home/user/605-Lincoln/pages/`

---

## TYPE DEFINITIONS STATUS

**File:** `/home/user/605-Lincoln/types/directus-schema.ts`

### Defined Types (GOOD)
- DirectusUser ✓
- DirectusRole ✓
- DirectusFile ✓
- UserProfile ✓
- UserSettings ✓
- UserInvitation ✓
- ActivityLog ✓
- OAuthToken ✓
- PasswordReset ✓
- UserSession ✓

### Missing Types (BAD)
- HoaOrganization ✗
- HoaMember ✗
- HoaInvitation ✗
- HoaUnit ✗
- HoaDocument ✗

---

## DIRECTUS SDK CONFIGURATION

**Location:** `/home/user/605-Lincoln/nuxt.config.ts`

Configuration Status: ✓ PROPERLY SET UP
```typescript
runtimeConfig: {
  directus: {
    url: process.env.DIRECTUS_URL
    staticToken: process.env.DIRECTUS_STATIC_TOKEN
  }
  public: {
    directus: {
      url: process.env.DIRECTUS_URL
      websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL
    }
  }
}
```

---

## USAGE PATTERNS ANALYSIS

### Good Patterns (Working)
```typescript
// Direct auth method calls
const { login } = useDirectusAuth()
await login(email, password)

// Server-side typed operations
const client = getTypedDirectus()
const items = await client.request(readItems('collection', {...}))
```

### Bad Patterns (Broken)
```typescript
// Wrong destructuring
const { data: rolesData } = await fetchItems("directus_roles", {...})
if (rolesData.value) { ... }

// Should be
const rolesData = await fetchItems("directus_roles", {...})
roles.value = rolesData
```

---

## QUICK FIX CHECKLIST

### TODAY (Critical Blocking Issues)
- [ ] Fix useDirectusItems.ts return type to plain array
- [ ] Add `member` property to useDirectusAuth exports
- [ ] Fix InviteMemberForm.vue destructuring
- [ ] Fix OrganizationSetupForm.vue destructuring
- [ ] Fix pages/members/index.vue destructuring
- [ ] Fix pages/dashboard.vue destructuring
- [ ] Fix [collection]/[...id].ts endpoint (replace useDirectusServer with getUserDirectus)
- [ ] Add missing createItems import to [collection]/[...id].ts

### This Week (Type/Configuration Issues)
- [ ] Add HoaOrganization type to directus-schema.ts
- [ ] Add HoaMember type to directus-schema.ts
- [ ] Add HoaInvitation type to directus-schema.ts
- [ ] Add HoaUnit type to directus-schema.ts
- [ ] Add HoaDocument type to directus-schema.ts
- [ ] Implement /api/auth/me.get.ts
- [ ] Implement /api/auth/refresh.post.ts
- [ ] Fix /api/auth/register.post.ts auth patterns

### Next Week (Code Quality)
- [ ] Remove duplicate directus-typed.ts file
- [ ] Consolidate Directus utilities
- [ ] Add proper error handling consistency
- [ ] Add token refresh mechanism on client

---

## FILES TO REVIEW

### Essential (Breaking Issues)
1. `/home/user/605-Lincoln/composables/useDirectusItems.ts`
2. `/home/user/605-Lincoln/composables/useDirectusAuth.ts`
3. `/home/user/605-Lincoln/components/InviteMemberForm.vue`
4. `/home/user/605-Lincoln/components/OrganizationSetupForm.vue`
5. `/home/user/605-Lincoln/pages/members/index.vue`
6. `/home/user/605-Lincoln/pages/dashboard.vue`
7. `/home/user/605-Lincoln/server/api/directus/items/[collection]/[...id].ts`

### Important (Type Safety)
8. `/home/user/605-Lincoln/types/directus-schema.ts`
9. `/home/user/605-Lincoln/server/utils/directus.ts`

### Reference (Working Examples)
10. `/home/user/605-Lincoln/server/api/hoa/setup-organization.post.ts`
11. `/home/user/605-Lincoln/server/api/hoa/invite-member.post.ts`
12. `/home/user/605-Lincoln/components/Auth/LoginForm.vue`

---

## ANALYSIS DOCUMENTS

All analysis has been saved to repository root:

1. **DIRECTUS_MIGRATION_ANALYSIS.md** (300+ lines)
   - Detailed technical analysis of all components
   - Section-by-section breakdown with code examples
   - Complete summary table of all components

2. **DIRECTUS_QUICK_REFERENCE.md** (Quick lookup)
   - Critical issues highlighted
   - Component/endpoint status
   - Priority fix checklist

3. **DIRECTUS_FILE_INVENTORY.txt** (Directory)
   - Complete file listing with status
   - Categorized by type (composables, endpoints, etc.)
   - Total file count: 35+ examined

---

## NEXT STEPS

1. Read DIRECTUS_MIGRATION_ANALYSIS.md for detailed technical context
2. Use DIRECTUS_QUICK_REFERENCE.md for daily reference
3. Focus on fixing the 5 critical issues first (see checklist above)
4. Implement missing HOA types
5. Add missing auth endpoints
6. Run tests to verify fixes

---

**Analysis completed:** 2025-11-15  
**Codebase state:** Partially migrated, multiple blockers  
**Recommendation:** Fix critical issues before further development
