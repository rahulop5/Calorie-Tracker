import type { Prisma } from '@prisma/client';
import { type ChatRole, type ContentBlock, type PaginationQuery, toSkipTake } from '@tracker/shared';
import { prisma } from '../../db';

type NewMessage = {
  conversationId: string;
  seq: number;
  role: ChatRole;
  content: ContentBlock[];
  tokenCount: number | null;
};

export const chatDao = {
  createConversation(userId: string, title: string) {
    return prisma.conversation.create({ data: { userId, title } });
  },

  /** Scoped by userId so one user cannot open another's conversation. */
  findConversation(userId: string, id: string) {
    return prisma.conversation.findFirst({ where: { id, userId } });
  },

  listConversations(userId: string, page: PaginationQuery) {
    const where = { userId };

    return prisma.$transaction([
      prisma.conversation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(page),
      }),
      prisma.conversation.count({ where }),
    ]);
  },

  softDeleteConversation(id: string) {
    return prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /** Ascending by seq: the transcript order, which is what replay needs. */
  listMessages(conversationId: string) {
    return prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
    });
  },

  listMessagePage(conversationId: string, page: PaginationQuery) {
    const where = { conversationId };

    return prisma.$transaction([
      prisma.chatMessage.findMany({ where, orderBy: { seq: 'asc' }, ...toSkipTake(page) }),
      prisma.chatMessage.count({ where }),
    ]);
  },

  async nextSeq(conversationId: string): Promise<number> {
    const last = await prisma.chatMessage.findFirst({
      where: { conversationId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });

    return (last?.seq ?? 0) + 1;
  },

  createMessages(messages: NewMessage[]) {
    return prisma.chatMessage.createMany({
      data: messages.map((message) => ({
        ...message,
        // Our block union is JSON-shaped; the cast keeps Prisma's JSON type at
        // this boundary instead of leaking it into the service.
        content: message.content as unknown as Prisma.InputJsonValue,
      })),
    });
  },

  /** Bumped on every message, because the sidebar is ordered by recency. */
  touchConversation(id: string, title?: string) {
    return prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date(), ...(title ? { title } : {}) },
    });
  },
};
