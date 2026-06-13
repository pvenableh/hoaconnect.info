// SendGrid Event Webhook signature verification (ECDSA / P-256, SHA-256).
//
// When "Signed Event Webhook" is enabled in SendGrid, each POST carries:
//   X-Twilio-Email-Event-Webhook-Signature  (base64 DER ECDSA signature)
//   X-Twilio-Email-Event-Webhook-Timestamp  (unix seconds)
// and the signed message is `timestamp + rawBody`. The verification key shown
// in SendGrid settings is a base64 DER (SPKI) EC public key.
//
// This mirrors what @sendgrid/eventwebhook does internally (convert key → ECDSA
// public key, verify SHA-256 over timestamp+payload) using only node:crypto, so
// no extra dependency is needed. Pure + framework-free → unit-testable.

import { createPublicKey, createVerify } from "node:crypto";

export const SENDGRID_SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
export const SENDGRID_TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

export interface SendgridVerifyInput {
  /** Base64 DER (SPKI) EC public key from SendGrid → Signed Event Webhook. */
  publicKey: string;
  /** The exact raw request body (bytes as received). */
  payload: string;
  /** X-Twilio-Email-Event-Webhook-Signature header (base64). */
  signature: string | null | undefined;
  /** X-Twilio-Email-Event-Webhook-Timestamp header. */
  timestamp: string | null | undefined;
}

/** True iff the signature is valid for `timestamp + payload` under `publicKey`. */
export function verifySendgridEventWebhook(input: SendgridVerifyInput): boolean {
  const { publicKey, payload, signature, timestamp } = input;
  if (!publicKey || !signature || !timestamp || payload == null) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const verifier = createVerify("sha256");
    verifier.update(timestamp + payload);
    verifier.end();
    return verifier.verify(key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
