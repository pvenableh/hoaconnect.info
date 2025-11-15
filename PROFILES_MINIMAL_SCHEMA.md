# Minimal Profiles Schema for HOA Management

## Current vs Recommended

Your README.md proposes a **comprehensive social network-style profile** with 40+ fields. For an HOA management system, most of these are **unnecessary complexity**.

---

## ❌ What You DON'T Need

### From Your Proposed Schema:

| Field Category | Fields | Why Not Needed |
|----------------|--------|----------------|
| **Social** | `bio`, `cover_image`, `github_id`, `github_username`, `twitter_handle`, `linkedin_id`, `linkedin_url` | ❌ HOA is not a social network |
| **Extended Contact** | `phone_verified`, `secondary_email`, `secondary_email_verified` | ❌ Over-engineering for HOA |
| **Address Fields** | `address_line1`, `address_line2`, `city`, `state_province`, `postal_code`, `country` | ❌ Already in `hoa_members` → `hoa_units` relation |
| **Professional** | `company`, `job_title`, `website`, `skills` | ❌ Not relevant to HOA operations |
| **Marketing** | `newsletter_subscribed`, `marketing_emails`, `product_updates` | ❌ Use `directus_users` preferences or separate notifications table |
| **Onboarding** | `onboarding_completed`, `onboarding_step`, `profile_completion_percentage` | ❌ Can be in `directus_users` or separate onboarding state |
| **Activity** | `last_activity` | ❌ Use `directus_activity` (native tracking) |

---

## ✅ Minimal Schema (Recommended)

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,

  -- Display (Optional nickname/preferred name)
  display_name varchar(255),
  avatar_url varchar(500),

  -- OAuth Tracking (for Google login)
  google_id varchar(255),

  -- Contact (HOA-specific)
  phone varchar(50),

  -- Localization
  timezone varchar(100) DEFAULT 'America/New_York',
  locale varchar(10) DEFAULT 'en-US',

  -- Flexibility
  metadata jsonb,

  -- System
  status varchar(20) DEFAULT 'active',
  date_created timestamp DEFAULT CURRENT_TIMESTAMP,
  date_updated timestamp,

  FOREIGN KEY (user_id) REFERENCES directus_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_profiles_user ON profiles(user_id);
CREATE INDEX idx_profiles_google ON profiles(google_id);
CREATE INDEX idx_profiles_status ON profiles(status);
```

**Total: 11 fields** (vs 40+ in your README)

---

## 📊 Field-by-Field Justification

| Field | Keep? | Reason |
|-------|-------|--------|
| `user_id` | ✅ | Required FK to directus_users |
| `display_name` | ✅ | Allows "Johnny" instead of "John Smith" |
| `avatar_url` | ✅ | For community directory/profile photos |
| `google_id` | ✅ | Track OAuth connections (already using Google) |
| `phone` | ✅ | Important for HOA emergency contacts |
| `timezone` | ✅ | For accurate meeting/notification times |
| `locale` | ✅ | For i18n support |
| `metadata` | ✅ | Future flexibility (JSONB) |
| `status` | ✅ | Track active/inactive profiles |
| `date_created` | ✅ | Audit trail |
| `date_updated` | ✅ | Audit trail |

---

## 🏘️ Data Already Covered Elsewhere

### Address Data
```
hoa_members → hoa_units → property address
```
No need to duplicate in profiles!

### Legal Name
```
directus_users.first_name + directus_users.last_name
```
Already in directus_users!

### Email
```
directus_users.email
```
Single source of truth!

### Role & Permissions
```
directus_users.role
hoa_members.role
```
Already tracked!

### Activity Tracking
```
directus_activity (automatic)
```
Native Directus feature!

---

## 🤔 What About These Fields?

### Phone Verification?
**Not needed for MVP.** If required later, add a `phone_verified` boolean. Most HOAs don't verify phones programmatically.

### Multiple Phone Numbers?
**Use `metadata` JSONB:**
```json
{
  "phones": {
    "mobile": "+1-555-0100",
    "home": "+1-555-0101",
    "work": "+1-555-0102"
  }
}
```

### Emergency Contact?
**Use `metadata` JSONB:**
```json
{
  "emergency_contact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "phone": "+1-555-0103"
  }
}
```

### Notification Preferences?
**Option 1:** Store in `directus_users.preferences` (JSONB field exists natively)
```json
{
  "notifications": {
    "email": true,
    "sms": false,
    "push": true
  }
}
```

**Option 2:** Create separate `notification_preferences` table if complex

### Profile Photo?
**Use `avatar_url` for now.** If you need Directus file management:
```sql
-- Add this field instead:
avatar uuid REFERENCES directus_files(id)
```

---

## 🔄 Migration from Your Current Schema

If you already created the full schema from your types file:

```sql
-- Drop unnecessary columns
ALTER TABLE profiles
  DROP COLUMN IF EXISTS bio,
  DROP COLUMN IF EXISTS cover_image,
  DROP COLUMN IF EXISTS phone_verified,
  DROP COLUMN IF EXISTS secondary_email,
  DROP COLUMN IF EXISTS secondary_email_verified,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state_province,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS github_id,
  DROP COLUMN IF EXISTS github_username,
  DROP COLUMN IF EXISTS linkedin_id,
  DROP COLUMN IF EXISTS linkedin_url,
  DROP COLUMN IF EXISTS twitter_handle,
  DROP COLUMN IF EXISTS company,
  DROP COLUMN IF EXISTS job_title,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS skills,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS newsletter_subscribed,
  DROP COLUMN IF EXISTS notifications_enabled,
  DROP COLUMN IF EXISTS notification_preferences,
  DROP COLUMN IF EXISTS last_activity,
  DROP COLUMN IF EXISTS onboarding_completed,
  DROP COLUMN IF EXISTS profile_completed_percentage;

-- Keep only these columns:
-- id, user_id, display_name, avatar_url, google_id, phone,
-- timezone, locale, metadata, status, date_created, date_updated
```

---

## 📝 Updated TypeScript Interface

```typescript
/**
 * User Profile - Minimal HOA-specific extension
 */
export interface Profile {
  id: ID
  user_id: ID | DirectusUser

  // Display
  display_name?: string | null
  avatar_url?: string | null

  // OAuth
  google_id?: string | null

  // Contact
  phone?: string | null

  // Localization
  timezone?: string | null
  locale?: string | null

  // Flexibility
  metadata?: Record<string, any> | null

  // System
  status: 'active' | 'inactive' | 'suspended'
  date_created?: string
  date_updated?: string | null
}
```

---

## 🎯 When to Add More Fields

Only add fields when you have a **concrete use case**:

### Examples of Valid Additions:

1. **Pet Information (HOA pet registry)**
   ```sql
   ALTER TABLE profiles ADD COLUMN pets jsonb;
   -- Store: [{ type: "dog", breed: "Labrador", name: "Max", weight: 65 }]
   ```

2. **Vehicle Information (HOA parking)**
   ```sql
   ALTER TABLE profiles ADD COLUMN vehicles jsonb;
   -- Store: [{ make: "Toyota", model: "Camry", year: 2020, license: "ABC123" }]
   ```

3. **Accessibility Needs**
   ```sql
   ALTER TABLE profiles ADD COLUMN accessibility_needs jsonb;
   -- Store: { mobility: true, hearing: false, visual: false }
   ```

But even these could go in `hoa_members` since they're org-specific!

---

## 🏆 Recommended Approach

### Start Minimal
```
profiles: 11 fields (as shown above)
```

### Use JSONB for Flexibility
```json
{
  "emergency_contact": {...},
  "pets": [...],
  "vehicles": [...],
  "preferences": {...}
}
```

### Promote to Columns When Needed
When you query a JSONB field frequently (e.g., timezone), promote to column:
```sql
-- Already done! timezone is a column
SELECT * FROM profiles WHERE timezone = 'America/Los_Angeles';
```

---

## ✅ Summary

Your README proposes a **generic social profile** suitable for:
- LinkedIn-style networking apps
- Social media platforms
- Job boards
- Content creator platforms

But you're building an **HOA management system**, which needs:
- ✅ **11 fields** instead of 40+
- ✅ **JSONB flexibility** for edge cases
- ✅ **Focus on HOA-specific data** (units, roles, organizations)
- ✅ **Leverage existing data** (addresses in units, names in directus_users)

**Recommendation:** Simplify your profiles table to the minimal schema above. Add fields only when you have concrete requirements.

---

## 🔍 Where Data Should Live

| Data Type | Store In | Why |
|-----------|----------|-----|
| Legal Name | `directus_users.first_name/last_name` | Authentication identity |
| Email | `directus_users.email` | Authentication + primary contact |
| Password | `directus_users.password` | Security |
| OAuth Data | `directus_users.provider/external_identifier` | Native Directus OAuth |
| Role | `directus_users.role` | System-wide permissions |
| Preferred Name | `profiles.display_name` | User preference (optional) |
| Avatar | `profiles.avatar_url` | User personalization |
| Phone | `profiles.phone` | HOA contact (if user-level) |
| Timezone | `profiles.timezone` | User preference |
| Property Address | `hoa_units.street_address/city/state/zip` | Property data |
| Unit Assignment | `hoa_members.unit` (FK) | Org membership |
| Organization Role | `hoa_members.role` | Org-specific permissions |
| Emergency Contact | `profiles.metadata.emergency_contact` | Flexible JSONB |
| Pets/Vehicles | `hoa_members.metadata` or separate tables | Org-specific data |

---

**Next Step:** Would you like me to:
1. ✅ Update your TypeScript types to use minimal schema
2. ✅ Create migration script to drop unnecessary columns
3. ✅ Update README.md with HOA-focused example
4. ✅ Review which fields should move to `hoa_members` instead
