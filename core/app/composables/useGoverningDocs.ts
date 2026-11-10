// useGoverningDocs — the client side of /api/governing/* (docs/plan-governing-docs.md §4).
//
// Governing documents are read through guarded server routes only: no role has
// Directus permissions on these collections, so there is no useDirectusItems
// path. The server decides what the caller may see; nothing is filtered here.
import type {
  getGoverningDocument,
  getGoverningProvision,
  listGoverningDocuments,
  searchGoverning,
} from "#core/server/utils/governing-data";
import type { Relationship, Severity } from "#core/shared/governing/types";

export type GoverningDocumentRow = Awaited<ReturnType<typeof listGoverningDocuments>>[number];
export type GoverningDocumentView = NonNullable<Awaited<ReturnType<typeof getGoverningDocument>>> & { can_manage: boolean };
export type GoverningProvisionView = NonNullable<Awaited<ReturnType<typeof getGoverningProvision>>> & { can_manage: boolean };
export type GoverningSearchResult = Awaited<ReturnType<typeof searchGoverning>>[number];

export type GoverningSearchParams = {
  q?: string;
  document?: string;
  kind?: string;
  hasFlags?: boolean;
  relationship?: Relationship;
  severity?: Severity;
};

export function useGoverningDocs(orgId: Ref<string | null | undefined>) {
  const base = () => ({ orgId: orgId.value ?? undefined });

  const listDocuments = () =>
    $fetch<{ documents: GoverningDocumentRow[]; can_manage: boolean }>("/api/governing/documents", { query: base() });

  const getDocument = (id: string) =>
    $fetch<GoverningDocumentView>(`/api/governing/documents/${encodeURIComponent(id)}`, { query: base() });

  const getProvision = (id: string) =>
    $fetch<GoverningProvisionView>(`/api/governing/provisions/${encodeURIComponent(id)}`, { query: base() });

  const search = (params: GoverningSearchParams) =>
    $fetch<{ query: string; total: number; results: GoverningSearchResult[] }>("/api/governing/search", {
      query: {
        ...base(),
        q: params.q || undefined,
        document: params.document || undefined,
        kind: params.kind || undefined,
        hasFlags: params.hasFlags ? "true" : undefined,
        relationship: params.relationship || undefined,
        severity: params.severity || undefined,
      },
    });

  return { listDocuments, getDocument, getProvision, search };
}
