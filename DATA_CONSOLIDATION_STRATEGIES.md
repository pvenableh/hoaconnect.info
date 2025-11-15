# Data Consolidation Strategies

## Current State: Data Duplication

### Duplicated Data Points

| Data | Location 1 | Location 2 | Location 3 | Synced? |
|------|-----------|-----------|-----------|---------|
| **Email** | `directus_users.email` (auth) | `hoa_members.email` | - | ❌ No |
| **First Name** | `directus_users.first_name` | `hoa_members.first_name` | - | ❌ No |
| **Last Name** | `directus_users.last_name` | `hoa_members.last_name` | - | ❌ No |
| **Display Name** | `profiles.display_name` | (computed from names) | - | ❌ No |
| **Google ID** | `directus_users.external_identifier` | `profiles.google_id` | - | ⚠️ Initial sync only |

---

## Strategy 1: Single Source of Truth (Recommended)

**Principle:** Each piece of data lives in ONE place, everything else references it.

### Email Consolidation

```typescript
// BEFORE (Duplicated)
directus_users.email = "john@example.com"
hoa_members.email = "john@example.com"  // ❌ Duplicate

// AFTER (Single Source)
directus_users.email = "john@example.com"  // ✅ Source of truth
hoa_members.user → directus_users.email   // ✅ Reference via JOIN
```

**Implementation:**
1. Remove `email` field from `hoa_members` schema
2. Update all queries to JOIN to `directus_users`
3. Update API responses to include email via relation

**Pros:**
- ✅ No sync issues - data is always accurate
- ✅ Single update point
- ✅ Reduced storage

**Cons:**
- ❌ Requires JOINs in every query (slight performance hit)
- ❌ More complex queries
- ❌ Breaking change for existing code

### Names Consolidation

```typescript
// BEFORE (Duplicated)
directus_users.first_name = "John"
directus_users.last_name = "Doe"
hoa_members.first_name = "John"     // ❌ Duplicate
hoa_members.last_name = "Doe"       // ❌ Duplicate
profiles.display_name = "John Doe"  // ⚠️ Could be different

// AFTER (Single Source with Exception)
directus_users.first_name = "John"     // ✅ Legal name
directus_users.last_name = "Doe"       // ✅ Legal name
profiles.display_name = "Johnny"       // ✅ Preferred name (optional override)
hoa_members.user → directus_users      // ✅ Reference
```

**Implementation:**
1. Remove `first_name`, `last_name` from `hoa_members`
2. Keep `profiles.display_name` as optional override
3. Use computed field logic:
   ```typescript
   const displayName = profile.display_name || `${user.first_name} ${user.last_name}`
   ```

**Pros:**
- ✅ Legal names always accurate
- ✅ Allows nickname/preferred name
- ✅ Clear semantic meaning

**Cons:**
- ❌ Requires JOINs
- ❌ Breaking changes

---

## Strategy 2: Keep Duplicates with Sync Hooks

**Principle:** Duplicate for performance, but keep in sync automatically.

### Implementation

```javascript
// extensions/hooks/sync-user-data/index.js
export default ({ filter, action }) => {
  // Sync email changes
  filter('users.update', async (input, meta, context) => {
    const { services, getSchema } = context
    const { ItemsService } = services

    if (input.email) {
      const schema = await getSchema()
      const memberService = new ItemsService('hoa_members', { schema })

      // Update all hoa_members for this user
      await memberService.updateMany(
        { filter: { user: { _eq: meta.keys[0] } } },
        { email: input.email }
      )
    }

    return input
  })

  // Sync name changes
  filter('users.update', async (input, meta, context) => {
    if (input.first_name || input.last_name) {
      // Fetch current user data to get complete names
      const userService = new ItemsService('directus_users', { schema })
      const user = await userService.readOne(meta.keys[0])

      const memberService = new ItemsService('hoa_members', { schema })
      await memberService.updateMany(
        { filter: { user: { _eq: meta.keys[0] } } },
        {
          first_name: input.first_name || user.first_name,
          last_name: input.last_name || user.last_name
        }
      )
    }

    return input
  })
}
```

**Pros:**
- ✅ No query changes needed
- ✅ Fast queries (no JOINs)
- ✅ Data stays in sync automatically
- ✅ Non-breaking change

**Cons:**
- ❌ Still duplicated storage
- ❌ Hook complexity
- ❌ Potential sync failures if hook errors

---

## Strategy 3: Hybrid Approach (Best Balance)

**Principle:** Remove duplication where it makes sense, keep it where performance matters.

### What to Do

| Field | Action | Reason |
|-------|--------|--------|
| **Email** | ✅ Keep in both + Sync hook | Frequently queried for member lists |
| **First/Last Name** | ❌ Remove from hoa_members | Use JOINs or computed fields |
| **Display Name** | ✅ Keep in profiles | Serves different purpose (preferred name) |
| **Google ID** | ✅ Keep in both | Rarely changes, used for different purposes |

### Email: Keep + Sync Hook

```javascript
// Sync hook (as shown in Strategy 2)
filter('users.update', syncEmailToMembers)
```

**Rationale:**
- Member lists are frequently displayed (reports, directories, messaging)
- Email is queried often for searching members
- JOIN overhead adds up with large member lists

### Names: Remove from hoa_members

**Option A: Use Directus Relations**
```typescript
// In hoa_members schema, define deep relation
{
  collection: 'hoa_members',
  fields: [
    {
      field: 'user',
      type: 'uuid',
      meta: {
        interface: 'select-dropdown-m2o',
        display: 'related-values',
        display_options: {
          template: '{{first_name}} {{last_name}}'
        }
      },
      schema: {
        foreign_key_table: 'directus_users'
      }
    }
  ]
}
```

**Option B: Database View (PostgreSQL)**
```sql
CREATE VIEW hoa_members_with_names AS
SELECT
  m.*,
  u.first_name,
  u.last_name,
  COALESCE(p.display_name, u.first_name || ' ' || u.last_name) as display_name
FROM hoa_members m
JOIN directus_users u ON m.user = u.id
LEFT JOIN profiles p ON p.user_id = u.id;
```

**Option C: API Transformation Layer**
```typescript
// composables/useMembers.ts
export const useMembers = () => {
  const members = await directus.items('hoa_members').readByQuery({
    fields: [
      '*',
      'user.first_name',
      'user.last_name',
      'user.profiles.display_name'
    ]
  })

  // Transform to flat structure for backward compatibility
  return members.map(m => ({
    ...m,
    first_name: m.user.first_name,
    last_name: m.user.last_name,
    display_name: m.user.profiles?.display_name || `${m.user.first_name} ${m.user.last_name}`
  }))
}
```

**Rationale:**
- Names don't change frequently (low sync risk)
- Simpler data model
- Clear source of truth

### Display Name: Keep in Profiles

```typescript
// profiles.display_name remains as optional override
// UI logic:
const getDisplayName = (user: User, profile?: Profile) => {
  return profile?.display_name || `${user.first_name} ${user.last_name}`
}
```

**Rationale:**
- Allows users to set preferred name different from legal name
- Common pattern (GitHub: "John Doe" vs "@johnny")
- Profiles is the right semantic location

---

## Strategy 4: Computed Fields (Future-Proof)

**Principle:** Use Directus computed fields (if available) or virtual fields.

```typescript
// In hoa_members collection definition
{
  fields: [
    {
      field: 'member_name',
      type: 'alias',
      meta: {
        interface: 'presentation-notice',
        special: ['alias', 'no-data'],
        options: {
          template: '{{user.first_name}} {{user.last_name}}'
        }
      }
    },
    {
      field: 'member_email',
      type: 'alias',
      meta: {
        interface: 'presentation-notice',
        special: ['alias', 'no-data'],
        options: {
          template: '{{user.email}}'
        }
      }
    }
  ]
}
```

**Pros:**
- ✅ No storage duplication
- ✅ Always in sync
- ✅ Declarative (no hook code)

**Cons:**
- ❌ Limited Directus support for computed fields
- ❌ May not work in all contexts (filters, sorts)

---

## Recommended Implementation Plan

### Phase 1: Immediate (Data Integrity Fix)
1. ✅ Add email sync hook (`directus_users.email` → `hoa_members.email`)
2. ✅ Add name sync hook (`directus_users.first/last_name` → `hoa_members.first/last_name`)
3. ✅ Test hooks thoroughly

### Phase 2: Short Term (Clean Up)
1. ❌ Remove `first_name`, `last_name` from `hoa_members` schema
2. ✅ Update all queries to use JOIN or relations
3. ✅ Update API responses to include names via transformation layer
4. ✅ Update frontend components to use nested user data
5. ✅ Migration script to verify data consistency before removal

### Phase 3: Long Term (Optimize)
1. ⚠️ Evaluate query performance with JOINs
2. ⚠️ Consider database views if performance issues
3. ⚠️ Consider caching layer for frequently accessed member lists

---

## Breaking Change Impact Analysis

### If We Remove Names from hoa_members

**Backend Changes:**
- ✅ `/server/api/hoa/members.get.ts` - Update query to include user relation
- ✅ `/server/api/hoa/invite-member.post.ts` - Remove first/last name from payload
- ✅ All TypeScript types in `/types/directus-schema.ts`

**Frontend Changes:**
- ✅ All components displaying member lists
- ✅ Member search/filter logic
- ✅ CSV exports of members

**Database:**
- ✅ Migration to drop columns (after data verification)
- ✅ Update any database triggers/functions

**Estimated Effort:** 4-6 hours

---

## Decision Matrix

| Strategy | Data Integrity | Performance | Complexity | Breaking Changes |
|----------|---------------|-------------|------------|------------------|
| **Strategy 1: Single Source** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⚠️ Yes |
| **Strategy 2: Sync Hooks** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ No |
| **Strategy 3: Hybrid** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⚠️ Partial |
| **Strategy 4: Computed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⚠️ Yes |

---

## My Recommendation

**Start with Strategy 2 (Sync Hooks) immediately, then migrate to Strategy 3 (Hybrid) over time:**

### Step 1: Add Sync Hooks (Today)
- Fixes immediate data integrity issues
- No breaking changes
- 1-2 hour implementation

### Step 2: Evaluate Performance (After 1 Month)
- Monitor query performance with current setup
- Check if member list queries are slow
- Decide if JOINs are acceptable

### Step 3: Remove Name Duplication (If Performance OK)
- Remove first/last name from hoa_members
- Keep email duplication (with sync) for performance
- Plan and execute migration

### Step 4: Keep Display Name Separate
- `profiles.display_name` stays as optional override
- Clear UX: "Legal Name" vs "Preferred Name"

---

## Code Examples

I can provide full implementation for any of these strategies. Would you like me to:

1. ✅ **Implement sync hooks** (recommended first step)
2. ⚠️ Create migration script to remove name duplication
3. ⚠️ Build transformation layer for API responses
4. ⚠️ Create database views for optimized queries

Let me know which approach fits your priorities!
