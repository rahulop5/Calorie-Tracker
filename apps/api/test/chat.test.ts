import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { trimHistory, type StoredMessage } from '../src/modules/chat/history';
import { createGoal, createTestApp, registerOtherUser, registerUser } from './helpers/app';

const CONVERSATIONS = '/api/v1/chat/conversations';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

type SseEvent = { event: string; data: Record<string, unknown> };

/** Parses an SSE body into events, so assertions can look at the stream. */
function parseSse(body: string): SseEvent[] {
  return body
    .split('\n\n')
    .filter((frame) => frame.trim() !== '')
    .map((frame) => {
      const lines = frame.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}';

      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

async function startConversation(user: { headers: { authorization: string } }) {
  const response = await app.inject({
    method: 'POST',
    url: CONVERSATIONS,
    headers: user.headers,
    payload: {},
  });

  return response.json().id as string;
}

function send(user: { headers: { authorization: string } }, id: string, content: string) {
  return app.inject({
    method: 'POST',
    url: `${CONVERSATIONS}/${id}/messages`,
    headers: user.headers,
    payload: { content },
  });
}

describe('conversations', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: CONVERSATIONS });

    expect(response.statusCode).toBe(401);
  });

  it('creates and lists conversations', async () => {
    const user = await registerUser(app);
    await startConversation(user);
    await startConversation(user);

    const response = await app.inject({ method: 'GET', url: CONVERSATIONS, headers: user.headers });

    expect(response.json().meta.total).toBe(2);
  });

  it('does not show another user their conversations', async () => {
    const user = await registerUser(app);
    await startConversation(user);

    const other = await registerOtherUser(app);
    const response = await app.inject({ method: 'GET', url: CONVERSATIONS, headers: other.headers });

    expect(response.json().meta.total).toBe(0);
  });

  it('404s on another user’s conversation', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);
    const other = await registerOtherUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `${CONVERSATIONS}/${id}/messages`,
      headers: other.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('soft deletes a conversation', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `${CONVERSATIONS}/${id}`,
      headers: user.headers,
    });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: CONVERSATIONS, headers: user.headers });
    expect(list.json().meta.total).toBe(0);
  });
});

describe('sending a message', () => {
  it('streams tokens and a done event', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);

    const response = await send(user, id, 'hello there');
    const events = parseSse(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(events.some((event) => event.event === 'token')).toBe(true);
    expect(events.at(-1)?.event).toBe('done');
  });

  it('surfaces tool activity as its own events', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });
    const id = await startConversation(user);

    const events = parseSse((await send(user, id, 'what is my goal?')).body);
    const start = events.find((event) => event.event === 'tool_start');
    const result = events.find((event) => event.event === 'tool_result');

    expect(start?.data.name).toBe('get_current_goal');
    expect(result?.data.isError).toBe(false);
  });

  it('reports a failed tool call without ending the conversation', async () => {
    const user = await registerUser(app);
    // No goal set, so the tool throws NOT_FOUND inside the loop.
    const id = await startConversation(user);

    const events = parseSse((await send(user, id, 'what is my goal?')).body);
    const result = events.find((event) => event.event === 'tool_result');

    expect(result?.data.isError).toBe(true);
    expect(events.at(-1)?.event).toBe('done');
  });

  it('persists the exchange and titles the conversation', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);

    await send(user, id, 'tell me about my week');

    const messages = await app.inject({
      method: 'GET',
      url: `${CONVERSATIONS}/${id}/messages`,
      headers: user.headers,
    });

    const rows = messages.json().data;
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].role).toBe('USER');
    // seq is assigned in order, which is what makes replay stable.
    expect(rows.map((row: { seq: number }) => row.seq)).toEqual(
      rows.map((_: unknown, index: number) => index + 1),
    );

    const list = await app.inject({ method: 'GET', url: CONVERSATIONS, headers: user.headers });
    expect(list.json().data[0].title).toBe('tell me about my week');
  });

  it('keeps numbering across turns', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);

    await send(user, id, 'hello');
    await send(user, id, 'hello again');

    const messages = await app.inject({
      method: 'GET',
      url: `${CONVERSATIONS}/${id}/messages`,
      headers: user.headers,
    });

    const seqs = messages.json().data.map((row: { seq: number }) => row.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('rejects an empty message', async () => {
    const user = await registerUser(app);
    const id = await startConversation(user);

    const response = await send(user, id, '   ');

    expect(response.statusCode).toBe(400);
  });
});

describe('history trimming', () => {
  function message(role: 'USER' | 'ASSISTANT', text: string, tokens: number): StoredMessage {
    return { role, content: [{ type: 'text', text }], tokenCount: tokens };
  }

  it('keeps everything when it fits the budget', () => {
    const history = [message('USER', 'a', 10), message('ASSISTANT', 'b', 10)];

    expect(trimHistory(history, 1000)).toHaveLength(2);
  });

  it('drops the oldest first', () => {
    const history = Array.from({ length: 20 }, (_, index) =>
      message(index % 2 === 0 ? 'USER' : 'ASSISTANT', `turn ${index}`, 100),
    );

    const kept = trimHistory(history, 800);
    const texts = kept.flatMap((entry) =>
      entry.content.map((block) => (block.type === 'text' ? block.text : '')),
    );

    expect(kept.length).toBeLessThan(history.length);
    // The newest turn survives; the oldest does not.
    expect(texts).toContain('turn 19');
    expect(texts).not.toContain('turn 0');
  });

  it('pins the recent tail even when the budget is tiny', () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      message('USER', `turn ${index}`, 5000),
    );

    // Far below the cost of one message, so only pinning can save anything.
    const kept = trimHistory(history, 1);

    expect(kept.length).toBeGreaterThan(0);
    const texts = kept.flatMap((entry) =>
      entry.content.map((block) => (block.type === 'text' ? block.text : '')),
    );
    expect(texts).toContain('turn 11');
  });

  it('never keeps a tool call without its result', () => {
    const history: StoredMessage[] = [
      {
        role: 'ASSISTANT',
        content: [{ type: 'tool_call', id: 'call_1', name: 'get_current_goal', input: {} }],
        tokenCount: 5000,
      },
      {
        role: 'USER',
        content: [{ type: 'tool_result', toolCallId: 'call_1', output: {}, isError: false }],
        tokenCount: 5000,
      },
      ...Array.from({ length: 8 }, (_, index) => message('USER', `later ${index}`, 5000)),
    ];

    const kept = trimHistory(history, 1);
    const calls = kept.flatMap((entry) =>
      entry.content.filter((block) => block.type === 'tool_call'),
    );
    const results = kept.flatMap((entry) =>
      entry.content.filter((block) => block.type === 'tool_result'),
    );

    // Either both halves survive or neither does, never one.
    expect(calls.length).toBe(results.length);
  });

  it('assumes a cost for messages with no recorded count', () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      ...message('USER', `turn ${index}`, 0),
      tokenCount: null,
    }));

    expect(trimHistory(history, 500).length).toBeLessThan(history.length);
  });
});
