// shared/types/directus-augment.d.ts
// Collections the app's routes use but that don't exist in Directus yet —
// `pnpm create:join-requests` creates them; until that has run against the
// live instance, the join-request routes fail at runtime. After running it,
// regenerate types (`pnpm generate:types`) and this augmentation can go.
import type { DirectusUser, HoaOrganization } from "../../types/directus";

declare module "../../types/directus" {
  interface HoaJoinRequest {
    /** @primaryKey */
    id: string;
    status?: string | null;
    user?: DirectusUser | string | null;
    organization?: HoaOrganization | string | null;
    unit_number?: string | null;
    member_type?: "owner" | "tenant" | null;
    message?: string | null;
    processed_by?: DirectusUser | string | null;
    processed_at?: string | null;
    rejection_reason?: string | null;
    date_created?: string | null;
    date_updated?: string | null;
  }

  interface Schema {
    hoa_join_requests: HoaJoinRequest[];
  }
}

export {};
