// Emailed replies land in the request's thread (operator console Session G).
// SendGrid Inbound Parse posts each email to the reply domain to
// POST /api/support/inbound/<SUPPORT_INBOUND_TOKEN> as multipart form data. This
// turns that post into a reply through `addSupportMessage`, so the
// notifications and status changes are the same as a reply in the app.
//
// Who it's from: the signed Reply-To (support-reply.ts) names the request and,
// through its HMAC, one person who could have received the email. The From
// address must be that person's account email (Peter's call, 2026-11-10), and
// they must still be allowed to reply (`supportAccess`). Staff reply in the
// console: their notices go to the support inbox, never with this address.
//
// Inbound Parse doesn't sign its posts and retries anything but a 2xx for up to
// 3 days, so every refusal is an outcome (answered 200 by the route), and a
// repeat of a reply already posted is recognised and dropped.
import { readItems } from "@directus/sdk";
import { BODY_MAX, supportAccess } from "#core/shared/support/access";
import { ATTACHMENTS_PER_MESSAGE, attachmentProblem, bytesMatchType } from "#core/shared/support/attachments";
import {
  emailAddressOf,
  findSupportReplyAddress,
  htmlToText,
  INBOUND_DUPLICATE_DAYS,
  isAutoReply,
  stripQuotedReply,
} from "#core/shared/support/inbound";
import { opsUsers } from "./ops-data";
import { rateLimit } from "./rate-limit";
import { addSupportMessage, readSupportRequest, supportViewerForUser } from "./support";
import { messageAttachments, storeSupportAttachment } from "./support-attachments";
import { supportReplyDomain, supportReplyEnabled, supportReplySignatureMatches } from "./support-reply";

export interface InboundEmail {
  /** The From header. */
  from: string;
  /** Envelope recipients first, then the To and Cc headers. */
  recipients: string[];
  /** The raw header block, for the auto-reply check. */
  headers: string;
  text: string;
  html: string;
  attachments: Array<{ name: string; data: Uint8Array; inline?: boolean }>;
}

export type InboundOutcome =
  | "posted"
  | "duplicate"
  | "not-configured"
  | "no-address"
  | "auto-reply"
  | "unknown-request"
  | "bad-signature"
  | "wrong-sender"
  | "no-access"
  | "rate-limited"
  | "empty";

/** Inline images this small are signature logos and social icons, not something the person attached. */
const INLINE_LOGO_BYTES = 16 * 1024;

const readAny = readItems as any;
const directus = () => getTypedDirectus() as any;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

// ── SendGrid's post ─────────────────────────────────────────────────────────

interface Part {
  name?: string;
  filename?: string;
  type?: string;
  data: Uint8Array;
}

function decoder(charset: string | undefined): TextDecoder {
  try {
    return new TextDecoder(charset || "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

const parseJson = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/**
 * Inbound Parse's default ("parsed") post: text fields, `envelope` and
 * `charsets` as JSON, `attachment-info` as JSON, and files `attachment1…N`.
 * The raw-MIME option must stay off in SendGrid.
 */
export function parseSendGridInbound(parts: readonly Part[]): InboundEmail {
  const raw = (name: string) => parts.find((p) => p.name === name && !p.filename)?.data;
  const charsets = (parseJson(new TextDecoder().decode(raw("charsets") ?? new Uint8Array())) ?? {}) as Record<string, string>;
  const field = (name: string) => {
    const d = raw(name);
    return d ? decoder(charsets[name]).decode(d) : "";
  };
  const envelope = parseJson(field("envelope")) ?? {};
  const info = (parseJson(field("attachment-info")) ?? {}) as Record<string, { filename?: string; "content-id"?: string }>;
  const attachments = parts
    .filter((p) => p.filename && /^attachment\d+$/.test(p.name ?? ""))
    .map((p) => ({
      name: (info[p.name!]?.filename || p.filename || "file").trim().slice(0, 200),
      data: new Uint8Array(p.data),
      inline: !!info[p.name!]?.["content-id"],
    }));
  return {
    from: field("from"),
    recipients: [...(Array.isArray(envelope.to) ? envelope.to.map(String) : []), field("to"), field("cc")].filter(Boolean),
    headers: field("headers"),
    text: field("text"),
    html: field("html"),
    attachments,
  };
}

// ── The reply ───────────────────────────────────────────────────────────────

/** Everyone who could have received a support email about this request: the requester and its admins. */
async function replyCandidates(req: any): Promise<string[]> {
  const config = useRuntimeConfig();
  const org = idOf(req.organization);
  const account = idOf(req.billing_account);
  const [admins, accountAdmins] = await Promise.all([
    org
      ? (directus().request(
          readAny("hoa_members", {
            filter: { organization: { _eq: org }, role: { _eq: config.public.directusRoleHoaAdmin }, status: { _eq: "active" } },
            fields: ["user"],
            limit: -1,
          })
        ) as Promise<any[]>)
      : Promise.resolve([]),
    account
      ? (directus()
          .request(
            readAny("billing_account_members", {
              filter: { billing_account: { _eq: account }, role: { _in: ["owner", "billing_admin"] } },
              fields: ["user"],
              limit: -1,
            })
          )
          .catch(() => []) as Promise<any[]>)
      : Promise.resolve([]),
  ]);
  const ids = [idOf(req.requester), ...(admins ?? []).map((a) => idOf(a.user)), ...(accountAdmins ?? []).map((a) => idOf(a.user))];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

const fingerprint = (body: string, names: readonly string[]) => JSON.stringify([body.trim(), [...names].sort()]);

/** A message this person already posted on this request inside SendGrid's retry window, with the same words and files. */
async function alreadyPosted(requestId: string, userId: string, body: string, names: string[]): Promise<boolean> {
  const since = new Date(Date.now() - INBOUND_DUPLICATE_DAYS * 86_400_000).toISOString();
  const rows = (await getTypedDirectus().request(
    readItems("support_messages", {
      filter: { request: { _eq: requestId }, author: { _eq: userId }, date_created: { _gte: since } as any },
      fields: ["body", "attachments"],
      limit: -1,
    })
  )) as any[];
  const mine = fingerprint(body, names);
  return (rows ?? []).some((m) => fingerprint(String(m.body ?? ""), messageAttachments(m).map((a) => a.name)) === mine);
}

/**
 * Post one emailed reply, or say why not. Throws only on a Directus failure,
 * which the route answers 500 so SendGrid tries again; `alreadyPosted` makes the
 * retry harmless.
 */
export async function receiveSupportEmail(email: InboundEmail): Promise<{ outcome: InboundOutcome; messageId?: string }> {
  if (!supportReplyEnabled()) return { outcome: "not-configured" };
  const address = findSupportReplyAddress(email.recipients, supportReplyDomain());
  if (!address) return { outcome: "no-address" };
  if (isAutoReply(email.headers)) return { outcome: "auto-reply" };

  const req = await readSupportRequest(address.requestId);
  if (!req) return { outcome: "unknown-request" };
  const userId = (await replyCandidates(req)).find((id) => supportReplySignatureMatches(req.id, id, address.signature));
  if (!userId) return { outcome: "bad-signature" };

  const sender = emailAddressOf(email.from);
  const account = (await opsUsers([userId]))?.get(userId);
  if (!sender || !account?.email || account.email.trim().toLowerCase() !== sender) return { outcome: "wrong-sender" };

  const viewer = await supportViewerForUser(userId, false);
  const access = supportAccess(viewer, {
    requester: idOf(req.requester),
    organization: idOf(req.organization),
    billing_account: idOf(req.billing_account),
  });
  if (!access || access === "staff") return { outcome: "no-access" };
  // The in-app reply's limit, on the same key.
  if (!rateLimit(`support-msg:${userId}`, 30, 60 * 60_000)) return { outcome: "rate-limited" };

  // The files: Session F's rules, checked before anything is stored. A file that
  // fails them is named in the message rather than refusing the whole reply.
  const accepted: InboundEmail["attachments"] = [];
  const leftOff: string[] = [];
  for (const file of email.attachments) {
    if (file.inline && file.data.byteLength < INLINE_LOGO_BYTES) continue;
    const problem =
      attachmentProblem({ name: file.name, size: file.data.byteLength }) ??
      (bytesMatchType(file.name, file.data) ? null : `${file.name} isn't the kind of file its name says.`);
    if (problem) leftOff.push(problem);
    else if (accepted.length >= ATTACHMENTS_PER_MESSAGE) leftOff.push(`${file.name}: only ${ATTACHMENTS_PER_MESSAGE} files fit on one message.`);
    else accepted.push(file);
  }

  let body = stripQuotedReply(email.text || htmlToText(email.html));
  if (leftOff.length) body = `${body}\n\n(Not attached from the email: ${leftOff.join(" ")})`.trim();
  if (body.length > BODY_MAX) body = `${body.slice(0, BODY_MAX - 1)}…`;
  if (!body && !accepted.length) return { outcome: "empty" };

  if (await alreadyPosted(req.id, userId, body, accepted.map((f) => f.name))) return { outcome: "duplicate" };

  const ids: string[] = [];
  for (const file of accepted) ids.push((await storeSupportAttachment({ userId, name: file.name, data: file.data })).id);
  const row = await addSupportMessage({ request: req, author: { id: userId }, kind: access, body, attachmentIds: ids });
  return { outcome: "posted", messageId: row.id };
}
