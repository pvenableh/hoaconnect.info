/**
 * The citation a board member or lawyer copies (spec §6):
 *   By-Law 3.5, O.R. Book 9640, Page 300
 * Book comes from the document; the page is where the provision starts.
 */
import type { GovDocument, GovProvision } from "./types";

export function formatCitation(
  provision: Pick<GovProvision, "citation" | "or_page_start">,
  document: Pick<GovDocument, "or_book" | "or_page_start">
): string {
  const parts = [provision.citation ?? ""];
  if (document.or_book) parts.push(`O.R. Book ${document.or_book}`);
  const page = provision.or_page_start ?? document.or_page_start;
  if (page != null) parts.push(`Page ${page}`);
  return parts.filter(Boolean).join(", ");
}
