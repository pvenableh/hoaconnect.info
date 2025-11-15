// types/directus.ts
import type { ID } from '@directus/sdk'

// ============================================
// DIRECTUS NATIVE TYPES
// ============================================

export interface DirectusUser {
  id: ID
  first_name?: string | null
  last_name?: string | null
  email: string
  password?: string
  location?: string | null
  title?: string | null
  description?: string | null
  tags?: string[] | null
  avatar?: ID | null
  language?: string | null
  theme?: 'light' | 'dark' | 'auto'
  tfa_secret?: string | null
  status: 'active' | 'suspended' | 'archived'
  role?: ID | DirectusRole
  token?: string | null
  last_access?: string | null
  last_page?: string | null
  provider?: 'default' | 'github' | 'google' | string
  external_identifier?: string | null
  auth_data?: any | null
  email_notifications?: boolean
  date_created?: string
  date_updated?: string | null
}

export interface DirectusRole {
  id: ID
  name: string
  icon?: string
  description?: string | null
  ip_access?: string[] | null
  enforce_tfa: boolean
  admin_access: boolean
  app_access: boolean
  users?: DirectusUser[]
}

export interface DirectusActivity {
  id: ID
  action: 'create' | 'update' | 'delete' | 'login' | 'comment' | 'upload'
  user?: ID | DirectusUser
  timestamp: string
  ip?: string
  user_agent?: string
  collection?: string | null
  item?: string | null
  comment?: string | null
}

// ============================================
// CUSTOM COLLECTIONS
// ============================================

export interface UserProfile {
  id: ID
  user_id: ID | DirectusUser
  
  // Display Information
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  
  // Extended Contact
  phone?: string | null
  phone_verified?: boolean
  secondary_email?: string | null
  
  // Address
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state_province?: string | null
  postal_code?: string | null
  country?: string | null
  
  // Professional
  company?: string | null
  job_title?: string | null
  website?: string | null
  linkedin_url?: string | null
  
  // HOA Specific
  organization_id?: ID | HOAOrganization | null
  is_board_member?: boolean
  board_position?: string | null
  emergency_contact?: string | null
  emergency_phone?: string | null
  
  // Preferences
  newsletter_subscribed?: boolean
  marketing_emails?: boolean
  product_updates?: boolean
  timezone?: string | null
  locale?: string | null
  
  // Application Metadata
  onboarding_completed?: boolean
  onboarding_step?: number | null
  profile_completion?: number | null
  
  // Custom data
  metadata?: Record<string, any> | null
  
  // System
  status?: 'active' | 'inactive' | 'suspended'
  date_created?: string
  date_updated?: string | null
}

export interface HOAOrganization {
  id: ID
  name: string
  slug: string
  street_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  phone?: string | null
  email?: string | null
  custom_domain?: string | null
  domain_verified?: boolean
  member_count?: number | null
  subscription?: ID | null
  settings?: any | null
  status?: string
  date_created?: string
  date_updated?: string | null
}

export interface HOAMember {
  id: ID
  user: ID | DirectusUser
  organization: ID | HOAOrganization
  role?: ID | DirectusRole
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  member_type?: 'owner' | 'tenant' | 'guest'
  status?: string
  date_created?: string
  date_updated?: string | null
  units?: HOAMemberUnit[]
}

export interface HOAMemberUnit {
  id: ID
  member_id: ID | HOAMember
  unit_id: ID | HOAUnit
  is_primary_unit?: boolean
  start_date?: string | null
  end_date?: string | null
  ownership_percentage?: number | null
}

export interface HOAUnit {
  id: ID
  organization: ID | HOAOrganization
  unit_number: string
  status?: string
  date_created?: string
  date_updated?: string | null
}

// ============================================
// AUTHENTICATION TYPES
// ============================================

export interface AuthResponse {
  access_token: string
  refresh_token: string
  expires: number
  expires_at: number
}

export interface UserWithProfile extends DirectusUser {
  profile?: UserProfile | null
}

export interface SessionUser {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  role?: DirectusRole | null
  profile?: UserProfile | null
  organization?: HOAOrganization | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
}

// ============================================
// DIRECTUS SCHEMA TYPE
// ============================================

export interface DirectusSchema {
  // Native Directus Collections
  directus_users: DirectusUser[]
  directus_roles: DirectusRole[]
  directus_activity: DirectusActivity[]
  
  // Custom Collections
  profiles: UserProfile[]
  hoa_organizations: HOAOrganization[]
  hoa_members: HOAMember[]
  hoa_units: HOAUnit[]
  hoa_member_units: HOAMemberUnit[]
}
