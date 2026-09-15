import { z } from 'zod';
import { CHAT_ROLES } from '../constants/enums';
import { messageContentSchema } from './chat';
import { uuidSchema } from './common';

export const conversationSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const chatMessageRecordSchema = z.object({
  id: uuidSchema,
  seq: z.number().int(),
  role: z.enum(CHAT_ROLES),
  content: messageContentSchema,
});
export type ChatMessageRecord = z.infer<typeof chatMessageRecordSchema>;

export const createConversationInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;

/**
 * Events the send endpoint streams. `tool_start` and `tool_result` are surfaced
 * so a user can see every write the assistant makes.
 */
export const CHAT_EVENTS = ['token', 'tool_start', 'tool_result', 'done', 'error'] as const;
export type ChatEventName = (typeof CHAT_EVENTS)[number];

export type ChatStreamEvent =
  | { event: 'token'; data: { text: string } }
  | { event: 'tool_start'; data: { name: string; input: unknown } }
  | { event: 'tool_result'; data: { name: string; summary: string; isError: boolean } }
  | { event: 'done'; data: { messageId: string } }
  | { event: 'error'; data: { code: string; message: string } };
