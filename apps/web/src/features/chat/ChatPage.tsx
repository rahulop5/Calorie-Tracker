import type { ChatMessageRecord, ContentBlock } from '@tracker/shared';
import { AlertTriangle, MessageSquarePlus, Send, Sparkles, Trash2, Wrench } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { streamChatMessage } from '@/lib/api/chat-stream';
import { cn } from '@/lib/cn';
import {
  useConversationMessages,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRefreshAfterChat,
} from './queries';

/** A tool call the assistant made, shown so every write is visible. */
type ToolActivity = {
  name: string;
  summary?: string;
  isError?: boolean;
};

type Turn = {
  role: 'USER' | 'ASSISTANT';
  text: string;
  tools: ToolActivity[];
};

const SUGGESTIONS = [
  'What did I eat yesterday?',
  'What is my current goal?',
  'Give me a summary of this week',
  'I ate two scrambled eggs for breakfast',
];

/** Stored blocks become the turns the transcript renders. */
function toTurns(records: ChatMessageRecord[]): Turn[] {
  const turns: Turn[] = [];

  for (const record of records) {
    const text = record.content
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const calls = record.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_call' }> => block.type === 'tool_call',
    );

    // Tool results arrive as user-role messages; fold them into the assistant
    // turn that made the call rather than showing them as the user speaking.
    const results = record.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_result' }> =>
        block.type === 'tool_result',
    );

    if (results.length > 0 && text === '' && calls.length === 0) {
      const previous = turns.at(-1);

      if (previous) {
        for (const result of results) {
          const activity = previous.tools.find((tool) => tool.summary === undefined);

          if (activity) {
            activity.isError = result.isError;
            activity.summary = result.isError ? 'failed' : 'done';
          }
        }
      }

      continue;
    }

    if (text === '' && calls.length === 0) {
      continue;
    }

    turns.push({
      role: record.role,
      text,
      tools: calls.map((call) => ({ name: call.name })),
    });
  }

  return turns;
}

export function ChatPage() {
  const { notify } = useToast();
  const conversations = useConversations(1);
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const refreshAfterChat = useRefreshAfterChat();

  const [activeId, setActiveId] = useState<string | null>(null);
  const messages = useConversationMessages(activeId);

  const [draft, setDraft] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolActivity[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  // Open the most recent conversation, so the page is never blank on arrival.
  useEffect(() => {
    if (activeId === null && conversations.data && conversations.data.data.length > 0) {
      setActiveId(conversations.data.data[0]?.id ?? null);
    }
  }, [activeId, conversations.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [streamingText, pendingUser, messages.data]);

  async function ensureConversation(): Promise<string> {
    if (activeId) {
      return activeId;
    }

    const created = await createConversation.mutateAsync();
    setActiveId(created.id);

    return created.id;
  }

  async function handleSend(text: string) {
    const content = text.trim();

    if (content === '' || sending) {
      return;
    }

    setError(null);
    setDraft('');
    setSending(true);
    setPendingUser(content);
    setStreamingText('');
    setStreamingTools([]);

    try {
      const conversationId = await ensureConversation();

      await streamChatMessage(conversationId, content, (event) => {
        switch (event.event) {
          case 'token':
            setStreamingText((current) => current + event.data.text);
            break;
          case 'tool_start':
            setStreamingTools((current) => [...current, { name: event.data.name }]);
            break;
          case 'tool_result':
            setStreamingTools((current) =>
              current.map((tool, index) =>
                index === current.length - 1
                  ? { ...tool, summary: event.data.isError ? 'failed' : 'done', isError: event.data.isError }
                  : tool,
              ),
            );
            break;
          case 'error':
            setError(event.data.message);
            break;
          default:
            break;
        }
      });

      // The assistant may have written data, so refetch everything it touches.
      refreshAfterChat();
      await messages.refetch();
    } catch {
      setError('The reply was interrupted. Please try again.');
    } finally {
      setSending(false);
      setPendingUser(null);
      setStreamingText('');
      setStreamingTools([]);
    }
  }

  const turns = messages.data ? toTurns(messages.data.data) : [];
  const isEmpty = turns.length === 0 && pendingUser === null;

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Log meals, check goals and ask questions in plain language."
        action={
          <Button
            icon={<MessageSquarePlus className="size-4" />}
            loading={createConversation.isPending}
            onClick={async () => {
              const created = await createConversation.mutateAsync();
              setActiveId(created.id);
            }}
          >
            New chat
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
        <Card className="hidden overflow-hidden lg:block">
          <p className="border-b border-line px-4 py-2.5 text-[0.75rem] font-medium tracking-wide text-ink-muted uppercase">
            Conversations
          </p>

          {conversations.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 text-ink-muted" />
            </div>
          ) : conversations.data && conversations.data.data.length > 0 ? (
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
              {conversations.data.data.map((conversation) => (
                <li key={conversation.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className={cn(
                      'min-w-0 flex-1 truncate px-4 py-2.5 text-left text-[0.8125rem] transition-colors',
                      conversation.id === activeId
                        ? 'bg-wash-strong font-medium text-ink'
                        : 'text-ink-secondary hover:bg-wash',
                    )}
                  >
                    {conversation.title}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${conversation.title}`}
                    className="mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={async () => {
                      await deleteConversation.mutateAsync(conversation.id);

                      if (conversation.id === activeId) {
                        setActiveId(null);
                      }

                      notify('Conversation deleted');
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-ink-muted">
              No conversations yet.
            </p>
          )}
        </Card>

        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {isEmpty ? (
              <EmptyState
                icon={<Sparkles className="size-5" />}
                title="Ask me anything about your food"
                description="I can log meals, read back what you ate, set goals and summarise your week."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <Button key={suggestion} size="sm" onClick={() => void handleSend(suggestion)}>
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                }
              />
            ) : null}

            {turns.map((turn, index) => (
              <Bubble key={index} turn={turn} />
            ))}

            {pendingUser ? (
              <Bubble turn={{ role: 'USER', text: pendingUser, tools: [] }} />
            ) : null}

            {sending ? (
              <Bubble
                turn={{ role: 'ASSISTANT', text: streamingText, tools: streamingTools }}
                pending={streamingText === ''}
              />
            ) : null}

            {error ? (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <div ref={endRef} />
          </div>

          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void handleSend(draft);
            }}
            className="flex items-end gap-2 border-t border-line p-3"
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter makes a new line.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend(draft);
                }
              }}
              placeholder="I had a chicken salad for lunch…"
              className="max-h-32 min-h-10 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
            />
            <Button
              type="submit"
              variant="primary"
              loading={sending}
              disabled={draft.trim() === ''}
              aria-label="Send"
              icon={<Send className="size-4" />}
            />
          </form>
        </Card>
      </div>
    </>
  );
}

function Bubble({ turn, pending = false }: { turn: Turn; pending?: boolean }) {
  const isUser = turn.role === 'USER';

  return (
    <div className={cn('animate-rise flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] space-y-2', isUser && 'items-end')}>
        {turn.tools.length > 0 ? (
          <ul className="space-y-1">
            {turn.tools.map((tool, index) => (
              <li
                key={`${tool.name}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-wash px-2 py-1 text-[0.75rem] text-ink-secondary"
              >
                <Wrench className="size-3 shrink-0" aria-hidden="true" />
                <span className="font-medium">{tool.name.replaceAll('_', ' ')}</span>
                {tool.summary ? (
                  <span className={tool.isError ? 'text-critical' : 'text-ink-muted'}>
                    {tool.summary}
                  </span>
                ) : (
                  <Spinner className="size-3" />
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {turn.text || pending ? (
          <div
            className={cn(
              'rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
              isUser
                ? 'bg-accent text-accent-ink'
                : 'border border-line bg-surface-raised text-ink',
            )}
          >
            {pending ? <Spinner className="size-4 text-ink-muted" /> : turn.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
