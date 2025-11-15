# Profiles Collection Removal - Summary

## ✅ Completed Changes

### 1. TypeScript Types Updated

**File: `types/directus-schema.ts`**
- ❌ Removed `UserProfile` interface (70+ fields)
- ❌ Removed `UserSettings`, `UserInvitation`, `OAuthToken`, `PasswordReset`, `UserSession` interfaces
- ✅ Added `HoaPet` interface (member_id, name, type, breed, weight, color, image)
- ✅ Added `HoaVehicle` interface (member_id, make, model, year, color, license_plate, image)
- ✅ Updated `DirectusSchema` to remove `profiles` and add `hoa_pets`, `hoa_vehicles`

**File: `types/directus.ts`**
- ❌ Removed `UserProfile` interface (60+ fields)
- ❌ Removed `UserWithProfile` interface
- ✅ Added `HOAPet` interface
- ✅ Added `HOAVehicle` interface
- ✅ Updated `SessionUser` to include `avatar` and `member` instead of `profile`
- ✅ Updated `DirectusSchema` to remove `profiles` and add `hoa_pets`, `hoa_vehicles`

### 2. Hook Updated

**File: `extensions/hooks/hoa-auth/index.js`**
- ❌ Removed profile creation logic (lines 98-132)
- ❌ Removed `profilesService` instantiation
- ❌ Removed `existingProfiles` query
- ❌ Removed profile update for OAuth users
- ✅ Added comments explaining new data model
- ✅ Updated header documentation

**Lines removed:** ~35 lines of profile creation code

---

## 📊 New Data Model

### Where Data Lives Now

```
directus_users (System Collection)
├── Authentication: email, password
├── Basic Info: first_name, last_name
├── Avatar: avatar (native field!)
├── Localization: language (native field!)
├── OAuth: provider, external_identifier (native fields!)
└── Role: role

hoa_members (Organization Membership)
├── User Reference: user (FK to directus_users)
├── Organization: organization (FK to hoa_organizations)
├── Role: role (FK to directus_roles)
├── Contact: first_name, last_name, email, phone
├── Member Info: member_type, unit
├── Pets: pets (O2M to hoa_pets)
└── Vehicles: vehicles (O2M to hoa_vehicles)

hoa_pets (Pet Registrations)
├── Member Reference: member_id (FK to hoa_members)
├── Pet Info: name, type, breed, weight, color
└── Image: image (FK to directus_files)

hoa_vehicles (Vehicle Registrations)
├── Member Reference: member_id (FK to hoa_members)
├── Vehicle Info: make, model, year, color, license_plate
└── Image: image (FK to directus_files)
```

---

## 🔄 What Happens Now During OAuth Login

### Before (With Profiles):
```javascript
1. User logs in with Google
2. directus_users created (email, first_name, last_name, provider="google")
3. Hook creates profiles record (display_name, google_id, avatar_url)
4. User needs invitation to create hoa_members record
```

### After (Without Profiles):
```javascript
1. User logs in with Google
2. directus_users created (email, first_name, last_name, provider="google", external_identifier)
3. No profile creation (data already in directus_users!)
4. User needs invitation to create hoa_members record (same as before)
```

**Benefit:** Simpler, less code, no data duplication!

---

## 🚧 Next Steps (To Complete Removal)

### 1. Drop the Profiles Collection (Database)

**IMPORTANT:** Only do this after backing up any important data!

```sql
-- Backup first (if any data you want to keep)
CREATE TABLE profiles_backup AS SELECT * FROM profiles;

-- Check what data exists
SELECT COUNT(*) FROM profiles;
SELECT * FROM profiles LIMIT 5;

-- Drop the collection
DROP TABLE profiles CASCADE;
```

### 2. Remove Profile-Related Code Files

Files that likely need updates or removal:

```bash
# API endpoints
server/api/profile/update.patch.ts     # Remove entire file?

# Composables
composables/useProfile.ts              # Remove entire file?

# Auth-related
composables/useDirectusAuth.ts         # Remove profile references
server/api/auth/me.get.ts             # Remove profile includes
server/api/auth/register.post.ts      # Remove profile creation

# Schemas
schemas/auth.ts                        # Remove profile validation
```

### 3. Update Components

Search for components that display profile data:
```bash
# Find components using profile
grep -r "profile\." components/
grep -r "useProfile" components/
```

Replace with:
```typescript
// OLD
const { profile } = useProfile()
const avatarUrl = profile.value?.avatar_url
const displayName = profile.value?.display_name

// NEW
const { user } = useDirectusAuth()
const avatarUrl = user.value?.avatar  // Native directus_users field!
const displayName = `${user.value?.first_name} ${user.value?.last_name}`
```

### 4. Update Database Queries

Find any queries that include profiles:
```bash
grep -r "profiles" server/api/
grep -r "profiles" composables/
```

Remove profile includes:
```typescript
// OLD
const user = await directus.users.readOne(userId, {
  fields: ['*', 'profile.*']
})

// NEW
const user = await directus.users.readOne(userId, {
  fields: ['*', 'avatar', 'language']
})
```

### 5. Test OAuth Flow

After removing all profile references:

1. ✅ Test Google OAuth login (should work without profile creation)
2. ✅ Test regular email/password login
3. ✅ Test member invitation flow
4. ✅ Verify avatar displays correctly (from directus_users.avatar)
5. ✅ Verify names display correctly (from directus_users.first_name/last_name)

---

## 📁 Files Modified (Summary)

| File | Lines Removed | Lines Added | Status |
|------|--------------|-------------|--------|
| `types/directus-schema.ts` | ~200 | ~30 | ✅ Updated |
| `types/directus.ts` | ~90 | ~40 | ✅ Updated |
| `extensions/hooks/hoa-auth/index.js` | ~35 | ~15 | ✅ Updated |
| **Total** | **~325 lines removed** | **~85 lines added** | **Net: -240 lines!** |

---

## 🎯 Benefits of This Change

1. ✅ **Simpler Data Model**
   - 2 main collections instead of 3
   - Clear separation: directus_users (global) vs hoa_members (org-specific)

2. ✅ **Less Code to Maintain**
   - No profile CRUD operations
   - No profile sync logic
   - No profile validation

3. ✅ **No Data Duplication**
   - Avatar stored once (directus_users.avatar)
   - Language stored once (directus_users.language)
   - OAuth data stored once (directus_users.provider/external_identifier)

4. ✅ **Better Performance**
   - Fewer JOINs needed
   - Less data to query
   - Smaller database

5. ✅ **Clearer Semantics**
   - User data = directus_users
   - Member data = hoa_members
   - Pets/Vehicles = org-specific O2M collections

---

## ⚠️ Migration Checklist

Before you can fully remove profiles from the database:

- [ ] Audit profiles table for any important data
- [ ] Back up profiles data (if any exists)
- [ ] Remove/update `server/api/profile/update.patch.ts`
- [ ] Remove/update `composables/useProfile.ts`
- [ ] Update `composables/useDirectusAuth.ts` to remove profile references
- [ ] Update `server/api/auth/me.get.ts` to remove profile includes
- [ ] Update `server/api/auth/register.post.ts` to remove profile creation
- [ ] Update `schemas/auth.ts` to remove profile validation
- [ ] Search and update all components using `profile.*`
- [ ] Search and update all API calls including `profiles` field
- [ ] Test OAuth login flow thoroughly
- [ ] Test regular login flow
- [ ] Test member invitation flow
- [ ] Drop profiles table from database
- [ ] Remove profiles from Directus Data Model in admin panel

---

## 🤔 Questions to Consider

1. **Avatar Migration:** Do any existing profiles have avatar_url that needs to be migrated to directus_users.avatar?

2. **Display Names:** Do any profiles have display_name different from first_name + last_name that should be preserved?

3. **Phone Numbers:** Are phone numbers in profiles that need to be migrated to hoa_members.phone?

4. **Timezone Data:** Do you need timezone stored per-user or per-org?

If you answer "yes" to any of these, we can create a migration script before dropping the table.

---

## 📝 Summary

**What was removed:**
- ❌ profiles collection type definitions (200+ lines)
- ❌ Profile creation logic in hooks (35 lines)
- ❌ UserProfile, UserWithProfile interfaces
- ❌ Other unused interfaces (UserSettings, OAuthToken, etc.)

**What was added:**
- ✅ HoaPet and HoaVehicle interfaces
- ✅ Comments explaining new data model
- ✅ SessionUser.avatar and SessionUser.member fields

**Result:**
- 🎉 **240 fewer lines of code**
- 🎉 **Simpler architecture**
- 🎉 **No data duplication**
- 🎉 **Ready to get this working!**

---

**Next:** Complete the migration checklist above, then drop the profiles collection from your database!
