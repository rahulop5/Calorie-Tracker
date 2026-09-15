import type { ChatStreamEvent } from '@tracker/shared';
import { ApiError, getAccessToken, refreshForStream } from './client';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Reads the Server-Sent Events stream from a chat send.
 *
 * fetch is used rather than EventSource for two reasons: EventSource cannot
 * issue a POST, and it cannot set an Authorization header.
 */
export async function streamChatMessage(
  conversationId: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${BASE_URL}/api/v1/chat/conversations/${conversationId}/messages`;

  async function open(token: string | null): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ content }),
      signal,
    });
  }

  let response = await open(getAccessToken());

  if (response.status === 401 && (await refreshForStream())) {
    response = await open(getAccessToken());
  }

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, 'INTERNAL_ERROR', 'Could not start the reply');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; a partial frame waits for more.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const parsed = parseFrame(frame);

      if (parsed) {
        onEvent(parsed);
      }
    }
  }
}

function parseFrame(frame: string): ChatStreamEvent | null {
  const lines = frame.split('\n');
  const name = lines.find((line) => line.startsWith('event: '))?.slice(7);
  const raw = lines.find((line) => line.startsWith('data: '))?.slice(6);

  if (!name || !raw) {
    return null;
  }

  try {
    return { event: name, data: JSON.parse(raw) } as ChatStreamEvent;
  } catch {
    return null;
  }
}
