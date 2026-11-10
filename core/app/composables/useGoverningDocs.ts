// useGoverningDocs — the client side of /api/governing/* (docs/plan-governing-docs.md §4).
//
// Governing documents are read through guarded server routes only: no role has
// Directus permissions on these collections, so there is no useDirectusItems
// path. The server decides what the caller may see; nothing is filtered here.
import type {
  getGoverningDocument,
  getGoverningProvision,
  governingOverview,
  listGoverningDocuments,
  searchGoverning,
} from "#core/server/utils/governing-data";
import type { SettableFlagStatus } from "#core/shared/governing/flags";
import type { Relationship, Severity } from "#core/shared/governing/types";

export type GoverningDocumentRow = Awaited<ReturnType<typeof listGoverningDocuments>>[number];
export type GoverningDocumentView = NonNullable<Awaited<ReturnType<typeof getGoverningDocument>>> & { can_manage: boolean };
export type GoverningProvisionView = NonNullable<Awaited<ReturnType<typeof getGoverningProvision>>> & { can_manage: boolean };
export type GoverningSearchResult = Awaited<ReturnType<typeof searchGoverning>>[number];

export type GoverningOverview = Awaited<ReturnType<typeof governingOverview>>;

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

  // Managers only; the server refuses anyone else. The file goes up as it is.
  const attachSource = (documentId: string, file: File, options: { is_recorded_copy: boolean; is_authoritative: boolean; notes?: string }) => {
    const form = new FormData();
    form.append("is_recorded_copy", String(options.is_recorded_copy));
    form.append("is_authoritative", String(options.is_authoritative));
    if (options.notes) form.append("notes", options.notes);
    form.append("file", file, file.name);
    return $fetch<{ id: string; file: string; page_count: number | null }>(
      `/api/governing/documents/${encodeURIComponent(documentId)}/sources`,
      { method: "POST", query: base(), body: form }
    );
  };

  const removeSource = (documentId: string, sourceId: string) =>
    $fetch<{ ok: boolean }>(`/api/governing/documents/${encodeURIComponent(documentId)}/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
      query: base(),
    });

  const getOverview = () => $fetch<GoverningOverview>("/api/governing/overview", { query: base() });

  // Managers only; the server refuses anyone else and writes the audit row.
  const setFlagStatus = (flagId: string, status: SettableFlagStatus) =>
    $fetch<{ id: string; status: SettableFlagStatus; changed: boolean }>(`/api/governing/flags/${encodeURIComponent(flagId)}/status`, {
      method: "POST",
      query: base(),
      body: { status },
    });

  return { getOverview, setFlagStatus, listDocuments, getDocument, getProvision, search, attachSource, removeSource };
}
