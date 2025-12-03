// server/api/auth/cross-domain-token.post.ts
// Generates a short-lived, encrypted token for cross-domain authentication
// This allows session transfer when redirecting to custom domains

import { createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session?.user || !session?.secure?.directusAccessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated',
    });
  }

  const body = await readBody(event);
  const targetDomain = body?.targetDomain;

  if (!targetDomain) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Target domain is required',
    });
  }

  const config = useRuntimeConfig();
  const secret = config.sessionPassword;

  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Server configuration error',
    });
  }

  // Create token payload with session data
  const payload = {
    user: session.user,
    secure: session.secure,
    loggedInAt: session.loggedInAt,
    expiresAt: session.expiresAt,
    targetDomain,
    createdAt: Date.now(),
    // Token valid for 60 seconds
    tokenExpiresAt: Date.now() + 60000,
    nonce: randomBytes(16).toString('hex'),
  };

  // Encrypt the payload
  const iv = randomBytes(16);
  const key = createHmac('sha256', secret).update('cross-domain-key').digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const payloadStr = JSON.stringify(payload);
  let encrypted = cipher.update(payloadStr, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  const token = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ]).toString('base64url');

  return {
    token,
    expiresIn: 60,
  };
});

// Export decryption utility for use in verify endpoint
export function decryptCrossDomainToken(token: string, secret: string): any {
  try {
    const data = Buffer.from(token, 'base64url');

    // Extract IV (16 bytes), authTag (16 bytes), and encrypted data
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const key = createHmac('sha256', secret).update('cross-domain-key').digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error('[cross-domain-token] Decryption failed:', error);
    return null;
  }
}
