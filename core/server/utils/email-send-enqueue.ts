/**
 * Enqueue — the snapshot half of the send queue (docs/spec-email-send-queue.md
 * §2.3–2.4, §6.1, §8.1). One `hoa_email_recipients` row per person, written
 * `queued` in send order, then `total_recipients` LAST, all under a `prepare`
 * lease, so no run ever claims from a half-written plan.
 *
 * Phase 3a's rules run here once per send: `checkSendCompliance` (refuse
 * before any write), `partitionAudience` (held-back members become
 * `suppressed` rows with the reason, after every deliverable row), and
 * `ensureUnsubscribeTokens` (one batch; the token is not copied into the row —
 * the run reads the stored one live).
 *
 * Two clients: `send.post.ts` (enqueue, then one inline tick for ≤ INLINE_MAX)
 * and `sendEmailJob` / the tick's enqueue-due (enqueue only).
 */

import * as sdk from "@directus/sdk";
import { createHash } from "node:crypto";
import { partitionAudience, type EmailClass, type SuppressionReason } from "#core/shared/email/email-class";
import { checkSendCompliance } from "#core/shared/email/unsubscribe";
import { DEFAULT_CC_BCC_THRESHOLD } from "#core/shared/email/cc";
import { residencyFor } from "#core/shared/members/residency";
import { emailComplianceSchema, ensureUnsubscribeTokens, MEMBER_SUPPRESSION_FIELDS } from "./email-compliance";
import { resolveMergeFields } from "./email-merge";
import { resolveCcBccEmails } from "./email-cc-contacts";
import { buildUniqueWebSlug } from "./email-branding";
import { SNAPSHOT_BATCH } from "./email-send-constants";
import {
  acquireLease,
  isNotUnique,
  releaseLease,
  scheduledRunKey,
  SendInProgress,
  type Clock,
  type Copies,
  type Hooks,
  type NewRow,
  type RecipientStore,
  type Worker,
} from "./email-send-queue";
import { RENDER_ORG_FIELDS, type RenderOrg } from "./email-send-render";

type DirectusLike = { request: (op: any) => Promise<any> };
const op = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);

/**
 * A send the compliance rules refuse outright (a community email from an org
 * with no postal address; a newsletter marked essential; nobody left to mail).
 * Retrying can't fix it, so the scheduled path marks the email failed instead
 * of rescheduling it.
 */
export class EmailComplianceRefusal extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "EmailComplianceRefusal";
  }
}

/** The member fields an audience read takes: the merge relations plus 3a's flags once they exist. */
export function audienceFields(withSuppression: boolean): unknown[] {
  return [
    "id", "first_name", "last_name", "email", "phone", "member_type", "company",
    "outstanding_balance", "payment_status", "last_payment_amount", "last_payment_date",
    ...(withSuppression ? MEMBER_SUPPRESSION_FIELDS : []),
    // `member_type` and `end_date` are what residencyFor() reads off the link;
    // the rest feeds the unit merge fields.
    { units: ["id", "is_primary_unit", "member_type", "end_date", { unit_id: ["id", "unit_number"] }] },
    { vehicles: ["id", "make", "model", "year", "license_plate", "parking_spot"] },
    { pets: ["id", "name", "type", "breed"] },
  ];
}

export interface AudienceMember {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  unsubscribe_token?: string | null;
  email_bounced?: boolean | null;
  email_community_opt_out?: boolean | null;
  [k: string]: unknown;
}

// ── The plan ────────────────────────────────────────────────────────────────

const MAX_KEY = 160;

/** `${emailId}:${runKey}:m:${memberId}` / `…:a:${address}` — hashed only if an address would overflow the column. */
export function dedupeKey(emailId: string, runKey: string, kind: "m" | "a", value: string): string {
  const key = `${emailId}:${runKey}:${kind}:${value}`;
  if (key.length <= MAX_KEY) return key;
  return `${emailId}:${runKey}:${kind}:#${createHash("sha256").update(value).digest("hex")}`;
}

const nameOf = (m: AudienceMember) => `${m.first_name || ""} ${m.last_name || ""}`.trim() || null;

/**
 * The rows of one occurrence, in position order (§6.1, §8.1):
 *   deliverable members (queued) → CC/BCC copy rows on a large send (queued)
 *   → members with no address (failed) → held-back members (suppressed).
 * `total` counts the queued rows only.
 */
export function planRows(input: {
  emailId: string;
  runKey: string;
  recipients: AudienceMember[];
  suppressed: Array<{ member: AudienceMember; reason: SuppressionReason }>;
  ccEmails: string[];
  bccEmails: string[];
  threshold: number;
  merge: (m: AudienceMember) => Record<string, string>;
}): { rows: NewRow[]; total: number; suppressedCount: number } {
  const { emailId, runKey } = input;
  const deliverable = input.recipients.filter((m) => !!m.email);
  const noAddress = input.recipients.filter((m) => !m.email);
  const small = deliverable.length <= input.threshold;
  const hasCopies = input.ccEmails.length > 0 || input.bccEmails.length > 0;
  const copies: Copies | null = small && hasCopies ? { cc: input.ccEmails, bcc: input.bccEmails } : null;

  const rows: NewRow[] = [];
  let position = 0;
  const base = (m: AudienceMember | null, address: string | null) => ({
    email: emailId,
    run_key: runKey,
    member: m?.id ?? null,
    recipient_email: address,
    recipient_name: m ? nameOf(m) : null,
    copies: null as Copies | null,
    member_fields: null as Record<string, string> | null,
  });

  for (const m of deliverable) {
    rows.push({
      ...base(m, m.email as string),
      kind: "member",
      status: "queued",
      position: ++position,
      dedupe_key: dedupeKey(emailId, runKey, "m", m.id),
      member_fields: input.merge(m),
      copies,
    });
  }

  let copyRows = 0;
  if (!small && hasCopies) {
    // Large send: per-recipient privacy, so each CC/BCC address gets one
    // standalone copy — unless it is already a member row of this occurrence.
    const memberAddresses = new Set(deliverable.map((m) => String(m.email).toLowerCase()));
    for (const address of new Set([...input.ccEmails, ...input.bccEmails].map((a) => a.toLowerCase()))) {
      if (memberAddresses.has(address)) continue;
      rows.push({
        ...base(null, address),
        kind: "copy",
        status: "queued",
        position: ++position,
        dedupe_key: dedupeKey(emailId, runKey, "a", address),
      });
      copyRows++;
    }
  }

  for (const m of noAddress) {
    rows.push({
      ...base(m, null),
      kind: "member",
      status: "failed",
      error_message: "No email address",
      position: ++position,
      dedupe_key: dedupeKey(emailId, runKey, "m", m.id),
    });
  }

  for (const s of input.suppressed) {
    rows.push({
      ...base(s.member, s.member.email || null),
      kind: "member",
      status: "suppressed",
      suppressed_reason: s.reason,
      position: ++position,
      dedupe_key: dedupeKey(emailId, runKey, "m", s.member.id),
    });
  }

  return { rows, total: deliverable.length + copyRows, suppressedCount: input.suppressed.length };
}

// ── The snapshot write ──────────────────────────────────────────────────────

/**
 * Write the plan under a `prepare` lease (§2.3). Refuses with SendInProgress
 * (409) when another run holds the email, or when the email is no longer in
 * the state this enqueue expected (two schedulers, a double-clicked Send) —
 * checked under the lease, so it cannot race the other writer.
 */
export async function writeSnapshot(
  store: RecipientStore,
  input: {
    emailId: string;
    runKey: string;
    rows: NewRow[];
    total: number;
    suppressedCount: number;
    worker: Worker;
    clock: Clock;
    hooks?: Hooks;
    /** The status the email must have now (under the lease) — anything else is a send in progress. */
    expect: (status: string | null) => boolean;
    /** Put back if the snapshot fails for any reason other than a kill. */
    restoreStatus: string;
    batchSize?: number;
  }
): Promise<void> {
  const { emailId, runKey, clock, hooks } = input;
  const lease = await acquireLease(store, emailId, "prepare", input.worker, clock, hooks);
  if (!lease) throw new SendInProgress();
  try {
    const current = await store.readEmail(emailId);
    if (!current || !input.expect(current.status)) throw new SendInProgress();

    await store.updateEmail(emailId, {
      status: "sending",
      send_run_key: runKey,
      send_started_at: new Date(clock.now()).toISOString(),
      send_finished_at: null,
      total_recipients: null,
      total_sent: 0,
      total_failed: 0,
      total_unknown: 0,
      total_suppressed: null,
      send_errors: null,
      send_last_error: null,
    });

    let written = 0;
    try {
      const size = input.batchSize ?? SNAPSHOT_BATCH;
      for (let i = 0; i < input.rows.length; i += size) {
        await store.createRows(input.rows.slice(i, i + size));
        written++;
        await hooks?.step?.("snapshot-batch-written");
      }
      // Last: from here a run may claim.
      await store.updateEmail(emailId, {
        total_recipients: input.total,
        total_suppressed: input.suppressedCount,
        recipient_count: input.total,
      });
      await hooks?.step?.("total-set");
    } catch (e) {
      // Not a kill (a kill never reaches here): undo this occurrence. A dedupe
      // collision means the rows are someone else's — leave them.
      if (written > 0 && !isNotUnique(e)) await store.deleteRows(emailId, runKey).catch(() => {});
      await store
        .updateEmail(emailId, { status: input.restoreStatus, send_run_key: null, send_started_at: null })
        .catch(() => {});
      throw e;
    }
  } finally {
    await releaseLease(store, lease, hooks).catch(() => {});
  }
}

// ── Shared audience steps ───────────────────────────────────────────────────

export interface PreparedAudience {
  recipients: AudienceMember[];
  suppressed: Array<{ member: AudienceMember; reason: SuppressionReason }>;
  stats: { bounced: number; optedOut: number };
}

/** partitionAudience + the token mint, once per send. */
export async function prepareAudience(
  directus: DirectusLike,
  audience: AudienceMember[],
  emailClass: EmailClass,
  tokensAvailable: boolean
): Promise<PreparedAudience> {
  const { recipients, suppressed } = partitionAudience(audience, emailClass);
  const stats = {
    bounced: suppressed.filter((s) => s.reason === "bounced").length,
    optedOut: suppressed.filter((s) => s.reason === "opted_out").length,
  };
  const minted = emailClass === "community" && tokensAvailable ? await ensureUnsubscribeTokens(directus, recipients) : recipients;
  return { recipients: minted, suppressed, stats };
}

export function plannedFor(
  emailId: string,
  runKey: string,
  org: RenderOrg,
  prepared: PreparedAudience,
  cc: { ccEmails: string[]; bccEmails: string[] }
) {
  const threshold = Number((org.settings as { cc_bcc_threshold?: number } | null)?.cc_bcc_threshold) || DEFAULT_CC_BCC_THRESHOLD;
  return planRows({
    emailId,
    runKey,
    recipients: prepared.recipients,
    suppressed: prepared.suppressed,
    ccEmails: cc.ccEmails,
    bccEmails: cc.bccEmails,
    threshold,
    merge: (m) => resolveMergeFields(m, org),
  });
}

// ── The scheduled path ──────────────────────────────────────────────────────

/** Who a saved email goes to, from its stored targeting (owners/tenants resolved by residencyFor). */
export async function resolveScheduledAudience(
  directus: DirectusLike,
  organizationId: string,
  recipientFilter: string,
  recipientIds: string[] | null,
  withSuppression: boolean
): Promise<AudienceMember[]> {
  const filter: Record<string, unknown> = {
    organization: { _eq: organizationId },
    status: { _eq: "active" },
    email: { _nnull: true },
  };
  // Residency lives on the unit link first and falls back to
  // hoa_members.member_type; that rule is not a flat Directus filter, so it is
  // resolved here — fetching the org's active members is tens of rows.
  if (recipientFilter === "custom") {
    if (!recipientIds?.length) return [];
    filter.id = { _in: recipientIds };
  }
  const members = (await directus.request(
    op("readItems")("hoa_members", { filter, fields: audienceFields(withSuppression), limit: -1 })
  )) as AudienceMember[];
  if (recipientFilter !== "owners" && recipientFilter !== "tenants") return members;
  const target = recipientFilter === "owners" ? "owner" : "tenant";
  return members.filter((m) => residencyFor(m as any) === target);
}

/**
 * Enqueue one due scheduled email (the occurrence = its `scheduled_at`).
 * Throws EmailComplianceRefusal for what retrying can't fix, SendInProgress
 * when another scheduler got there first.
 */
export async function enqueueScheduled(
  directus: DirectusLike,
  store: RecipientStore,
  emailId: string,
  clock: Clock,
  worker: Worker = "cron"
): Promise<{ total: number; suppressed: PreparedAudience["stats"] }> {
  const compliance3a = await emailComplianceSchema(directus);
  const email = (await directus.request(
    op("readItem")("hoa_emails", emailId, {
      fields: [
        "id", "organization", "subject", "email_type", "email_class", "status", "scheduled_at",
        "recipient_filter", "recipient_ids", "web_slug", "cc", "bcc",
      ],
    })
  )) as {
    id: string;
    organization: string | { id: string };
    subject?: string | null;
    email_type?: string | null;
    email_class?: string | null;
    status?: string | null;
    scheduled_at?: string | null;
    recipient_filter?: string | null;
    recipient_ids?: unknown;
    web_slug?: string | null;
    cc?: string[] | null;
    bcc?: string[] | null;
  };
  if (!email) throw new EmailComplianceRefusal("not_found", `Email ${emailId} not found`);
  const organizationId = typeof email.organization === "string" ? email.organization : email.organization.id;
  const org = (await directus.request(
    op("readItem")("hoa_organizations", organizationId, { fields: RENDER_ORG_FIELDS })
  )) as RenderOrg;

  const compliance = checkSendCompliance({ emailType: email.email_type, requestedClass: email.email_class, org });
  if (compliance.ok === false) throw new EmailComplianceRefusal(compliance.code, compliance.message);

  const audience = await resolveScheduledAudience(
    directus,
    organizationId,
    email.recipient_filter || "all",
    Array.isArray(email.recipient_ids) ? (email.recipient_ids as string[]) : null,
    compliance3a.members
  );
  const prepared = await prepareAudience(directus, audience, compliance.emailClass, compliance3a.members);
  if (!prepared.recipients.length) {
    throw new EmailComplianceRefusal(
      "all_recipients_suppressed",
      audience.length
        ? `Nobody to send to: of ${audience.length}, ${prepared.stats.bounced} have bounced addresses and ${prepared.stats.optedOut} opted out of community email.`
        : "Nobody to send to: the email's audience has no active members with an address."
    );
  }

  if (!email.web_slug) {
    const taken = (await directus.request(
      op("readItems")("hoa_emails", {
        filter: { organization: { _eq: organizationId }, web_slug: { _nnull: true }, id: { _neq: emailId } },
        fields: ["web_slug"],
        limit: -1,
      })
    )) as Array<{ web_slug?: string | null }>;
    const slug = buildUniqueWebSlug(email.subject || "", new Set(taken.map((r) => r.web_slug).filter(Boolean) as string[]));
    await directus.request(op("updateItem")("hoa_emails", emailId, { web_slug: slug }));
  }

  // CC/BCC: the board at the moment of the send is the board that is copied.
  const ccEmails = await resolveCcBccEmails(organizationId, email.cc);
  const bccEmails = await resolveCcBccEmails(organizationId, email.bcc);
  const runKey = scheduledRunKey(email.scheduled_at, clock.now());
  const plan = plannedFor(emailId, runKey, org, prepared, { ccEmails, bccEmails });

  if (compliance3a.emailClass) {
    await directus.request(op("updateItem")("hoa_emails", emailId, { email_class: compliance.emailClass }));
  }
  await writeSnapshot(store, {
    emailId,
    runKey,
    rows: plan.rows,
    total: plan.total,
    suppressedCount: plan.suppressedCount,
    worker,
    clock,
    expect: (status) => status === "scheduled",
    restoreStatus: "scheduled",
  });
  return { total: plan.total, suppressed: prepared.stats };
}

/**
 * The tick's first phase (and process-scheduled's whole job): every due
 * scheduled email, 25 at a time, enqueued. A compliance refusal marks the
 * email failed (retrying can't fix it); anything else leaves it scheduled
 * for the next tick.
 */
export async function enqueueDue(
  directus: DirectusLike,
  store: RecipientStore,
  clock: Clock,
  worker: Worker = "cron"
): Promise<{ enqueued: string[]; refused: string[]; busy: string[]; errored: string[] }> {
  const due = (await directus.request(
    op("readItems")("hoa_emails", {
      filter: { status: { _eq: "scheduled" }, scheduled_at: { _lte: new Date(clock.now()).toISOString() } },
      fields: ["id"],
      sort: ["scheduled_at"],
      limit: 25,
    })
  )) as Array<{ id: string }>;
  const out = { enqueued: [] as string[], refused: [] as string[], busy: [] as string[], errored: [] as string[] };
  for (const { id } of due || []) {
    try {
      await enqueueScheduled(directus, store, id, clock, worker);
      out.enqueued.push(id);
    } catch (e) {
      if (e instanceof SendInProgress) {
        out.busy.push(id);
      } else if (e instanceof EmailComplianceRefusal) {
        out.refused.push(id);
        await store
          .updateEmail(id, { status: "failed", send_errors: [e.message], send_finished_at: new Date(clock.now()).toISOString() })
          .catch(() => {});
      } else {
        out.errored.push(id);
        console.error(`[email-send-enqueue] ${id} not enqueued:`, e);
      }
    }
  }
  return out;
}
