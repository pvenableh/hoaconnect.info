/**
 * The send queue wired to production: Directus as the store, the shared
 * renderer, SendGrid as `deliver`. The cron route and send.post's inline tick
 * both come through here (docs/spec-email-send-queue.md §7).
 */

import * as sdk from "@directus/sdk";
import { sendOrganizationEmail } from "./sendgrid";
import { INLINE_BUDGET_MS, TICK_BUDGET_MS } from "./email-send-constants";
import {
  deriveProgress,
  directusRecipientStore,
  EMAIL_QUEUE_FIELDS,
  runBatch,
  ZERO_COUNTS,
  type EmailQueueState,
  type SendProgress,
  runSendTick,
  type QueueRow,
  type RunDeps,
  type RunResult,
  type TickResult,
  type Worker,
} from "./email-send-queue";
import { enqueueDue } from "./email-send-enqueue";
import { finalizeDraft, loadRenderContext, renderDraft, type Draft, type OrgMessage, type RenderTarget } from "./email-send-render";

type DirectusLike = { request: (op: any) => Promise<any> };
const sdkOp = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);

/** A row as the renderer's target: the snapshot's merge values, the decided copies, the webhook's keys. */
export function targetForRow(row: QueueRow): RenderTarget {
  return {
    toEmail: row.recipient_email || "",
    toName: row.recipient_name,
    fields: row.member_fields || {},
    copies: row.copies,
    customArgs: { recipient_id: row.id, run_key: row.run_key },
  };
}

function renderConfig() {
  const config = useRuntimeConfig();
  return {
    appUrl: config.public.appUrl as string,
    directusUrl: config.directus.url as string,
    staticToken: config.directus.staticToken as string,
    templateId: (config.sendgridEmailTemplateId as string | undefined) || undefined,
  };
}

export function queueRunDeps(directus: DirectusLike, emailId: string): RunDeps<Draft, OrgMessage> {
  return {
    load: async () => {
      const ctx = await loadRenderContext(directus, emailId, renderConfig());
      return {
        emailClass: ctx.emailClass,
        async prepare(rows) {
          const out = new Map<string, { draft: Draft } | { fail: string }>();
          for (const row of rows) {
            if (!row.recipient_email) {
              out.set(row.id, { fail: "No email address" });
              continue;
            }
            try {
              out.set(row.id, { draft: renderDraft(ctx, targetForRow(row)) });
            } catch (e) {
              out.set(row.id, { fail: `Could not render: ${(e as Error)?.message || e}` });
            }
          }
          return out;
        },
        // A copy row has no member: no token, the generic page, no header.
        finalize: (row, draft, live) => finalizeDraft(ctx, draft, row.kind === "member" ? live?.unsubscribe_token ?? null : null),
      };
    },
    deliver: (msg) => sendOrganizationEmail(msg),
  };
}

/** One cron tick across every org. */
export async function runEmailTick(worker: Worker = "cron"): Promise<TickResult> {
  const directus = getTypedDirectus();
  const store = directusRecipientStore(directus);
  const clock = { now: () => Date.now() };
  return runSendTick({
    store,
    worker,
    budgetMs: TICK_BUDGET_MS,
    clock,
    enqueueDue: async () => (await enqueueDue(directus, store, clock, worker)).enqueued.length,
    depsFor: (email) => queueRunDeps(directus, email.id),
  });
}

/** send.post's inline tick for a small send, awaited before the response (§7.3). */
export async function runInlineTick(emailId: string): Promise<RunResult> {
  const directus = getTypedDirectus();
  return runBatch({
    store: directusRecipientStore(directus),
    emailId,
    worker: "inline",
    budgetMs: INLINE_BUDGET_MS,
    clock: { now: () => Date.now() },
    ...queueRunDeps(directus, emailId),
  });
}

/** The progress object (§5.4): the email row plus one aggregate. */
export async function readSendProgress(directus: DirectusLike, emailId: string): Promise<SendProgress | null> {
  const store = directusRecipientStore(directus);
  const email = (await directus.request(
    sdkOp("readItem")("hoa_emails", emailId, { fields: [...EMAIL_QUEUE_FIELDS, "send_errors", "date_updated"] })
  )) as (EmailQueueState & { send_errors?: unknown; date_updated?: string | null }) | null;
  if (!email) return null;
  const counts = email.send_run_key ? await store.counts(emailId, email.send_run_key) : { ...ZERO_COUNTS };
  return deriveProgress(email, counts);
}
