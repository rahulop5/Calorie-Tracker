import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  type ChatMessage,
  type ContentBlock,
  type DiaryRow,
  diaryRowSchema,
  type EstimateNutritionInput,
  estimateResultSchema,
  type ExtractionResult,
  extractionResultSchema,
  todayDateOnly,
} from '@tracker/shared';
import { z } from 'zod';
import { AppError } from '../../../common/errors';
import { env } from '../../../config/env';
import { chatSystemPrompt, diaryPrompt, estimatePrompt, extractionPrompt } from '../prompts';
import type {
  ChatEvent,
  ChatRequest,
  ChatResult,
  ImageUpload,
  LlmProvider,
  PdfUpload,
  ToolCall,
} from './types';

// Structured output keeps the model inside our schema, so there is no prose to
// parse and no shape to guess.
const diaryRowsSchema = z.object({ rows: z.array(diaryRowSchema) });

const EXTRACTION_MAX_TOKENS = 4096;
const CHAT_MAX_TOKENS = 8192;

/** Turns any SDK failure into one error the routes already know how to render. */
function toAppError(error: unknown): AppError {
  if (error instanceof Anthropic.AuthenticationError) {
    return AppError.aiProvider('The AI provider rejected our credentials');
  }

  if (error instanceof Anthropic.RateLimitError) {
    return AppError.aiProvider('The AI provider is rate limiting us, try again shortly');
  }

  if (error instanceof Anthropic.BadRequestError) {
    return AppError.aiProvider('The AI provider rejected the request');
  }

  if (error instanceof Anthropic.APIError) {
    return AppError.aiProvider('The AI provider could not complete the request');
  }

  return AppError.aiProvider();
}

/** One retry, because a timeout or a malformed response is usually transient. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (first) {
    if (first instanceof Anthropic.AuthenticationError || first instanceof Anthropic.BadRequestError) {
      throw toAppError(first);
    }

    try {
      return await run();
    } catch (second) {
      throw toAppError(second);
    }
  }
}

/** Our neutral blocks to the shapes the Messages API expects. */
function toApiMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => ({
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: message.content.map((block): Anthropic.ContentBlockParam => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }

      if (block.type === 'tool_call') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }

      return {
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: JSON.stringify(block.output),
        is_error: block.isError,
      };
    }),
  }));
}

export function createClaudeProvider(): LlmProvider {
  // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login`
  // profile, so nothing is hardcoded.
  const client = new Anthropic();

  return {
    name: 'claude',

    async extractNutrition(image: ImageUpload): Promise<ExtractionResult> {
      const response = await withRetry(() =>
        client.messages.parse({
          model: env.AI_MODEL_EXTRACTION,
          max_tokens: EXTRACTION_MAX_TOKENS,
          system: extractionPrompt(),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: image.data.toString('base64'),
                  },
                },
                { type: 'text', text: 'Extract the nutrition information from this photo.' },
              ],
            },
          ],
          output_config: { format: zodOutputFormat(extractionResultSchema) },
        }),
      );

      if (!response.parsed_output) {
        throw AppError.aiProvider('The AI provider returned an unreadable result');
      }

      return response.parsed_output;
    },

    async estimateNutrition(input: EstimateNutritionInput) {
      const response = await withRetry(() =>
        client.messages.parse({
          model: env.AI_MODEL_EXTRACTION,
          max_tokens: EXTRACTION_MAX_TOKENS,
          system: estimatePrompt(),
          messages: [
            {
              role: 'user',
              content: `Estimate the nutrition for ${input.quantity} ${input.unit} of ${input.foodName}.`,
            },
          ],
          output_config: { format: zodOutputFormat(estimateResultSchema) },
        }),
      );

      if (!response.parsed_output) {
        throw AppError.aiProvider('The AI provider returned an unreadable result');
      }

      return response.parsed_output;
    },

    async parseDiary(pdf: PdfUpload): Promise<DiaryRow[]> {
      const response = await withRetry(() =>
        client.messages.parse({
          model: env.AI_MODEL_EXTRACTION,
          max_tokens: EXTRACTION_MAX_TOKENS * 4,
          system: diaryPrompt(todayDateOnly()),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdf.data.toString('base64'),
                  },
                },
                { type: 'text', text: 'Return every food row in this diary.' },
              ],
            },
          ],
          output_config: { format: zodOutputFormat(diaryRowsSchema) },
        }),
      );

      return response.parsed_output?.rows ?? [];
    },

    async chat(request: ChatRequest, onEvent: (event: ChatEvent) => void): Promise<ChatResult> {
      const tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
      }));

      const messages = toApiMessages(request.messages);
      const reply: ChatMessage[] = [];
      let tokens = 0;

      // Manual loop rather than the beta tool runner: we need each tool call
      // surfaced to the browser as it happens, and the transcript written in
      // our own neutral format.
      for (let turn = 0; turn < env.AI_CHAT_MAX_TURNS; turn += 1) {
        const stream = client.messages.stream({
          model: env.AI_MODEL_CHAT,
          max_tokens: CHAT_MAX_TOKENS,
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
        });

        stream.on('text', (delta) => onEvent({ type: 'text', text: delta }));

        const message = await withRetry(() => stream.finalMessage());
        tokens += message.usage.input_tokens + message.usage.output_tokens;

        const assistantBlocks: ContentBlock[] = [];

        for (const block of message.content) {
          if (block.type === 'text') {
            assistantBlocks.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            assistantBlocks.push({
              type: 'tool_call',
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }

        if (assistantBlocks.length > 0) {
          reply.push({ role: 'ASSISTANT', content: assistantBlocks });
        }

        messages.push({ role: 'assistant', content: message.content });

        const calls = message.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        if (calls.length === 0) {
          return { reply, tokens };
        }

        const results: Anthropic.ToolResultBlockParam[] = [];
        const resultBlocks: ContentBlock[] = [];

        for (const block of calls) {
          const call: ToolCall = { id: block.id, name: block.name, input: block.input };
          onEvent({ type: 'tool_call', call });

          const outcome = await request.runTool(call);
          onEvent({ type: 'tool_result', call, output: outcome.output, isError: outcome.isError });

          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(outcome.output),
            is_error: outcome.isError,
          });
          resultBlocks.push({
            type: 'tool_result',
            toolCallId: block.id,
            output: outcome.output,
            isError: outcome.isError,
          });
        }

        // All results in one user message: splitting them teaches the model to
        // stop making parallel calls.
        messages.push({ role: 'user', content: results });
        reply.push({ role: 'USER', content: resultBlocks });
      }

      onEvent({
        type: 'text',
        text: '\n\nI stopped before finishing to avoid looping. Ask me to continue.',
      });

      return { reply, tokens };
    },
  };
}
