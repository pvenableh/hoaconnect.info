// Pure helper for the "Draft with AI" stream. The draft model emits
// `Subject: <subject>` on the first line, a blank line, then the HTML body. As
// tokens arrive we re-split the accumulated text so the composer's subject and
// body fields update live. Framework-free so it's unit-testable.

export interface DraftParts {
  /** Parsed subject, or null while it can't be determined yet. */
  subject: string | null;
  /** The HTML body accumulated so far. */
  body: string;
}

/**
 * Split the running draft output into { subject, body }. Tolerates the
 * mid-stream states: before the first newline (subject line still arriving),
 * and output that omits the `Subject:` prefix entirely (treated as all body).
 */
export function splitDraftOutput(full: string): DraftParts {
  const nl = full.indexOf("\n");
  const subjectRe = /^subject:\s*/i;

  if (nl === -1) {
    // Still on the first line.
    if (subjectRe.test(full)) return { subject: full.replace(subjectRe, ""), body: "" };
    return { subject: null, body: full };
  }

  const firstLine = full.slice(0, nl);
  if (subjectRe.test(firstLine)) {
    return {
      subject: firstLine.replace(subjectRe, "").trim(),
      body: full.slice(nl + 1).replace(/^\n+/, ""),
    };
  }
  // No subject marker — it's all body.
  return { subject: null, body: full };
}
