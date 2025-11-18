// types/directus-schema.ts
// Directus collection types and schema

// ============================================
// BASE TYPES
// ============================================

export type ID = string | number;

// ============================================
// SYSTEM COLLECTIONS
// ============================================

export interface DirectusRole {
  id: ID;
  name: string;
  icon?: string | null;
  description?: string | null;
  admin_access: boolean;
  app_access: boolean;
}

export interface DirectusFile {
  id: ID;
  storage: string;
  filename_disk: string;
  filename_download: string;
  title?: string | null;
  type?: string | null;
  folder?: ID | null;
  uploaded_by?: ID | DirectusUser | null;
  uploaded_on: string;
  modified_by?: ID | DirectusUser | null;
  modified_on?: string | null;
  charset?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  embed?: string | null;
  description?: string | null;
  location?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
}

export interface DirectusUser {
  id: ID;
  status: "active" | "suspended" | "inactive" | "invited";
  email: string;
  password?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar?: ID | DirectusFile | null;
  role?: ID | DirectusRole | null;
  token?: string | null;
  last_access?: string | null;
  last_page?: string | null;
  provider?: string | null;
  external_identifier?: string | null;
  auth_data?: any | null;
  email_notifications?: boolean | null;
  appearance?: string | null;
  theme_dark?: string | null;
  theme_light?: string | null;
  theme_light_overrides?: any | null;
  theme_dark_overrides?: any | null;

  // Custom fields (if you added any to directus_users)
  organization?: ID | HoaOrganization | null;
  member?: ID | HoaMember | null;
}

// ============================================
// HOA COLLECTIONS (Multi-tenant)
// ============================================

export interface HoaOrganization {
  id: ID;
  status: "active" | "inactive" | "suspended";

  // Basic Info
  name: string;
  slug?: string | null;
  domain?: string | null;
  logo?: ID | DirectusFile | null;

  // Contact Info
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;

  // Settings & Configuration
  settings?: Record<string, any> | null;
  subscription_plan?: ID | SubscriptionPlan | null;

  // Relational Fields (One-to-Many reverse relations)
  invitations?: (ID | HoaInvitation)[] | null;
  amenities?: (ID | HoaAmenity)[] | null;
  subscription?: ID | HoaSubscription | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaMember {
  id: ID;
  status: "active" | "inactive" | "pending";

  // Relations
  organization: ID | HoaOrganization;
  user: ID | DirectusUser;
  role?: ID | DirectusRole | null;

  // Member Info
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  member_type?: "owner" | "renter" | "board_member" | string | null;
  unit?: ID | HoaUnit | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaInvitation {
  id: ID;
  invitation_status: "pending" | "accepted" | "expired" | "canceled";

  // Relations
  organization: ID | HoaOrganization;
  invited_by: ID | DirectusUser;

  // Invitation Data
  email: string;
  name?: string | null;
  role?: ID | DirectusRole | null;
  token: string;

  // Timestamps
  invited_at: string;
  expires_at: string;
  accepted_at?: string | null;
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaUnit {
  id: ID;
  status: "active" | "inactive";

  // Relations
  organization: ID | HoaOrganization;

  // Unit Info
  unit_number: string;
  address?: string | null;
  floor?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaDocument {
  id: ID;
  status: "published" | "draft" | "archived";

  // Relations
  organization: ID | HoaOrganization;
  created_by?: ID | DirectusUser;
  file?: ID | DirectusFile | null;

  // Document Info
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaPet {
  id: ID;
  status: "active" | "inactive";

  // Relations
  organization: ID | HoaOrganization;
  unit?: ID | HoaUnit | null;

  // Pet Info
  name: string;
  type?: string | null;
  breed?: string | null;
  weight?: number | null;
  photo?: ID | DirectusFile | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaVehicle {
  id: ID;
  status: "active" | "inactive";

  // Relations
  organization: ID | HoaOrganization;
  unit?: ID | HoaUnit | null;

  // Vehicle Info
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  license_plate?: string | null;
  parking_spot?: string | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaAmenity {
  id: ID;
  status: "published" | "draft" | "archived";

  // Relations
  organization: ID | HoaOrganization;

  // Amenity Info
  title: string;
  description?: string | null;
  location?: string | null;
  availability?: string | null;
  image?: ID | DirectusFile | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface SubscriptionPlan {
  id: ID;
  status: "published" | "draft" | "archived";

  // Plan Info
  name: string;
  description?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
  trial_days?: number | null;
  is_featured?: boolean | null;

  // Limits
  max_members?: number | null;
  max_storage_gb?: number | null;
  features?: string[] | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaSubscription {
  id: ID;
  status: "active" | "canceled" | "expired" | "trial";

  // Relations
  organization: ID | HoaOrganization;
  plan: ID | SubscriptionPlan;

  // Subscription Info
  start_date: string;
  end_date?: string | null;
  trial_end_date?: string | null;
  canceled_at?: string | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

// ============================================
// DIRECTUS SCHEMA TYPE
// ============================================

// Per Directus SDK docs, collections must be defined as array types
// See: https://directus.io/docs/tutorials/tips-and-tricks/advanced-types-with-the-directus-sdk
export interface DirectusSchema {
  // System Collections
  directus_users: DirectusUser[];
  directus_roles: DirectusRole[];
  directus_files: DirectusFile[];

  // HOA Collections (Multi-tenant)
  hoa_organizations: HoaOrganization[];
  hoa_members: HoaMember[];
  hoa_invitations: HoaInvitation[];
  hoa_units: HoaUnit[];
  hoa_documents: HoaDocument[];
  hoa_pets: HoaPet[];
  hoa_vehicles: HoaVehicle[];
  hoa_amenities: HoaAmenity[];
  hoa_subscriptions: HoaSubscription[];

  // Subscription Plans
  subscription_plans: SubscriptionPlan[];
}

// ============================================
// UTILITY TYPES
// ============================================

// Type helper for collection names
export type DirectusCollections = keyof DirectusSchema;

// Type helper for getting item type from collection name
// Since collections are arrays in the schema, we need to extract the element type
export type DirectusItem<T extends DirectusCollections> = DirectusSchema[T] extends (infer U)[]
  ? U
  : DirectusSchema[T];

// Type helper for create/update operations (without readonly fields)
export type CreateDirectusItem<T extends DirectusCollections> = Omit<
  DirectusItem<T>,
  "id" | "date_created" | "date_updated"
>;

export type UpdateDirectusItem<T extends DirectusCollections> = Partial<
  Omit<DirectusItem<T>, "id" | "date_created" | "date_updated">
>;

// ============================================
// AUTHENTICATION TYPES
// ============================================

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires: number;
}

export interface SessionUser {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar?: string | null;
  role?: DirectusRole | null;
  organization?: HoaOrganization | null;
  member?: HoaMember | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}
