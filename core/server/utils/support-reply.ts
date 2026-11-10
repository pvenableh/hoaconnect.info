// The signed Reply-To on support emails (operator console Session G):
// `support+<requestId>.<signature>@<reply domain>`. The signature is an HMAC of
// the request id and the recipient's user id, keyed by SUPPORT_REPLY_SECRET, so
// a reply can only land on that request, as that person.
//
// SUPPORT_REPLY_SECRET is also the on switch. Unset, support emails carry no
// Reply-To and every inbound post is refused. Set it only once the reply
// domain's MX and SendGrid's Inbound Parse setting are live, or replies bounce.
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_SUPPORT_REPLY_DOMAIN,
  REPLY_SIGNATURE_LENGTH,
  supportReplyLocalPart,
} from "#core/shared/support/inbound";

export function supportReplyDomain(): string {
  return (process.env.SUPPORT_REPLY_DOMAIN || DEFAULT_SUPPORT_REPLY_DOMAIN).trim().toLowerCase();
}

const secret = () => process.env.SUPPORT_REPLY_SECRET || "";

export const supportReplyEnabled = () => secret().length > 0;

export function supportReplySignature(requestId: string, userId: string): string {
  return createHmac("sha256", secret())
    .update(`support-reply:${requestId.toLowerCase()}:${userId}`)
    .digest("hex")
    .slice(0, REPLY_SIGNATURE_LENGTH);
}

/** Constant-time: does this signature belong to this request and person? */
export function supportReplySignatureMatches(requestId: string, userId: string, signature: string): boolean {
  if (!supportReplyEnabled()) return false;
  const want = Buffer.from(supportReplySignature(requestId, userId));
  const got = Buffer.from(String(signature ?? "").toLowerCase());
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The Reply-To for one recipient of a support email, or null while replies by email are off. */
export function supportReplyTo(requestId: string, userId: string | null | undefined): { email: string; name: string } | null {
  if (!supportReplyEnabled() || !requestId || !userId) return null;
  return {
    email: `${supportReplyLocalPart(requestId.toLowerCase(), supportReplySignature(requestId, userId))}@${supportReplyDomain()}`,
    name: "HOA Connect Support",
  };
}
