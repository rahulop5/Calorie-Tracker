import type { LoginInput, PublicUser, RegisterInput } from '@tracker/shared';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { authDao } from './auth.dao';
import { hashPassword, verifyPassword } from './password';
import { createRefreshToken, hashRefreshToken, signAccessToken } from './tokens';

export type AuthSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
};

/** Keeps the password hash from ever reaching a response body. */
function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

function refreshExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);

  return expiresAt;
}

async function startSession(user: UserRow): Promise<AuthSession> {
  const { token, tokenHash } = createRefreshToken();
  const refreshTokenExpiresAt = refreshExpiry();

  await authDao.createRefreshToken({
    userId: user.id,
    tokenHash,
    expiresAt: refreshTokenExpiresAt,
  });

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken: token,
    refreshTokenExpiresAt,
  };
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthSession> {
    const existing = await authDao.findUserByEmail(input.email);

    if (existing) {
      throw AppError.conflict('An account with that email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authDao.createUser({
      email: input.email,
      passwordHash,
      name: input.name,
    });

    return startSession(user);
  },

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await authDao.findUserByEmail(input.email);

    // Same message for an unknown email and a wrong password.
    if (!user) {
      throw AppError.unauthorized('Email or password is incorrect');
    }

    const matches = await verifyPassword(user.passwordHash, input.password);

    if (!matches) {
      throw AppError.unauthorized('Email or password is incorrect');
    }

    return startSession(user);
  },

  async refresh(token: string | undefined): Promise<AuthSession> {
    if (!token) {
      throw AppError.unauthorized('Missing refresh token');
    }

    const stored = await authDao.findRefreshToken(hashRefreshToken(token));

    if (!stored) {
      throw AppError.unauthorized('Refresh token is invalid');
    }

    // A revoked token coming back means an old one was replayed, so end every
    // session for that user instead of trusting this request.
    if (stored.revokedAt) {
      await authDao.revokeAllForUser(stored.userId);
      throw AppError.unauthorized('Refresh token has already been used');
    }

    if (stored.expiresAt <= new Date()) {
      throw AppError.unauthorized('Refresh token has expired');
    }

    const user = await authDao.findUserById(stored.userId);

    if (!user) {
      throw AppError.unauthorized('Refresh token is invalid');
    }

    const { token: nextToken, tokenHash } = createRefreshToken();
    const refreshTokenExpiresAt = refreshExpiry();

    await authDao.rotateRefreshToken(stored.id, {
      userId: user.id,
      tokenHash,
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      user: toPublicUser(user),
      accessToken: signAccessToken(user.id),
      refreshToken: nextToken,
      refreshTokenExpiresAt,
    };
  },

  /** Idempotent: logging out without a valid cookie is not an error. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await authDao.revokeRefreshToken(hashRefreshToken(token));
  },

  async getUser(userId: string): Promise<PublicUser> {
    const user = await authDao.findUserById(userId);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return toPublicUser(user);
  },
};
