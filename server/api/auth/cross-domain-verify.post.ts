// server/api/auth/cross-domain-verify.post.ts
// Verifies a cross-domain auth token and establishes a session on the custom domain

import { createHmac, createDecipheriv } from 'crypto';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const token = body?.token;

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required',
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

  // Decrypt the token
  const payload = decryptCrossDomainToken(token, secret);

  if (!payload) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid token',
    });
  }

  // Check token expiration
  if (Date.now() > payload.tokenExpiresAt) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Token expired',
    });
  }

  // Validate payload has required fields
  if (!payload.user || !payload.secure?.directusAccessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid token payload',
    });
  }

  // Establish session on this domain
  await setUserSession(event, {
    user: payload.user,
    loggedInAt: payload.loggedInAt,
    expiresAt: payload.expiresAt,
    secure: payload.secure,
  });

  return {
    success: true,
    user: {
      id: payload.user.id,
      email: payload.user.email,
      firstName: payload.user.firstName,
      lastName: payload.user.lastName,
      role: payload.user.role,
      organization: payload.user.organization,
    },
  };
});

// Decrypt function (duplicated here to avoid module import issues)
function decryptCrossDomainToken(token: string, secret: string): any {
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
    console.error('[cross-domain-verify] Decryption failed:', error);
    return null;
  }
}
