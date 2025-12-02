// types/directus.ts
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

export interface DirectusPermission {
  id: ID;
  role?: ID | DirectusRole | null;
  collection: string;
  action: string;
  permissions?: Record<string, any> | null;
  validation?: Record<string, any> | null;
  fields?: string[] | null;
  limit?: number | null;
  presets?: Record<string, any> | null;
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

export interface DirectusFolder {
  id: ID;
  name: string;
  parent?: ID | DirectusFolder | null;
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
  status:
    | "published"
    | "draft"
    | "archived"
    | "active"
    | "inactive"
    | "suspended";

  // Basic Info
  name: string;
  slug?: string | null;
  domain?: string | null;
  custom_domain?: string | null;
  domain_verified?: boolean | null;
  domain_type?: "apex" | "subdomain" | null;
  domain_config?: Record<string, any> | null;
  logo?: ID | DirectusFile | null;

  // Contact Info
  email?: string | null;
  phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;

  // Subscription & Billing
  billing_cycle?: "monthly" | "yearly" | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: "active" | "trial" | "canceled" | "expired" | null;
  trial_ends_at?: string | null;
  member_count?: number | null;

  // Settings & Configuration
  settings?: ID | HoaSettings | null;
  hero?: ID | HoaHero | null;
  subscription_plan?: ID | SubscriptionPlan | null;
  folder?: ID | DirectusFolder | null;

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
  units?: (ID | HoaMemberUnit)[] | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaMemberUnit {
  id: ID;
  status: "published" | "draft" | "archived";

  // Relations
  member_id: ID | HoaMember;
  unit_id: ID | HoaUnit;

  // Junction Fields
  is_primary_unit?: boolean | null;

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
  folder?: ID | DirectusFolder | null;

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
  icon?: string | null;
  description?: string | null;
  location?: string | null;
  availability?: string | null;
  image?: ID | DirectusFile | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaSettings {
  id: ID;
  status: "published" | "draft" | "archived";

  // Relations
  organization?: ID | HoaOrganization | null;

  // Brand & Styling
  heading_font?: string | null;
  body_font?: string | null;
  logo?: ID | DirectusFile | null;
  icon?: ID | DirectusFile | null;
  colors?: Record<string, any>[] | null;

  // SEO & Content
  title?: string | null;
  description?: string | null;
  seo?: {
    title?: string;
    meta_description?: string;
  } | null;

  // Timestamps
  date_created?: string;
  date_updated?: string | null;
}

export interface HoaHero {
  id: ID;
  status: "published" | "draft" | "archived";

  // Hero Content
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;

  // Hero Images
  background_image?: ID | DirectusFile | null;
  foreground_image?: ID | DirectusFile | null;

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

export interface PaymentTransaction {
  id: ID;
  status: "pending" | "succeeded" | "failed" | "canceled" | "refunded";
  date_created: string;
  date_updated: string;
  user_created?: ID | DirectusUser;
  user_updated?: ID | DirectusUser;
  organization: ID | HoaOrganization;
  member?: ID | HoaMember;
  payment_request?: ID | PaymentRequest;
  amount: number;
  currency: string;
  description?: string;
  stripe_payment_intent_id: string;
  stripe_charge_id?: string;
  stripe_customer_id?: string;
  stripe_payment_method_id?: string;
  payment_method_type?: "card" | "us_bank_account";
  last4?: string;
  receipt_url?: string;
  receipt_email?: string;
  processing_fee?: number;
  net_amount?: number;
  metadata?: any;
  notes?: string;
}

export interface PaymentRequest {
  id: ID;
  status:
    | "draft"
    | "active"
    | "paid"
    | "partially_paid"
    | "overdue"
    | "canceled";
  date_created: string;
  date_updated: string;
  user_created?: ID | DirectusUser;
  user_updated?: ID | DirectusUser;
  organization: ID | HoaOrganization;
  member: ID | HoaMember;
  request_type: "monthly_dues" | "assessment" | "late_fee" | "other";
  title: string;
  description?: string;
  amount: number;
  due_date?: string;
  amount_paid: number;
  amount_remaining: number;
  paid_at?: string;
  transactions?: PaymentTransaction[];
  email_sent: boolean;
  email_sent_at?: string;
  reminder_sent: boolean;
  reminder_sent_at?: string;
  notes?: string;
  metadata?: any;
}

export interface PaymentSchedule {
  id: ID;
  status: "active" | "paused" | "completed" | "canceled";
  date_created: string;
  date_updated: string;
  organization: ID | HoaOrganization;
  member: ID | HoaMember;
  title: string;
  description?: string;
  amount: number;
  frequency: "monthly" | "quarterly" | "annually";
  start_date: string;
  end_date?: string;
  next_payment_date: string;
  total_payments_generated: number;
  last_payment_generated_at?: string;
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
  directus_permissions: DirectusPermission[];

  // HOA Collections (Multi-tenant)
  hoa_organizations: HoaOrganization[];
  hoa_members: HoaMember[];
  hoa_member_units: HoaMemberUnit[];
  hoa_invitations: HoaInvitation[];
  hoa_units: HoaUnit[];
  hoa_documents: HoaDocument[];
  hoa_pets: HoaPet[];
  hoa_vehicles: HoaVehicle[];
  hoa_amenities: HoaAmenity[];
  hoa_settings: HoaSettings[];
  hoa_heroes: HoaHero[];
  hoa_subscriptions: HoaSubscription[];

  // Subscription Plans
  subscription_plans: SubscriptionPlan[];

  // Payment Collections
  payment_transactions: PaymentTransaction[];
  payment_requests: PaymentRequest[];
  payment_schedules: PaymentSchedule[];
}

// ============================================
// UTILITY TYPES
// ============================================

// Type helper for collection names
export type DirectusCollections = keyof DirectusSchema;

// Type helper for getting item type from collection name
// Since collections are arrays in the schema, we need to extract the element type
export type DirectusItem<T extends DirectusCollections> =
  DirectusSchema[T] extends (infer U)[] ? U : DirectusSchema[T];

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
