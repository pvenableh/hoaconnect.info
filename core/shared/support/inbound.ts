// Emailed replies to support requests (operator console Session G). The pure
// parts: the reply address's shape, who an email is from, whether it's an
// auto-reply, and cutting the quoted history off a reply. The signing and the
// Directus side are in core/server/utils/support-inbound.ts.

/** The reply domain's default; `SUPPORT_REPLY_DOMAIN` overrides it. Its MX points at mx.sendgrid.net. */
export const DEFAULT_SUPPORT_REPLY_DOMAIN = "reply.hoaconnect.info";

/** Hex characters of HMAC-SHA256 kept in the address: 64 bits, and the local part stays under 64 characters. */
export const REPLY_SIGNATURE_LENGTH = 16;

/** SendGrid retries a failed post for up to 3 days, so a repeat inside that window is the same email. */
export const INBOUND_DUPLICATE_DAYS = 3;

const ADDRESS = /support\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]+)@([a-z0-9.-]+)/i;

/** `support+<requestId>.<signature>@<domain>` */
export function supportReplyLocalPart(requestId: string, signature: string): string {
  return `support+${requestId}.${signature}`;
}

/**
 * The first support reply address among these recipients, on our domain.
 * Lower-cased: some mail systems change the case of the local part.
 */
export function findSupportReplyAddress(
  recipients: readonly string[],
  domain: string
): { requestId: string; signature: string } | null {
  const want = domain.trim().toLowerCase();
  for (const raw of recipients) {
    for (const piece of String(raw ?? "").split(",")) {
      const m = ADDRESS.exec(piece);
      if (m && m[3]!.toLowerCase() === want) return { requestId: m[1]!.toLowerCase(), signature: m[2]!.toLowerCase() };
    }
  }
  return null;
}

/** The address in a From header (`"Name" <a@b>` or `a@b`), lower-cased; null when there isn't one. */
export function emailAddressOf(header: string | null | undefined): string | null {
  const s = String(header ?? "").trim();
  if (!s) return null;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(s);
  const bare = angle ? angle[1]! : /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(s)?.[1];
  return bare ? bare.toLowerCase() : null;
}

/**
 * Out-of-office and other machine replies (RFC 3834, and the headers mail
 * systems used before it). They'd otherwise post into the thread and email HOA
 * Connect every time.
 */
export function isAutoReply(headers: string | null | undefined): boolean {
  const h = String(headers ?? "");
  return (
    /^auto-submitted:\s*(?!no\b)\S/im.test(h) ||
    /^x-autoreply:/im.test(h) ||
    /^x-autorespond:/im.test(h) ||
    /^x-auto-response-suppress:\s*(all|oof)/im.test(h) ||
    /^precedence:\s*(auto_reply|bulk|junk|list)\b/im.test(h)
  );
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** A plain-text reading of an HTML-only email, with the quoted part already gone. */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*<\/blockquote>/gi, "")
    .replace(/<div[^>]*class="[^"]*(gmail_quote|moz-cite-prefix|yahoo_quoted)[^"]*"[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

// Where the quoted history starts, as the common mail apps write it.
const QUOTE_HEADERS: RegExp[] = [
  /^On\s.{4,}\swrote:\s*$/i, // Gmail, Apple Mail, Thunderbird
  /^-{2,}\s*Original Message\s*-{2,}$/i, // Outlook (older)
  /^-{2,}\s*Forwarded message\s*-{2,}$/i,
  /^_{10,}$/, // Outlook's rule above its header block
  /^Begin forwarded message:$/i,
];

const SIGN_OFFS = [/^Sent from my \S+/i, /^Get Outlook for \S+/i, /^Sent from (Mail|Outlook|Yahoo Mail) for \S+/i];

/**
 * The new part of a reply: everything above the quoted history, without `>`
 * lines, the signature (`-- `), or "Sent from my iPhone". Inline answers below
 * the quote header are lost; that's the usual trade every helpdesk makes.
 */
export function stripQuotedReply(text: string): string {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (QUOTE_HEADERS.some((re) => re.test(t))) break;
    // Gmail wraps a long header: "On Tue, Nov 10, 2026 at 3:04 PM HOA Connect <…>" / "wrote:".
    if (/^On\s/i.test(t) && /^\S*.*wrote:\s*$/i.test(lines[i + 1]?.trim() ?? "") && (lines[i + 1]?.trim().length ?? 0) < 60) break;
    // Outlook's header block: "From: …" then "Sent:" or "Date:" within a few lines.
    if (/^From:\s/i.test(t) && lines.slice(i + 1, i + 5).some((l) => /^(Sent|Date):\s/i.test(l.trim()))) break;
    if (t === "--" || lines[i] === "-- ") break;
    if (t.startsWith(">")) continue;
    out.push(lines[i]!);
  }
  while (out.length && (!out.at(-1)!.trim() || SIGN_OFFS.some((re) => re.test(out.at(-1)!.trim())))) out.pop();
  return out
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
