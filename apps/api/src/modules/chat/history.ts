import type { ChatMessage, ContentBlock } from '@tracker/shared';

export type StoredMessage = ChatMessage & {
  tokenCount: number | null;
};

/** Turns whose text and tool pairs are never dropped, however long the chat. */
const PINNED_TAIL_MESSAGES = 6;

/** Used when a stored message has no recorded count. */
const ASSUMED_TOKENS = 200;

function tokensOf(message: StoredMessage): number {
  return message.tokenCount ?? ASSUMED_TOKENS;
}

function toolCallIds(message: ChatMessage): string[] {
  return message.content
    .filter((block): block is Extract<ContentBlock, { type: 'tool_call' }> => block.type === 'tool_call')
    .map((block) => block.id);
}

function toolResultIds(message: ChatMessage): string[] {
  return message.content
    .filter(
      (block): block is Extract<ContentBlock, { type: 'tool_result' }> =>
        block.type === 'tool_result',
    )
    .map((block) => block.toolCallId);
}

/**
 * Trims the middle of a conversation to a token budget.
 *
 * Three things are deliberately not droppable:
 * - the system prompt, which is not in this list at all and is passed separately
 * - the most recent turns, so the assistant never forgets what it just did
 * - a tool_call without its tool_result, which is a malformed request
 *
 * So removal is oldest-first, stops at the pinned tail, and drops a tool call
 * together with its result.
 */
export function trimHistory(messages: StoredMessage[], budget: number): ChatMessage[] {
  const pinnedFrom = Math.max(0, messages.length - PINNED_TAIL_MESSAGES);
  const tail = messages.slice(pinnedFrom);
  const head = messages.slice(0, pinnedFrom);

  let used = tail.reduce((total, message) => total + tokensOf(message), 0);
  const keptHead: StoredMessage[] = [];

  // Walk the head newest-first, keeping what fits.
  for (let index = head.length - 1; index >= 0; index -= 1) {
    const message = head[index];

    if (!message) {
      continue;
    }

    const cost = tokensOf(message);

    if (used + cost > budget) {
      break;
    }

    used += cost;
    keptHead.unshift(message);
  }

  const kept = [...keptHead, ...tail];

  // A result whose call was trimmed away, or a call whose result was, would be
  // rejected by the API, so drop the orphan half.
  const callIds = new Set(kept.flatMap(toolCallIds));
  const resultIds = new Set(kept.flatMap(toolResultIds));

  return kept
    .map((message) => ({
      role: message.role,
      content: message.content.filter((block) => {
        if (block.type === 'tool_call') {
          return resultIds.has(block.id);
        }

        if (block.type === 'tool_result') {
          return callIds.has(block.toolCallId);
        }

        return true;
      }),
    }))
    .filter((message) => message.content.length > 0);
}
