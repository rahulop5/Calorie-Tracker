import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';

const accessTokenPayloadSchema = z.object({ sub: z.uuid() });
type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw AppError.unauthorized('Access token is invalid or has expired');
  }

  const payload = accessTokenPayloadSchema.safeParse(decoded);

  if (!payload.success) {
    throw AppError.unauthorized('Access token payload is malformed');
  }

  return payload.data;
}

/**
 * Refresh tokens are 384 bits of randomness, so a fast hash is the right choice.
 * argon2 exists to slow down guessing of low-entropy passwords; there is nothing
 * to guess here, and we hash only so a database leak cannot be replayed.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString('base64url');

  return { token, tokenHash: hashRefreshToken(token) };
}
