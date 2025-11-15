// Type alias for Directus ID
export type ID = string | number

// System Collections
export interface DirectusUser {
  id: ID
  first_name?: string
  last_name?: string
  email: string
  password?: string
  location?: string | null
  title?: string | null
  description?: string | null
  tags?: string[] | null
  avatar?: string | null
  language?: string | null
  theme?: 'light' | 'dark' | 'auto'
  tfa_secret?: string | null
  status: 'active' | 'suspended' | 'archived'
  role?: ID | DirectusRole
  token?: string | null
  last_access?: string | null
  last_page?: string | null
  provider?: string
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
  date_created?: string
  date_updated?: string | null
}

export interface DirectusFile {
  id: ID
  storage: string
  filename_disk?: string | null
  filename_download: string
  title?: string | null
  type?: string | null
  folder?: ID | null
  uploaded_by?: ID | DirectusUser
  uploaded_on: string
  modified_by?: ID | DirectusUser | null
  modified_on: string
  charset?: string | null
  filesize?: string | null
  width?: number | null
  height?: number | null
  duration?: number | null
  embed?: string | null
  description?: string | null
  location?: string | null
  tags?: string[] | null
  metadata?: any | null
}

// Application Collections

/**
 * User Profile - Extended user information
 * This collection stores additional user data beyond authentication
 */
export interface UserProfile {
  id: ID
  user_id: ID | DirectusUser // One-to-one with directus_users
  
  // Basic Information
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  cover_image?: ID | DirectusFile | null
  
  // Contact Information
  phone?: string | null
  phone_verified?: boolean
  secondary_email?: string | null
  secondary_email_verified?: boolean
  
  // Address
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state_province?: string | null
  postal_code?: string | null
  country?: string | null
  
  // Social Profiles (OAuth data)
  github_id?: string | null
  github_username?: string | null
  google_id?: string | null
  google_profile?: any | null
  linkedin_id?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  
  // Preferences
  timezone?: string | null
  locale?: string | null
  currency?: string | null
  newsletter_subscribed?: boolean
  notifications_enabled?: boolean
  notification_preferences?: {
    email?: boolean
    push?: boolean
    sms?: boolean
    in_app?: boolean
  } | null
  
  // Professional Information (optional)
  company?: string | null
  job_title?: string | null
  website?: string | null
  skills?: string[] | null
  
  // Metadata
  last_activity?: string | null
  onboarding_completed?: boolean
  profile_completed_percentage?: number | null
  metadata?: any | null // For custom fields
  
  // System
  status: 'active' | 'inactive' | 'suspended'
  date_created?: string
  date_updated?: string | null
  created_by?: ID | DirectusUser
  updated_by?: ID | DirectusUser | null
}

/**
 * User Settings - User-specific application settings
 */
export interface UserSettings {
  id: ID
  user_id: ID | DirectusUser
  
  // UI Preferences
  theme?: 'light' | 'dark' | 'auto' | null
  sidebar_collapsed?: boolean
  language?: string | null
  date_format?: string | null
  time_format?: '12h' | '24h' | null
  
  // Privacy Settings
  profile_visibility?: 'public' | 'private' | 'friends' | null
  show_email?: boolean
  show_phone?: boolean
  allow_messages?: boolean
  
  // Feature Flags
  features?: {
    beta_features?: boolean
    experimental_ui?: boolean
    [key: string]: any
  } | null
  
  // Custom Settings
  custom_settings?: any | null
  
  date_created?: string
  date_updated?: string | null
}

/**
 * User Invitations - System for inviting new users
 */
export interface UserInvitation {
  id: ID
  email: string
  first_name?: string | null
  last_name?: string | null
  role: ID | DirectusRole
  invited_by: ID | DirectusUser
  
  // Invitation Details
  token: string
  message?: string | null
  
  // Status
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  
  // Timestamps
  invited_at: string
  accepted_at?: string | null
  expires_at: string
  
  // Metadata
  metadata?: {
    source?: string
    campaign?: string
    referral_code?: string
    [key: string]: any
  } | null
  
  date_created?: string
  date_updated?: string | null
}

/**
 * Activity Log - Track user activities
 */
export interface ActivityLog {
  id: ID
  user_id: ID | DirectusUser
  action: string
  collection?: string | null
  item_id?: string | null
  
  // Details
  details?: any | null
  ip_address?: string | null
  user_agent?: string | null
  
  // Context
  context?: {
    browser?: string
    os?: string
    device?: string
    location?: string
  } | null
  
  date_created?: string
}

/**
 * OAuth Tokens - Store OAuth provider tokens
 */
export interface OAuthToken {
  id: ID
  user_id: ID | DirectusUser
  provider: 'github' | 'google' | 'linkedin' | 'twitter' | 'facebook'
  
  // Token Data
  access_token: string
  refresh_token?: string | null
  token_type?: string | null
  expires_at?: string | null
  scope?: string | null
  
  // Provider Data
  provider_user_id: string
  provider_data?: any | null
  
  date_created?: string
  date_updated?: string | null
}

/**
 * Password Reset Tokens
 */
export interface PasswordReset {
  id: ID
  user_id: ID | DirectusUser
  token: string
  expires_at: string
  used?: boolean
  used_at?: string | null
  ip_address?: string | null
  user_agent?: string | null
  date_created?: string
}

/**
 * Sessions - Track user sessions (optional)
 */
export interface UserSession {
  id: ID
  user_id: ID | DirectusUser
  token: string

  // Session Info
  ip_address?: string | null
  user_agent?: string | null
  device_type?: 'desktop' | 'mobile' | 'tablet' | null

  // Activity
  last_activity?: string | null
  pages_visited?: string[] | null

  // Status
  is_active?: boolean
  expires_at?: string | null

  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Organization - Multi-tenant organization records
 */
export interface HoaOrganization {
  id: ID
  name: string
  slug?: string | null
  domain?: string | null
  logo?: ID | DirectusFile | null

  // Contact Info
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null

  // Settings
  settings?: any | null
  status: 'active' | 'inactive' | 'suspended'

  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Member - Organization members
 */
export interface HoaMember {
  id: ID
  organization: ID | HoaOrganization
  user: ID | DirectusUser
  role?: ID | DirectusRole | null

  // Member Info
  unit?: ID | null
  status: 'active' | 'inactive' | 'pending'

  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Invitation - Organization member invitations
 */
export interface HoaInvitation {
  id: ID
  organization: ID | HoaOrganization
  email: string
  name?: string | null
  role?: ID | DirectusRole | null
  token: string

  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  invited_by: ID | DirectusUser
  invited_at: string
  expires_at: string
  accepted_at?: string | null

  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Unit - Property units within an organization
 */
export interface HoaUnit {
  id: ID
  organization: ID | HoaOrganization
  unit_number: string
  address?: string | null

  status: 'active' | 'inactive'

  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Document - Organization documents
 */
export interface HoaDocument {
  id: ID
  organization: ID | HoaOrganization
  title: string
  description?: string | null
  file?: ID | DirectusFile | null
  category?: string | null

  status: 'published' | 'draft' | 'archived'

  date_created?: string
  date_updated?: string | null
  created_by?: ID | DirectusUser
}

// Define the complete schema
export interface DirectusSchema {
  // System Collections
  directus_users: DirectusUser
  directus_roles: DirectusRole
  directus_files: DirectusFile

  // Application Collections
  profiles: UserProfile
  user_settings: UserSettings
  user_invitations: UserInvitation
  activity_logs: ActivityLog
  oauth_tokens: OAuthToken
  password_resets: PasswordReset
  user_sessions: UserSession

  // HOA Collections (Multi-tenant)
  hoa_organizations: HoaOrganization
  hoa_members: HoaMember
  hoa_invitations: HoaInvitation
  hoa_units: HoaUnit
  hoa_documents: HoaDocument
}

// Type helper for collection names
export type DirectusCollections = keyof DirectusSchema

// Type helper for getting item type from collection name
export type DirectusItem<T extends DirectusCollections> = DirectusSchema[T]
