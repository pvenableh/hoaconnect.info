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
 * HOA Pets - Pet registrations for HOA members
 */
export interface HoaPet {
  id: ID
  member_id: ID | HoaMember
  name: string
  type?: string | null // dog, cat, bird, etc.
  breed?: string | null
  weight?: number | null
  color?: string | null
  image?: ID | DirectusFile | null
  status: 'active' | 'inactive'
  date_created?: string
  date_updated?: string | null
}

/**
 * HOA Vehicles - Vehicle registrations for HOA members
 */
export interface HoaVehicle {
  id: ID
  member_id: ID | HoaMember
  make?: string | null
  model?: string | null
  year?: number | null
  color?: string | null
  license_plate?: string | null
  image?: ID | DirectusFile | null
  status: 'active' | 'inactive'
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

  // HOA Collections (Multi-tenant)
  hoa_organizations: HoaOrganization
  hoa_members: HoaMember
  hoa_invitations: HoaInvitation
  hoa_units: HoaUnit
  hoa_documents: HoaDocument
  hoa_pets: HoaPet
  hoa_vehicles: HoaVehicle
}

// Type helper for collection names
export type DirectusCollections = keyof DirectusSchema

// Type helper for getting item type from collection name
export type DirectusItem<T extends DirectusCollections> = DirectusSchema[T]
