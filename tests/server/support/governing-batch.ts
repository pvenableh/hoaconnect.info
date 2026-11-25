/**
 * The relations the governing reads (governingSpecs) and the caller's access
 * snapshot follow, for memoryBatch. A governing test stubs `readItemsBatch`
 * with `governingBatch(() => db)`.
 */
import { memoryBatch, type MemoryRelations } from "./memory-batch";
import type { MemoryDirectus } from "./memory-directus";

export const GOVERNING_RELATIONS: MemoryRelations = {
  m2o: {
    "hoa_governing_sources.file": "directus_files",
    "hoa_governing_sources.document": "hoa_governing_documents",
    "hoa_governing_pages.source": "hoa_governing_sources",
    "hoa_statute_flags_provisions.flag": "hoa_statute_flags",
    "hoa_statute_flags_provisions.provision": "hoa_governing_provisions",
    "hoa_statute_flags_references.flag": "hoa_statute_flags",
    "hoa_statute_flags_references.reference": "hoa_statute_references",
    // The access snapshot (access-snapshot.ts).
    "hoa_member_restrictions.member": "hoa_members",
    "hoa_team_members.team": "hoa_teams",
  },
  o2m: { "hoa_members.board_member_terms": ["hoa_board_members", "hoa_member"] },
};

export const governingBatch = (db: () => MemoryDirectus) => (specs: Record<string, any>) => memoryBatch(db(), GOVERNING_RELATIONS)(specs);
