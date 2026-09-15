import { z } from 'zod';
import { CHAT_ROLES } from '../constants/enums';

// Provider-neutral content blocks. Each LLM adapter maps these to its own wire
// format, so stored history stays replayable if we switch provider.

export const textBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const toolCallBlockSchema = z.object({
  type: z.literal('tool_call'),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown(),
});

export const toolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  toolCallId: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean().default(false),
});

export const contentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  toolCallBlockSchema,
  toolResultBlockSchema,
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const messageContentSchema = z.array(contentBlockSchema).min(1);
export type MessageContent = z.infer<typeof messageContentSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(CHAT_ROLES),
  content: messageContentSchema,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sendMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
