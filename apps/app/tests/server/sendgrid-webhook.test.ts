import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifySendgridEventWebhook } from "#core/server/utils/sendgrid-webhook";

// Generate a real P-256 keypair and sign like SendGrid does, so the test
// exercises the actual ECDSA/SHA-256 verification path (not a mock).
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyB64 = (publicKey.export({ format: "der", type: "spki" }) as Buffer).toString("base64");

function sign(timestamp: string, payload: string): string {
  const signer = createSign("sha256");
  signer.update(timestamp + payload);
  signer.end();
  return signer.sign(privateKey).toString("base64");
}

const timestamp = "1718900000";
const payload = JSON.stringify([{ email: "a@b.com", event: "delivered" }]);

describe("verifySendgridEventWebhook", () => {
  it("accepts a correctly signed payload", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature, timestamp })
    ).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({
        publicKey: publicKeyB64,
        payload: payload + " ",
        signature,
        timestamp,
      })
    ).toBe(false);
  });

  it("rejects a mismatched timestamp (replay binding)", () => {
    const signature = sign(timestamp, payload);
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature, timestamp: "1718900001" })
    ).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signer = createSign("sha256");
    signer.update(timestamp + payload);
    signer.end();
    const foreignSignature = signer.sign(other.privateKey).toString("base64");
    expect(
      verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: foreignSignature, timestamp })
    ).toBe(false);
  });

  it("returns false on missing inputs or a garbage key", () => {
    expect(verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: null, timestamp })).toBe(false);
    expect(verifySendgridEventWebhook({ publicKey: publicKeyB64, payload, signature: "x", timestamp: null })).toBe(false);
    expect(verifySendgridEventWebhook({ publicKey: "not-a-key", payload, signature: "x", timestamp })).toBe(false);
  });
});
