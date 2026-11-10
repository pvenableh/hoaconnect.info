/**
 * Governing-documents seed import: the pure half (docs/plan-governing-docs.md §3).
 *
 * `buildImportPlan` turns the three seed files into rows; `applyImportPlan`
 * writes them through a small store interface, so the same code runs against
 * Directus (scripts/seed-governing-docs-1033.ts) and against a memory store in
 * tests/scripts/governing-import.test.ts.
 *
 * Two rules this file exists to keep:
 *
 *  1. **Text is verbatim.** Strings from the seed are passed through untouched:
 *     no trim, no whitespace or quote normalization, no spelling fixes. "Poxies"
 *     stays "Poxies".
 *  2. **A re-run never rewrites what a person may have changed.** The fields in
 *     `CREATE_ONLY` are written when a row is created and never again: provision
 *     `text` (after import only the audited edit route may change it) and the
 *     review / flag statuses an admin sets. A re-run that finds different text
 *     counts it in `textDiffers` and leaves it alone.
 *
 * Nothing here invents legal content. A statute reference gets a URL and
 * edition only when the seed's `_meta.sources` has its section; titles and
 * summaries are not in the seed and stay null.
 */

export type SeedManifest = {
  organization: {
    slug: string;
    state?: string | null;
    regime?: string | null;
    governing_statute?: string | null;
    original_statute_cited?: string | null;
    kaufman_language?: boolean | null;
    kaufman_note?: string | null;
  };
  documents: Array<{
    id: string;
    title: string;
    kind: string;
    citation_prefix: string | null;
    or_book: string | null;
    or_page_start: number | null;
    or_page_end: number | null;
    executed_on: string | null;
    recorded_on: string | null;
    clerk_file_no: string | null;
    county: string | null;
    transcription_file: string | null;
    amends: string | null;
  }>;
};

export type SeedProvision = {
  id: string;
  document_id: string;
  citation: string;
  heading: string | null;
  or_book?: string | null;
  or_page_start: number | null;
  or_page_end: number | null;
  order: number;
  text: string;
};

export type SeedFlagsFile = {
  _meta: {
    jurisdiction: string;
    verified_on: string;
    sources: Record<string, { url: string | null; edition: string | null }>;
  };
  flags: Array<{
    provision_ids: string[];
    topic: string;
    document_rule: string | null;
    statute_ref: string | null;
    statute_rule: string | null;
    relationship: string;
    severity: string;
    note?: string | null;
  }>;
};

export const RELATIONSHIPS = ["statute_controls", "statute_supplements", "document_controls", "consistent", "counsel_review"] as const;
export const LINK_TYPES = ["amends", "replaces", "adds_to", "conflicts_with"] as const;

export type SeedLink = { from: string; to: string; type: (typeof LINK_TYPES)[number]; note: string | null };

/**
 * Provision-level links for 1033 Lenox (spec §9, criterion 6). These are
 * structural, read off the instruments' own words: 1978 ¶7 says Declaration #11
 * "shall be amended to read"; 1978 ¶6 bans leasing and 1994 ¶1 sets rental
 * rules without mentioning the ban.
 */
export const LENOX_PROVISION_LINKS: SeedLink[] = [
  { from: "amend-1978:¶7", to: "decl:11", type: "amends", note: null },
  { from: "amend-1978:¶6", to: "amend-1994:¶1", type: "conflicts_with", note: null },
];

type Row = Record<string, unknown>;

export type ImportPlan = {
  organization: Row;
  documents: Array<{ key: string; amendsKey: string | null; data: Row }>;
  provisions: Array<{ key: string; documentKey: string; parentKey: string | null; data: Row }>;
  references: Array<{ code: string; data: Row }>;
  flags: Array<{ key: string; provisionKeys: string[]; referenceCodes: string[]; data: Row }>;
  links: SeedLink[];
};

export const C = {
  documents: "hoa_governing_documents",
  provisions: "hoa_governing_provisions",
  links: "hoa_governing_provision_links",
  references: "hoa_statute_references",
  flags: "hoa_statute_flags",
  flagProvisions: "hoa_statute_flags_provisions",
  flagReferences: "hoa_statute_flags_references",
} as const;

/** Written on create, never on update. See the header. */
export const CREATE_ONLY: Record<string, string[]> = {
  [C.documents]: ["status"],
  [C.provisions]: ["text", "review_state"],
  [C.flags]: ["status"],
};

/** A key for a flag that survives re-runs: the topic, lower-cased, non-alphanumerics to dashes. */
export function flagKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * "718.112(2)(k); 718.111(14)" is two references. Null is none.
 *
 * A semicolon inside parentheses is not a separator, and a remark in
 * parentheses after a statute code is not part of the code:
 * "760.29(4) (fair housing; not ch. 718)" is the one reference "760.29(4)".
 * The flag keeps the whole string, verbatim, in `statute_citation`. Nothing
 * else is altered: "718.110(1), (3), (4)" and a case citation stay whole.
 */
export function splitStatuteRef(ref: string | null): string[] {
  if (!ref) return [];
  const pieces: string[] = [];
  let depth = 0;
  let piece = "";
  for (const ch of ref) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      pieces.push(piece);
      piece = "";
    } else piece += ch;
  }
  pieces.push(piece);
  return pieces
    .map((s) => s.trim())
    .map((s) => /^(\d+\.\d+(?:\([0-9a-z]+\))*)\s+\([^()]*\)$/i.exec(s)?.[1] ?? s)
    .filter(Boolean);
}

/** The seed gives a URL and edition per section ("718.112") or per named source ("tropicana"). */
export function sourceFor(code: string, sources: SeedFlagsFile["_meta"]["sources"]) {
  const section = /^\d+\.\d+/.exec(code)?.[0];
  if (section && sources[section]) return sources[section];
  const named = Object.keys(sources).find((k) => !/^\d/.test(k) && code.toLowerCase().startsWith(k.toLowerCase()));
  return named ? sources[named]! : null;
}

/** "decl:11.1" sits under "decl:11" when that provision exists. Nothing is guessed beyond the id. */
export function parentKeyFor(id: string, ids: Set<string>): string | null {
  const cut = id.lastIndexOf(".");
  if (cut <= id.indexOf(":")) return null;
  const parent = id.slice(0, cut);
  return ids.has(parent) ? parent : null;
}

/** The "## Transcriber's notes" section of a transcription, as written, or null. */
export function transcriberNotes(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const at = markdown.search(/^## Transcriber[’']s notes\s*$/m);
  return at === -1 ? null : markdown.slice(at);
}

export function buildImportPlan(
  manifest: SeedManifest,
  provisions: SeedProvision[],
  flagsFile: SeedFlagsFile,
  options: {
    /** transcription_file → file contents, verbatim */
    transcriptions?: Record<string, string>;
    flagStatus?: "confirmed" | "suggested";
    links?: SeedLink[];
  } = {}
): ImportPlan {
  const { transcriptions = {}, flagStatus = "confirmed", links = [] } = options;
  const o = manifest.organization;
  const docKeys = new Set(manifest.documents.map((d) => d.id));
  const provKeys = new Set(provisions.map((p) => p.id));

  const problems: string[] = [];
  if (provKeys.size !== provisions.length) problems.push("duplicate provision ids");
  for (const d of manifest.documents) if (d.amends && !docKeys.has(d.amends)) problems.push(`document ${d.id} amends unknown ${d.amends}`);
  for (const p of provisions) if (!docKeys.has(p.document_id)) problems.push(`provision ${p.id} names unknown document ${p.document_id}`);
  for (const f of flagsFile.flags) {
    for (const id of f.provision_ids) if (!provKeys.has(id)) problems.push(`flag "${f.topic}" names unknown provision ${id}`);
    if (!(RELATIONSHIPS as readonly string[]).includes(f.relationship)) problems.push(`flag "${f.topic}" has unknown relationship ${f.relationship}`);
  }
  for (const l of links) for (const k of [l.from, l.to]) if (!provKeys.has(k)) problems.push(`link names unknown provision ${k}`);
  const flagKeys = flagsFile.flags.map((f) => flagKey(f.topic));
  if (new Set(flagKeys).size !== flagKeys.length) problems.push("two flags share a topic key");
  if (problems.length) throw new Error(`Seed is inconsistent:\n- ${problems.join("\n- ")}`);

  const referenceCodes = [...new Set(flagsFile.flags.flatMap((f) => splitStatuteRef(f.statute_ref)))];

  return {
    organization: {
      state: o.state ?? null,
      regime: o.regime ?? null,
      governing_statute: o.governing_statute ?? null,
      original_statute_cited: o.original_statute_cited ?? null,
      incorporates_future_amendments: o.kaufman_language ?? null,
      incorporates_future_amendments_note: o.kaufman_note ?? null,
    },
    documents: manifest.documents.map((d, i) => {
      const transcription = d.transcription_file ? (transcriptions[d.transcription_file] ?? null) : null;
      return {
        key: d.id,
        amendsKey: d.amends,
        data: {
          source_key: d.id,
          sort: i + 1,
          title: d.title,
          kind: d.kind,
          citation_prefix: d.citation_prefix,
          or_book: d.or_book,
          or_page_start: d.or_page_start,
          or_page_end: d.or_page_end,
          executed_on: d.executed_on,
          recorded_on: d.recorded_on,
          clerk_file_no: d.clerk_file_no,
          county: d.county,
          status: "published",
          transcription,
          transcriber_notes: transcriberNotes(transcription),
        },
      };
    }),
    provisions: provisions.map((p) => ({
      key: p.id,
      documentKey: p.document_id,
      parentKey: parentKeyFor(p.id, provKeys),
      data: {
        source_key: p.id,
        sort: p.order,
        citation: p.citation,
        original_label: null, // TODO: not in the seed; set in review rather than parsed out of the text
        heading: p.heading,
        text: p.text,
        text_format: "markdown",
        or_page_start: p.or_page_start,
        or_page_end: p.or_page_end,
        review_state: "reviewed",
        block_type: "text",
      },
    })),
    references: referenceCodes.map((code) => {
      const source = sourceFor(code, flagsFile._meta.sources);
      return {
        code,
        data: {
          jurisdiction: flagsFile._meta.jurisdiction,
          code,
          title: null,
          summary: null,
          url: source?.url ?? null,
          edition: source?.edition ?? null,
          checked_on: flagsFile._meta.verified_on,
        },
      };
    }),
    flags: flagsFile.flags.map((f) => ({
      key: flagKey(f.topic),
      provisionKeys: f.provision_ids,
      referenceCodes: splitStatuteRef(f.statute_ref),
      data: {
        source_key: flagKey(f.topic),
        topic: f.topic,
        document_rule: f.document_rule,
        statute_rule: f.statute_rule,
        statute_citation: f.statute_ref,
        relationship: f.relationship,
        severity: f.severity,
        note: f.note ?? null,
        status: flagStatus,
        origin: "curated",
      },
    })),
    links,
  };
}

/** What the import needs from a database. `match` is field → exact value. */
export type ImportStore = {
  findOne(collection: string, match: Row): Promise<({ id: string } & Row) | null>;
  create(collection: string, data: Row): Promise<string>;
  update(collection: string, id: string, data: Row): Promise<void>;
};

export type ImportResult = {
  stats: Record<string, { created: number; updated: number; unchanged: number }>;
  /** Provisions whose stored text no longer equals the seed. Reported, never overwritten. */
  textDiffers: string[];
};

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

export async function applyImportPlan(store: ImportStore, organizationId: string, plan: ImportPlan): Promise<ImportResult> {
  const stats: ImportResult["stats"] = {};
  const textDiffers: string[] = [];

  async function upsert(collection: string, match: Row, data: Row): Promise<string> {
    const s = (stats[collection] ??= { created: 0, updated: 0, unchanged: 0 });
    const existing = await store.findOne(collection, match);
    if (!existing) {
      s.created++;
      return store.create(collection, { ...match, ...data });
    }
    const frozen = CREATE_ONLY[collection] ?? [];
    const changes: Row = {};
    for (const [k, v] of Object.entries(data)) {
      if (frozen.includes(k)) continue;
      if (!same(existing[k], v)) changes[k] = v;
    }
    if (collection === C.provisions && existing.text !== data.text) textDiffers.push(String(data.source_key));
    if (Object.keys(changes).length) {
      s.updated++;
      await store.update(collection, existing.id, changes);
    } else s.unchanged++;
    return existing.id;
  }

  const docIds = new Map<string, string>();
  for (const d of plan.documents) {
    docIds.set(d.key, await upsert(C.documents, { organization: organizationId, source_key: d.key }, d.data));
  }
  // Second pass: `amends` needs every document to exist first.
  for (const d of plan.documents) {
    const amends = d.amendsKey ? docIds.get(d.amendsKey)! : null;
    const row = await store.findOne(C.documents, { organization: organizationId, source_key: d.key });
    if (row && !same(row.amends, amends)) await store.update(C.documents, row.id, { amends });
  }

  const provIds = new Map<string, string>();
  for (const p of plan.provisions) {
    const id = await upsert(
      C.provisions,
      { organization: organizationId, source_key: p.key },
      { ...p.data, document: docIds.get(p.documentKey)! }
    );
    provIds.set(p.key, id);
  }
  for (const p of plan.provisions) {
    const parent = p.parentKey ? provIds.get(p.parentKey)! : null;
    const row = await store.findOne(C.provisions, { organization: organizationId, source_key: p.key });
    if (row && !same(row.parent, parent)) await store.update(C.provisions, row.id, { parent });
  }

  for (const l of plan.links) {
    await upsert(
      C.links,
      { organization: organizationId, from_provision: provIds.get(l.from)!, to_provision: provIds.get(l.to)!, type: l.type },
      { note: l.note }
    );
  }

  const refIds = new Map<string, string>();
  for (const r of plan.references) {
    const { jurisdiction, code, ...rest } = r.data;
    refIds.set(r.code, await upsert(C.references, { jurisdiction, code }, rest));
  }

  for (const f of plan.flags) {
    const flagId = await upsert(C.flags, { organization: organizationId, source_key: f.key }, f.data);
    for (const [i, key] of f.provisionKeys.entries()) {
      await upsert(C.flagProvisions, { flag: flagId, provision: provIds.get(key)! }, { sort: i + 1 });
    }
    for (const [i, code] of f.referenceCodes.entries()) {
      await upsert(C.flagReferences, { flag: flagId, reference: refIds.get(code)! }, { sort: i + 1 });
    }
  }

  return { stats, textDiffers };
}
