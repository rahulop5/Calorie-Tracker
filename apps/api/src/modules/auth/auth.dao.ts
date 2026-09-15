import { prisma } from '../../db';

type NewUser = {
  email: string;
  passwordHash: string;
  name: string;
};

type NewRefreshToken = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export const authDao = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: NewUser) {
    return prisma.user.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  createRefreshToken(data: NewRefreshToken) {
    return prisma.refreshToken.create({ data });
  },

  /** Revoke and replace together, so a rotation cannot leave a user with neither. */
  rotateRefreshToken(currentTokenId: string, next: NewRefreshToken) {
    return prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: currentTokenId },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({ data: next }),
    ]);
  },

  revokeRefreshToken(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
