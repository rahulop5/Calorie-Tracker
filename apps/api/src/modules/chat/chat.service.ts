import {
  buildPageMeta,
  type ChatMessage,
  type ChatMessageRecord,
  type Conversation,
  type ContentBlock,
  messageContentSchema,
  type PageMeta,
  type PaginationQuery,
  todayDateOnly,
} from '@tracker/shared';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { chatSystemPrompt } from '../ai/prompts';
import { getProvider } from '../ai/provider';
import type { ChatEvent } from '../ai/provider';
import { createToolset } from '../ai/tools';
import { chatDao } from './chat.dao';
import { type StoredMessage, trimHistory } from './history';

const TITLE_MAX_LENGTH = 80;

type ConversationRow = {
  id: string;
  title: string;
  updatedAt: Date;
};

function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}

type MessageRow = {
  id: string;
  seq: number;
  role: ChatMessage['role'];
  content: unknown;
  tokenCount: number | null;
};

/** Content is validated on read: it is the one column written as loose JSON. */
function parseContent(content: unknown): ContentBlock[] {
  const parsed = messageContentSchema.safeParse(content);

  return parsed.success ? parsed.data : [];
}

function toRecord(row: MessageRow): ChatMessageRecord {
  return { id: row.id, seq: row.seq, role: row.role, content: parseContent(row.content) };
}

function titleFrom(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');

  return trimmed.length > TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : trimmed;
}

async function requireConversation(userId: string, id: string) {
  const conversation = await chatDao.findConversation(userId, id);

  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }

  return conversation;
}

export const chatService = {
  async create(userId: string, title?: string): Promise<Conversation> {
    const row = await chatDao.createConversation(userId, title ?? 'New conversation');

    return toConversation(row);
  },

  async list(
    userId: string,
    page: PaginationQuery,
  ): Promise<{ data: Conversation[]; meta: PageMeta }> {
    const [rows, total] = await chatDao.listConversations(userId, page);

    return { data: rows.map(toConversation), meta: buildPageMeta(total, page) };
  },

  async listMessages(
    userId: string,
    conversationId: string,
    page: PaginationQuery,
  ): Promise<{ data: ChatMessageRecord[]; meta: PageMeta }> {
    await requireConversation(userId, conversationId);

    const [rows, total] = await chatDao.listMessagePage(conversationId, page);

    return { data: rows.map(toRecord), meta: buildPageMeta(total, page) };
  },

  async remove(userId: string, conversationId: string): Promise<void> {
    await requireConversation(userId, conversationId);
    await chatDao.softDeleteConversation(conversationId);
  },

  /**
   * Runs one user message to completion, emitting events as they happen and
   * appending the whole exchange to the transcript.
   */
  async send(
    userId: string,
    conversationId: string,
    text: string,
    onEvent: (event: ChatEvent) => void,
  ): Promise<{ messageId: string }> {
    const conversation = await requireConversation(userId, conversationId);

    const stored = await chatDao.listMessages(conversationId);
    const history: StoredMessage[] = stored.map((row) => ({
      role: row.role,
      content: parseContent(row.content),
      tokenCount: row.tokenCount,
    }));

    const userMessage: ChatMessage = { role: 'USER', content: [{ type: 'text', text }] };

    const toolset = createToolset(userId);

    const result = await getProvider().chat(
      {
        // The system prompt is passed separately and is never subject to trimming.
        system: chatSystemPrompt(todayDateOnly()),
        messages: [...trimHistory(history, env.AI_CHAT_TOKEN_BUDGET), userMessage],
        tools: toolset.tools,
        runTool: toolset.runTool,
      },
      onEvent,
    );

    const firstSeq = await chatDao.nextSeq(conversationId);
    const toWrite = [userMessage, ...result.reply];

    await chatDao.createMessages(
      toWrite.map((message, index) => ({
        conversationId,
        seq: firstSeq + index,
        role: message.role,
        content: message.content,
        // Recorded on the assistant's turns, which is what the budget measures.
        tokenCount: message.role === 'ASSISTANT' ? result.tokens : null,
      })),
    );

    const isFirstMessage = stored.length === 0;
    await chatDao.touchConversation(
      conversationId,
      isFirstMessage ? titleFrom(text) : undefined,
    );

    return { messageId: `${conversation.id}:${firstSeq + toWrite.length - 1}` };
  },
};
