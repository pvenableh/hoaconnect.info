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
import type { GoverningAuditEntry } from "#core/server/utils/governing-audit";
import type { listSourcePages } from "#core/server/utils/governing-pages";
import type { ProvisionEdit, getGoverningReview } from "#core/server/utils/governing-review";
import type { SettableFlagStatus } from "#core/shared/governing/flags";
import { UPLOAD_PART_BYTES, partCount } from "#core/shared/governing/upload";
import type { DocumentEdit } from "#core/shared/governing/review";
import type { Relationship, ReviewState, Severity } from "#core/shared/governing/types";

export type GoverningDocumentRow = Awaited<ReturnType<typeof listGoverningDocuments>>[number];
export type GoverningDocumentView = NonNullable<Awaited<ReturnType<typeof getGoverningDocument>>> & { can_manage: boolean };
export type GoverningProvisionView = NonNullable<Awaited<ReturnType<typeof getGoverningProvision>>> & { can_manage: boolean };
export type GoverningSearchResult = Awaited<ReturnType<typeof searchGoverning>>[number];

export type GoverningSourcePages = Awaited<ReturnType<typeof listSourcePages>>;
export type GoverningUploadRef = { id: string; parts: number; sha256: string; filename: string; type: string };
export type GoverningProposal = { provisions: number; pages: number; pages_from_text_layer: number; pages_read_from_image: number; pages_without_text: number };

export type GoverningReview = Awaited<ReturnType<typeof getGoverningReview>>;
export type GoverningReviewProvision = GoverningReview["provisions"][number];

export type { GoverningAuditEntry };
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

  // A request may carry about 4 MB, and a recorded scan is often larger. So a
  // file goes up in parts; the server joins them and checks this checksum, and
  // what is stored is the file as it is. Managers only.
  const uploadInParts = async (file: File, onProgress?: (sent: number, total: number) => void): Promise<GoverningUploadRef> => {
    const bytes = await file.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID();
    const parts = partCount(file.size);
    for (let index = 0; index < parts; index++) {
      const form = new FormData();
      form.append("uploadId", id);
      form.append("index", String(index));
      form.append("file", new Blob([bytes.slice(index * UPLOAD_PART_BYTES, (index + 1) * UPLOAD_PART_BYTES)], { type: "application/octet-stream" }), `${index}.part`);
      await $fetch("/api/governing/uploads/parts", { method: "POST", query: base(), body: form, retry: 2 });
      onProgress?.(index + 1, parts);
    }
    return { id, parts, sha256, filename: file.name, type: file.type };
  };

  const attachSource = async (
    documentId: string,
    file: File,
    options: { is_recorded_copy: boolean; is_authoritative: boolean; notes?: string },
    onProgress?: (sent: number, total: number) => void
  ) =>
    $fetch<{ id: string; file: string; page_count: number | null }>(`/api/governing/documents/${encodeURIComponent(documentId)}/sources/upload`, {
      method: "POST",
      query: base(),
      body: { upload: await uploadInParts(file, onProgress), ...options },
    });

  /** A new draft document from a PDF or an image. Members do not see it. */
  const createFromUpload = async (
    input: { title: string; kind: string; file: File; is_recorded_copy: boolean },
    onProgress?: (sent: number, total: number) => void
  ) =>
    $fetch<{ id: string; source: string; file: string; page_count: number | null }>("/api/governing/documents", {
      method: "POST",
      query: base(),
      body: { title: input.title, kind: input.kind, is_recorded_copy: input.is_recorded_copy, upload: await uploadInParts(input.file, onProgress) },
    });

  /** A source's pages with the draft text taken from each. Managers only. */
  const getSourcePages = (sourceId: string) =>
    $fetch<GoverningSourcePages>(`/api/governing/sources/${encodeURIComponent(sourceId)}/pages`, { query: base() });

  const storePage = (sourceId: string, pageNumber: number, image: Blob, text: string | null) => {
    const form = new FormData();
    form.append("page_number", String(pageNumber));
    if (text) form.append("text", text);
    form.append("image", image, `page-${pageNumber}.jpg`);
    return $fetch<{ id: string; page_number: number; image: string; extraction: string | null }>(
      `/api/governing/sources/${encodeURIComponent(sourceId)}/pages`,
      { method: "POST", query: base(), body: form }
    );
  };

  /** Read a scanned page from its image. Uses the community's AI credits. */
  const readPage = (pageId: string) =>
    $fetch<{ id: string; page_number: number; extraction: string; changed: boolean; credits: number }>(
      `/api/governing/pages/${encodeURIComponent(pageId)}/ocr`,
      { method: "POST", query: base(), body: {} }
    );

  const proposeProvisions = (documentId: string) =>
    $fetch<GoverningProposal>(`/api/governing/documents/${encodeURIComponent(documentId)}/propose`, { method: "POST", query: base(), body: {} });

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

  // Review (managers only). Each of these writes an audit row on the server.
  const provisionUrl = (id: string, action = "") => `/api/governing/provisions/${encodeURIComponent(id)}${action}`;
  const documentUrl = (id: string, action = "") => `/api/governing/documents/${encodeURIComponent(id)}${action}`;
  const post = <T>(url: string, body: Record<string, unknown> = {}) => $fetch<T>(url, { method: "POST", query: base(), body });

  const getReview = (documentId: string) => $fetch<GoverningReview>(documentUrl(documentId, "/review"), { query: base() });

  /** `text` is stored exactly as sent. A reason is required when the document is published. */
  const editProvision = (id: string, edit: ProvisionEdit, reason?: string) =>
    $fetch<{ id: string; changed: boolean; review_state: ReviewState }>(provisionUrl(id), { method: "PATCH", query: base(), body: { ...edit, reason } });

  const setReviewState = (id: string, state: ReviewState) =>
    post<{ id: string; review_state: ReviewState; changed: boolean }>(provisionUrl(id, "/review-state"), { state });
  const splitProvision = (id: string, at: number) => post<{ id: string; created: string }>(provisionUrl(id, "/split"), { at });
  const mergeProvision = (id: string) => post<{ id: string; removed: string }>(provisionUrl(id, "/merge"));
  const reorderProvisions = (documentId: string, ids: string[]) => post<{ changed: boolean }>(documentUrl(documentId, "/reorder"), { ids });
  const publishDocument = (documentId: string) => post<{ id: string; status: "published"; provisions: number }>(documentUrl(documentId, "/publish"));
  /** A document's own details, never its provisions. A reason is required when it is published. */
  const editDocument = (documentId: string, edit: DocumentEdit, reason?: string) =>
    $fetch<{ id: string; changed: boolean }>(documentUrl(documentId), { method: "PATCH", query: base(), body: { ...edit, reason } });
  /** Back to draft: members stop seeing the document until it is published again. */
  const unpublishDocument = (documentId: string, reason: string) => post<{ id: string; status: "draft" }>(documentUrl(documentId, "/unpublish"), { reason });
  const deleteDraft = (documentId: string) =>
    $fetch<{ ok: boolean; provisions: number; sources: number }>(documentUrl(documentId), { method: "DELETE", query: base() });

  /** Ask for statute-flag suggestions on a published document. Uses the community's AI credits. */
  const suggestFlags = (documentId: string) =>
    post<{ suggested: number; rejected: number; provisions: number; references: number; credits: number }>(documentUrl(documentId, "/suggest-flags"));

  /** The audit trail, newest first. Managers only. */
  const getAudit = (params: { document?: string; action?: string; before?: string } = {}) =>
    $fetch<{ entries: GoverningAuditEntry[]; next_before: string | null }>("/api/governing/audit", {
      query: { ...base(), document: params.document || undefined, action: params.action || undefined, before: params.before || undefined },
    });

  return {
    getAudit, editDocument, unpublishDocument,
    suggestFlags,
    getReview, editProvision, setReviewState, splitProvision, mergeProvision, reorderProvisions, publishDocument, deleteDraft,
    getOverview, setFlagStatus, listDocuments, getDocument, getProvision, search, attachSource, removeSource,
    createFromUpload, getSourcePages, storePage, readPage, proposeProvisions,
  };
}
