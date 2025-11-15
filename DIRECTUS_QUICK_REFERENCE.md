# Directus Migration - Quick Reference

## CRITICAL ISSUES (Application Breaking)

### Issue #1: useDirectusItems Return Type Mismatch
**Location:** `/composables/useDirectusItems.ts` + components/pages using it

**Problem:**
```typescript
// Composable returns:
return response as DirectusItem<T>[]

// But used as:
const { data: rolesData } = await fetchItems("directus_roles", {...})
const { data: unitsData } = await fetchItems("hoa_units", {...})
```

**Impact:** Multiple components broken: InviteMemberForm.vue, OrganizationSetupForm.vue, pages/members/index.vue, pages/dashboard.vue

---

### Issue #2: Missing `member` Property in useDirectusAuth
**Location:** `/composables/useDirectusAuth.ts` and `/composables/useDirectusItems.ts`

**Problem:**
```typescript
// useDirectusAuth exports: user, profile, isAuthenticated, loading, error
// But useDirectusItems expects:
const { member } = useDirectusAuth()  // undefined!
```

**Impact:** useDirectusItems will fail at runtime when trying to access `member.value?.organization`

---

### Issue #3: Undefined useDirectusServer() in API Endpoint
**Location:** `/server/api/directus/items/[collection]/[...id].ts` line 24

**Problem:**
```typescript
const directus = await useDirectusServer()  // This utility doesn't exist!
```

**Impact:** Dynamic CRUD endpoint completely broken

---

### Issue #4: Missing createItems Import
**Location:** `/server/api/directus/items/[collection]/[...id].ts` line 74

**Problem:**
```typescript
// createItems is used but never imported
const items = await directus.request(
  createItems(collection as any, body)  // ReferenceError
)
```

**Impact:** Can't create multiple items at once

---

### Issue #5: Missing HOA Types in Schema
**Location:** `/types/directus-schema.ts`

**Missing:**
- HoaOrganization
- HoaMember
- HoaInvitation
- HoaUnit
- HoaDocument

**Impact:** No type safety for HOA-specific operations

---

## Component Status

### Working
- LoginForm.vue - Uses simple login() call
- RegisterForm.vue - Uses simple register() call

### Broken
- InviteMemberForm.vue - Wrong destructuring pattern
- OrganizationSetupForm.vue - Wrong destructuring pattern
- pages/members/index.vue - Uses result.data.value
- pages/dashboard.vue - Uses result.data.value
- useSelectedOrg.ts - Relies on broken useDirectusItems pattern

---

## Endpoint Status

### Working
- POST /api/auth/login
- GET /api/directus/items/[collection]
- POST /api/directus/items/[collection]
- POST /api/hoa/setup-organization
- POST /api/hoa/invite-member

### Broken
- POST /api/auth/register - Mixed auth patterns
- PATCH/DELETE /api/directus/items/[collection]/[...id] - Undefined utility
- POST /api/directus/items/[collection] when body is array

### Missing
- GET /api/auth/me
- POST /api/auth/refresh
- Full implementation of accept-invitation, verify-invitation

---

## Utility Files

### Good
- `/server/utils/directus.ts` - Well-implemented typed client

### Duplicate/Should Remove
- `/server/utils/directus-typed.ts` - Nearly identical to directus.ts

---

## Quick Fix Priority

1. **TODAY**: Fix useDirectusItems composable to return plain array
2. **TODAY**: Add member property to useDirectusAuth
3. **TODAY**: Fix components/pages to not use .data.value
4. **TODAY**: Fix [collection]/[...id].ts endpoint
5. **TOMORROW**: Add missing HOA types to schema
6. **TOMORROW**: Implement missing auth endpoints
7. **THIS WEEK**: Consolidate Directus utilities

