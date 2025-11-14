/**
 * Directus Schema Type Definitions
 *
 * Define all your Directus collections and their types here.
 * This enables full type safety when using the Directus SDK.
 */

export interface DirectusSchema {
  hoa_organizations: HoaOrganization[];
  hoa_members: HoaMember[];
  hoa_invitations: HoaInvitation[];
  directus_users: DirectusUser[];
  directus_roles: DirectusRole[];
  directus_permissions: DirectusPermission[];
}

// HOA Organization
export interface HoaOrganization {
  id: string;
  status: 'published' | 'draft' | 'archived';
  date_created: string;
  date_updated: string;
  name: string;
  slug: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  subscription_plan?: string | null;
  custom_domain?: string;
  domain_type?: 'apex' | 'www' | 'subdomain';
  domain_verified?: boolean;
  domain_config?: {
    vercel_domain?: string;
    dns_instructions?: any;
    added_at?: string;
    verified_at?: string;
    vercel_response?: any;
  };
}

// HOA Member
export interface HoaMember {
  id: string;
  status: 'published' | 'draft' | 'archived';
  date_created: string;
  date_updated: string;
  user: string | DirectusUser;
  organization: string | HoaOrganization;
  role: string | DirectusRole;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  member_type: 'owner' | 'renter' | 'board_member' | 'manager';
  unit_number?: string;
}

// HOA Invitation
export interface HoaInvitation {
  id: string;
  status: 'published' | 'draft' | 'archived';
  date_created: string;
  date_updated: string;
  email: string;
  organization: string | HoaOrganization;
  role: string | DirectusRole;
  invited_by: string | DirectusUser;
  token: string;
  invitation_status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  accepted_at?: string;
}

// Directus System Collections
export interface DirectusUser {
  id: string;
  status: 'active' | 'invited' | 'draft' | 'suspended' | 'archived';
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  role: string | DirectusRole;
  provider: string;
  external_identifier?: string;
  auth_data?: any;
  email_notifications?: boolean;
  last_access?: string;
  last_page?: string;
  token?: string;
  date_created?: string;
  date_updated?: string;
}

export interface DirectusRole {
  id: string;
  name: string;
  icon: string;
  description?: string;
  ip_access?: string[];
  enforce_tfa: boolean;
  admin_access: boolean;
  app_access: boolean;
}

export interface DirectusPermission {
  id: number;
  role: string | DirectusRole;
  collection: string;
  action: 'create' | 'read' | 'update' | 'delete';
  permissions?: Record<string, any>;
  validation?: Record<string, any>;
  presets?: Record<string, any>;
  fields?: string[];
}
