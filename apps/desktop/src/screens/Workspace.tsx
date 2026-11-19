/**
 * AI Workspace: conversation history, streaming replies, tools in context.
 *
 * The permission and confirmation flow lives here because it is a property of
 * the conversation: PRIVIA asks in context, the user answers in context, and
 * the action resumes in context. Approval is bound by the backend to this
 * session, this tool and these exact arguments.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, api } from '@/lib/api';
import { appStore, navigate, pushToast } from '@/lib/store';
import { refreshStatus, statusStore } from '@/lib/status';
import type {
  ChatMessage,
  ConfirmationRequest,
  FileEntry,
  ModelsResponse,
  PermissionPrompt as Prompt,
  Session,
  StreamEvent,
} from '@/lib/types';
import { basename, formatDuration, formatRelative, shortenPath, titleCase } from '@/lib/format';
import { useVoice } from '@/hooks/useVoice';
import { useDebounced } from '@/hooks/useDebounced';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PermissionPrompt } from '@/components/PermissionPrompt';
import { ToolTimeline } from '@/components/ToolTimeline';
import { Waveform } from '@/components/Waveform';
import { Markdown } from '@/components/Markdown';
import { Chip, Dot, Icon, Logo, Spinner, Toggle } from '@/components/primitives';

const SUGGESTIONS = [
  { title: 'Summarize a document', prompt: 'Find the project report and summarize it' },
  { title: 'Plan my day', prompt: 'What is on my calendar today?' },
  { title: 'Capture a note', prompt: 'Create a note called interview preparation' },
  { title: 'Review access', prompt: 'What files did you access in this session?' },
];

type Prefer = 'local' | 'cloud';

function fromHistory(rows: Record<string, unknown>[]): ChatMessage[] {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row, index) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? `h-${index}`),
        role: row.role as 'user' | 'assistant',
        content: String(row.content ?? ''),
        createdAt: Date.parse(String(row.created_at ?? '')) || Date.now(),
        runId: row.run_id ? String(row.run_id) : undefined,
        location: (metadata.processing_location as ChatMessage['location']) ?? undefined,
      };
    });
}

export function Workspace() {
  const sessionId = appStore.useStore((state) => state.sessionId);
  const pendingPrompt = appStore.useStore((state) => state.pendingPrompt);
  const status = statusStore.useStore((state) => state.status);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [confirmationPrompt, setConfirmationPrompt] = useState('');
  const [permission, setPermission] = useState<Prompt | null>(null);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [prefer, setPrefer] = useState<Prefer>('local');
  const [speak, setSpeak] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);

  const voice = useVoice();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** The session this component created itself, so it does not reload it. */
  const ownSession = useRef<string | null>(null);
  const handledPrompt = useRef<number>(0);
  /** The session whose messages are on screen; undefined before the first load. */
  const shownSession = useRef<string | null | undefined>(undefined);

  // Keep the newest content in view while it streams.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
    if (nearBottom || busy) element.scrollTo({ top: element.scrollHeight });
  }, [messages, confirmation, permission, busy]);

  // Load a conversation picked from the history list. Runs only when the
  // session actually changes: re-running for the same session (React may do
  // that) must not wipe a reply that is streaming in.
  useEffect(() => {
    if (shownSession.current === sessionId) return;
    shownSession.current = sessionId;
    if (!sessionId) {
      setMessages([]);
      return;
    }
    if (sessionId === ownSession.current) return;
    let cancelled = false;
    setLoadingSession(true);
    api
      .session(sessionId)
      .then((detail) => {
        if (!cancelled) setMessages(fromHistory(detail.messages));
      })
      .catch(() => {
        if (!cancelled) {
          appStore.setState({ sessionId: null });
          pushToast({ kind: 'error', title: 'That conversation could not be opened' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
      shownSession.current = undefined;
    };
  }, [sessionId]);

  useEffect(() => {
    appStore.setState({ micActive: voice.state === 'recording' });
    return () => appStore.setState({ micActive: false });
  }, [voice.state]);

  const update = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (
      raw: string,
      options: { confirmationId?: string; confirm?: boolean; regenerate?: boolean } = {},
    ) => {
      const text = raw.trim();
      if (!text || busy) return;
      const isDecision = Boolean(options.confirmationId);
      const message =
        attachment && !isDecision && !options.regenerate
          ? `${text}\n\nAttached file: ${attachment}`
          : text;

      if (!isDecision && !options.regenerate) {
        setMessages((current) => [
          ...current,
          { id: `u-${Date.now()}`, role: 'user', content: message, createdAt: Date.now() },
        ]);
        setInput('');
        setAttachment(null);
      }
      const replyId = `a-${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: replyId,
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          streaming: true,
          activity: 'Understanding the request',
          prompt: message,
        },
      ]);
      setBusy(true);
      setPermission(null);
      setConfirmation(null);

      const controller = new AbortController();
      controllerRef.current = controller;
      let streamed = '';
      let finalText = '';

      const onEvent = (event: StreamEvent) => {
        switch (event.type) {
          case 'start':
            if (!sessionId || sessionId !== event.session_id) {
              ownSession.current = event.session_id;
              appStore.setState({ sessionId: event.session_id });
            }
            break;
          case 'status':
            update(replyId, { activity: event.message });
            break;
          case 'tool':
            update(replyId, { activity: `Using ${titleCase(event.tool)}` });
            break;
          case 'token':
            streamed += event.text;
            update(replyId, { content: streamed, activity: undefined });
            break;
          case 'confirmation':
            setConfirmation(event.confirmation);
            setConfirmationPrompt(message);
            break;
          case 'error':
            update(replyId, { content: event.message, failed: true, streaming: false });
            break;
          case 'done':
            finalText = event.response;
            update(replyId, {
              content: event.response,
              streaming: false,
              activity: undefined,
              runId: event.run_id,
              toolCalls: event.tool_calls,
              toolResults: event.tool_results,
              accessed: event.accessed_resources,
              location: event.processing_location,
              model: event.model_used,
              durationMs: event.duration_ms,
              pending: event.status === 'awaiting_confirmation',
              failed: event.status === 'failed',
            });
            if (event.permission_prompt) setPermission(event.permission_prompt);
            break;
        }
      };

      try {
        await api.chatStream(
          {
            message,
            session_id: sessionId,
            confirmation_id: options.confirmationId ?? null,
            confirm: options.confirm ?? null,
            prefer: prefer === 'cloud' ? 'cloud' : null,
          },
          onEvent,
          controller.signal,
        );
        if (speak && finalText) {
          api
            .synthesize(finalText.slice(0, 4000))
            .then((audio) => void new Audio(`data:audio/wav;base64,${audio.audio_base64}`).play())
            .catch(() => undefined);
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          setMessages((current) =>
            current.map((m) =>
              m.id === replyId
                ? {
                    ...m,
                    streaming: false,
                    stopped: true,
                    activity: undefined,
                    content: m.content || '',
                  }
                : m,
            ),
          );
        } else {
          const error =
            caught instanceof ApiRequestError
              ? caught
              : new ApiRequestError('INTERNAL_ERROR', String(caught), 0);
          update(replyId, {
            content: error.message,
            failed: true,
            streaming: false,
            activity: undefined,
          });
          if (error.isOffline)
            pushToast({ kind: 'error', title: 'Assistant offline', detail: error.message });
        }
      } finally {
        controllerRef.current = null;
        setBusy(false);
        appStore.setState((state) => ({ sessionsVersion: state.sessionsVersion + 1 }));
        inputRef.current?.focus();
      }
    },
    [attachment, busy, prefer, sessionId, speak, update],
  );

  // A prompt handed over from Home, Files or Notes.
  useEffect(() => {
    if (!pendingPrompt || pendingPrompt.nonce === handledPrompt.current) return;
    handledPrompt.current = pendingPrompt.nonce;
    appStore.setState({ pendingPrompt: null });
    if (pendingPrompt.send) void send(pendingPrompt.text);
    else {
      setInput(pendingPrompt.text);
      inputRef.current?.focus();
    }
  }, [pendingPrompt, send]);

  const stop = () => controllerRef.current?.abort();

  const resolveConfirmation = async (approved: boolean) => {
    if (!confirmation) return;
    const id = confirmation.id;
    setConfirmation(null);
    await send(confirmationPrompt, { confirmationId: id, confirm: approved });
  };

  const grantPermission = async (scopes: string[], resources: string[]) => {
    try {
      for (const scope of scopes) await api.setPermission(scope, true, resources);
      pushToast({ kind: 'success', title: 'Permission granted', detail: scopes.join(', ') });
      setPermission(null);
      const last = [...messages].reverse().find((m) => m.role === 'user');
      if (last) await send(last.content, { regenerate: true });
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not grant that',
        detail: caught instanceof Error ? caught.message : undefined,
      });
    }
  };

  const newConversation = () => {
    if (busy) stop();
    ownSession.current = null;
    appStore.setState({ sessionId: null });
    setMessages([]);
    setPermission(null);
    setConfirmation(null);
    inputRef.current?.focus();
  };

  const handleMicUp = async () => {
    const text = await voice.stop();
    if (text) void send(text);
  };

  const cloudAvailable = Boolean(status?.models.cloud && status.privacy.cloud_processing_enabled);
  useEffect(() => {
    if (!cloudAvailable && prefer === 'cloud') setPrefer('local');
  }, [cloudAvailable, prefer]);

  return (
    <div className="flex h-full">
      {historyOpen ? (
        <History
          activeId={sessionId}
          onNew={newConversation}
          onClose={() => setHistoryOpen(false)}
          onOpen={(id) => {
            if (busy) stop();
            ownSession.current = null;
            appStore.setState({ sessionId: id });
          }}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-graphite-800 px-4">
          {!historyOpen ? (
            <button
              type="button"
              className="btn-icon h-7 w-7"
              onClick={() => setHistoryOpen(true)}
              aria-label="Show conversations"
              title="Conversations"
            >
              <Icon name="expand" className="h-4 w-4" />
            </button>
          ) : null}
          <ModelPicker prefer={prefer} onPrefer={setPrefer} cloudAvailable={cloudAvailable} />
          <ContextControls speak={speak} onSpeak={setSpeak} />
          <button
            type="button"
            onClick={newConversation}
            className="btn-quiet ml-auto h-7 px-2 text-xs"
          >
            <Icon name="edit" className="h-3.5 w-3.5" />
            New conversation
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
            {loadingSession ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : messages.length === 0 ? (
              <EmptyConversation onPick={(prompt) => void send(prompt)} />
            ) : null}

            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                canRegenerate={!busy && Boolean(message.prompt)}
                onRegenerate={() =>
                  message.prompt && void send(message.prompt, { regenerate: true })
                }
              />
            ))}

            {permission ? (
              <PermissionPrompt
                prompt={permission}
                busy={busy}
                onAllow={(scopes, resources) => void grantPermission(scopes, resources)}
                onDeny={() => setPermission(null)}
              />
            ) : null}
          </div>
        </div>

        <Composer
          input={input}
          setInput={setInput}
          busy={busy}
          onSend={() => void send(input)}
          onStop={stop}
          inputRef={inputRef}
          attachment={attachment}
          setAttachment={setAttachment}
          voice={voice}
          onMicUp={() => void handleMicUp()}
          location={prefer}
        />
      </div>

      {confirmation ? (
        <ConfirmDialog
          request={confirmation}
          busy={busy}
          onApprove={() => void resolveConfirmation(true)}
          onReject={() => void resolveConfirmation(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- history

function History({
  activeId,
  onNew,
  onOpen,
  onClose,
}: {
  activeId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const version = appStore.useStore((state) => state.sessionsVersion);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .sessions()
      .then((body) => {
        if (!cancelled) setSessions(body.sessions as unknown as Session[]);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (sessions ?? []).filter(
      (s) => (s.message_count ?? 1) > 0 && (!query || s.title.toLowerCase().includes(query)),
    );
  }, [sessions, filter]);

  const remove = async (id: string) => {
    try {
      await api.deleteSession(id);
      if (id === activeId) onNew();
      setSessions((current) => (current ?? []).filter((s) => s.id !== id));
    } catch {
      pushToast({ kind: 'error', title: 'That conversation could not be deleted' });
    }
  };

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-graphite-800 bg-graphite-950"
      aria-label="Conversations"
    >
      <div className="flex h-11 items-center gap-1 border-b border-graphite-800 px-3">
        <span className="label flex-1">Conversations</span>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          onClick={onNew}
          aria-label="New conversation"
          title="New conversation"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          onClick={onClose}
          aria-label="Hide conversations"
          title="Hide"
        >
          <Icon name="collapse" className="h-4 w-4" />
        </button>
      </div>
      <div className="p-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter conversations"
          className="field h-8 py-1 text-xs"
          aria-label="Filter conversations"
        />
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {sessions === null ? (
          <li className="px-2 py-3">
            <Spinner />
          </li>
        ) : visible.length === 0 ? (
          <li className="px-2 py-3 text-xs text-graphite-500">
            {filter ? 'No conversation matches.' : 'Your conversations will appear here.'}
          </li>
        ) : (
          visible.map((session) => {
            const active = session.id === activeId;
            return (
              <li key={session.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpen(session.id)}
                  className={`w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors ${
                    active
                      ? 'bg-graphite-850 text-graphite-100'
                      : 'text-graphite-400 hover:bg-graphite-900 hover:text-graphite-200'
                  }`}
                >
                  <span className="block truncate text-sm">
                    {session.title || 'New conversation'}
                  </span>
                  <span className="mt-0.5 block text-2xs text-graphite-600">
                    {formatRelative(session.updated_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(session.id)}
                  aria-label={`Delete ${session.title}`}
                  title="Delete conversation"
                  className="absolute right-1.5 top-2 hidden h-6 w-6 items-center justify-center rounded text-graphite-500 hover:bg-graphite-800 hover:text-danger group-hover:flex"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

// ---------------------------------------------------------- model + context

function ModelPicker({
  prefer,
  onPrefer,
  cloudAvailable,
}: {
  prefer: Prefer;
  onPrefer: (next: Prefer) => void;
  cloudAvailable: boolean;
}) {
  const status = statusStore.useStore((state) => state.status);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .models()
      .then(setModels)
      .catch(() => setModels(null));
  }, [open]);

  const local = status?.models.local;
  const cloud = status?.models.cloud;
  const label =
    prefer === 'cloud' && cloud
      ? `${cloud.provider} · ${cloud.model}`
      : local?.available
        ? local.model
        : 'Offline planner';

  const choose = async (model: string) => {
    setSwitching(model);
    try {
      await api.setLocalModel(model);
      onPrefer('local');
      await refreshStatus();
      setOpen(false);
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not switch model',
        detail: (caught as Error).message,
      });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-graphite-200 hover:bg-graphite-850"
      >
        <Dot tone={prefer === 'cloud' ? 'warn' : local?.available ? 'ok' : 'warn'} />
        <span className="max-w-[14rem] truncate font-medium">{label}</span>
        <Chip tone={prefer === 'cloud' ? 'caution' : 'neutral'}>
          <Icon name={prefer === 'cloud' ? 'cloud' : 'lock'} className="h-3 w-3" />
          {prefer === 'cloud' ? 'Cloud' : 'Local'}
        </Chip>
        <Icon name="chevronDown" className="h-3.5 w-3.5 text-graphite-500" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            className="panel-raised absolute left-0 top-9 z-30 w-80 animate-fade-in p-1.5"
            role="listbox"
          >
            <p className="label px-2.5 pb-1 pt-1.5">On this computer</p>
            {!models ? (
              <div className="px-2.5 py-2">
                <Spinner />
              </div>
            ) : models.installed.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-graphite-400">
                {models.local_provider === 'ollama'
                  ? 'Ollama is not running or has no models. PRIVIA is using its offline planner.'
                  : 'The offline planner is in use.'}{' '}
                <button
                  type="button"
                  className="text-graphite-200 underline"
                  onClick={() => navigate('settings')}
                >
                  Set up a model
                </button>
              </p>
            ) : (
              models.installed.map((name) => {
                const current =
                  prefer === 'local' &&
                  (name === local?.model || name === `${local?.model}:latest`);
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={current}
                    disabled={switching !== null}
                    onClick={() => (current ? onPrefer('local') : void choose(name))}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-graphite-200 hover:bg-graphite-750"
                  >
                    <Icon name="cpu" className="h-3.5 w-3.5 text-graphite-500" />
                    <span className="flex-1 truncate font-mono text-xs">{name}</span>
                    {switching === name ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : current ? (
                      <Icon name="check" className="h-3.5 w-3.5 text-brand" />
                    ) : null}
                  </button>
                );
              })
            )}
            <div className="my-1 border-t border-graphite-700" />
            <p className="label px-2.5 pb-1 pt-1.5">Cloud</p>
            {cloudAvailable && cloud ? (
              <button
                type="button"
                role="option"
                aria-selected={prefer === 'cloud'}
                onClick={() => {
                  onPrefer('cloud');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-graphite-200 hover:bg-graphite-750"
              >
                <Icon name="cloud" className="h-3.5 w-3.5 text-caution" />
                <span className="flex-1 truncate text-xs">
                  {cloud.provider} · {cloud.model}
                </span>
                {prefer === 'cloud' ? (
                  <Icon name="check" className="h-3.5 w-3.5 text-brand" />
                ) : null}
              </button>
            ) : (
              <p className="px-2.5 pb-2 text-xs text-graphite-500">
                Off. Messages never leave this computer. You can opt in from the{' '}
                <button
                  type="button"
                  className="text-graphite-300 underline"
                  onClick={() => navigate('privacy')}
                >
                  Privacy Center
                </button>
                .
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ContextControls({ speak, onSpeak }: { speak: boolean; onSpeak: (next: boolean) => void }) {
  const status = statusStore.useStore((state) => state.status);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const memoryOn = status?.privacy.memory_enabled ?? true;
  const ttsReady = status?.speech.tts.status === 'ready';

  const setMemory = async (next: boolean) => {
    setSaving(true);
    try {
      await api.setPrivacy({ memory_enabled: next });
      await refreshStatus();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not change memory',
        detail: (caught as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-graphite-400 hover:bg-graphite-850 hover:text-graphite-200"
      >
        <Icon name="brain" className="h-3.5 w-3.5" />
        Memory {memoryOn ? 'on' : 'off'}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="panel-raised absolute left-0 top-9 z-30 w-80 animate-fade-in px-4 py-1">
            <Toggle
              checked={memoryOn}
              disabled={saving}
              onChange={(next) => void setMemory(next)}
              label="Use personal memory"
              description="PRIVIA recalls saved facts and recent turns to answer. Nothing is stored silently, and credentials are never stored."
            />
            <Toggle
              checked={speak}
              disabled={!ttsReady}
              onChange={onSpeak}
              label="Speak replies"
              description={
                ttsReady
                  ? 'Read replies aloud with the local voice.'
                  : 'Local text-to-speech is not installed.'
              }
            />
            <button
              type="button"
              className="btn-quiet mb-2 w-full justify-start px-0 text-xs"
              onClick={() => navigate('memory')}
            >
              Manage memories
              <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- messages

function EmptyConversation({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="pt-12 text-center">
      <Logo className="mx-auto h-10 w-10" />
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-graphite-100">
        What can I help with?
      </h2>
      <p className="mt-1.5 text-sm text-graphite-500">
        I run on this computer and ask before anything with consequences.
      </p>
      <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.prompt}
            type="button"
            onClick={() => onPick(suggestion.prompt)}
            className="rounded-xl border border-graphite-800 bg-graphite-900 px-4 py-3 text-left transition-colors hover:border-graphite-700 hover:bg-graphite-850"
          >
            <span className="block text-sm font-medium text-graphite-200">{suggestion.title}</span>
            <span className="mt-0.5 block text-xs text-graphite-500">{suggestion.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({
  message,
  canRegenerate,
  onRegenerate,
}: {
  message: ChatMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] animate-fade-in whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-graphite-700/60 bg-graphite-800 px-4 py-2.5 text-[0.9rem] leading-relaxed text-graphite-100">
          {message.content}
        </div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group flex animate-fade-in gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-graphite-800 bg-graphite-900">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {message.failed ? (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-graphite-200">
            {message.content}
          </div>
        ) : message.content ? (
          <div>
            <Markdown text={message.content} />
            {message.streaming ? (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-caret bg-brand align-text-bottom" />
            ) : null}
          </div>
        ) : null}

        {message.streaming && message.activity ? (
          <p className="flex items-center gap-2 text-sm text-graphite-500">
            <Spinner className="h-3.5 w-3.5" />
            {message.activity}…
          </p>
        ) : null}

        {message.toolCalls?.length || message.accessed?.length ? (
          <ToolTimeline
            calls={message.toolCalls ?? []}
            results={message.toolResults ?? []}
            accessed={message.accessed ?? []}
          />
        ) : null}

        {!message.streaming ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-graphite-500">
            {message.location ? (
              <Chip tone={message.location === 'cloud' ? 'caution' : 'neutral'}>
                <Icon name={message.location === 'cloud' ? 'cloud' : 'lock'} className="h-3 w-3" />
                {message.location === 'cloud' ? 'Sent to cloud' : 'On this computer'}
              </Chip>
            ) : null}
            {message.model ? <span className="font-mono">{message.model}</span> : null}
            {message.durationMs ? <span>{formatDuration(message.durationMs)}</span> : null}
            {message.pending ? <Chip tone="caution">Waiting for your approval</Chip> : null}
            {message.stopped ? <Chip>Stopped</Chip> : null}
            <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {message.content ? (
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="btn-icon h-7 w-7"
                  aria-label="Copy response"
                  title="Copy"
                >
                  <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {canRegenerate ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="btn-icon h-7 w-7"
                  aria-label="Regenerate response"
                  title="Regenerate"
                >
                  <Icon name="regenerate" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- composer

function Composer({
  input,
  setInput,
  busy,
  onSend,
  onStop,
  inputRef,
  attachment,
  setAttachment,
  voice,
  onMicUp,
  location,
}: {
  input: string;
  setInput: (value: string) => void;
  busy: boolean;
  onSend: () => void;
  onStop: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  attachment: string | null;
  setAttachment: (path: string | null) => void;
  voice: ReturnType<typeof useVoice>;
  onMicUp: () => void;
  location: Prefer;
}) {
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(200, element.scrollHeight)}px`;
  }, [input, inputRef]);

  return (
    <div className="shrink-0 px-6 pb-5 pt-2">
      <div className="mx-auto max-w-3xl">
        {voice.error ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-caution">
            <Icon name="alert" className="h-3.5 w-3.5" />
            {voice.error}
            <button
              type="button"
              onClick={voice.clearError}
              className="ml-auto text-graphite-500 hover:text-graphite-300"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="relative rounded-2xl border border-graphite-700 bg-graphite-900 transition-colors focus-within:border-graphite-600">
          {attachment ? (
            <div className="flex px-3 pt-3">
              <span
                className="flex items-center gap-1.5 rounded-lg border border-graphite-700 bg-graphite-850 px-2 py-1 text-xs text-graphite-300"
                title={attachment}
              >
                <Icon name="file" className="h-3.5 w-3.5 text-graphite-500" />
                {basename(attachment)}
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Remove attachment"
                  className="text-graphite-500 hover:text-graphite-200"
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </span>
            </div>
          ) : null}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!busy) onSend();
              }
            }}
            rows={1}
            placeholder="Ask PRIVIA anything..."
            aria-label="Message"
            className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[0.9rem] text-graphite-100 placeholder:text-graphite-500 focus:outline-none"
          />

          <div className="flex items-center gap-1 px-2.5 pb-2.5">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setAttaching((v) => !v)}
              aria-label="Attach a file"
              title="Attach a file from your allowed folders"
            >
              <Icon name="paperclip" />
            </button>
            {voice.state !== 'unsupported' ? (
              <button
                type="button"
                aria-label="Hold to talk"
                aria-pressed={voice.state === 'recording'}
                disabled={voice.state === 'transcribing' || busy}
                onPointerDown={() => void voice.start()}
                onPointerUp={onMicUp}
                onPointerLeave={() => {
                  if (voice.state === 'recording') onMicUp();
                }}
                className={`btn-icon ${voice.state === 'recording' ? 'bg-brand-soft text-graphite-100' : ''}`}
                title="Hold to talk"
              >
                {voice.state === 'transcribing' ? <Spinner /> : <Icon name="mic" />}
              </button>
            ) : null}
            {voice.state === 'recording' ? <Waveform level={voice.level} active /> : null}

            <span className="ml-auto mr-2 hidden items-center gap-1 text-2xs text-graphite-600 sm:flex">
              <Icon name={location === 'cloud' ? 'cloud' : 'lock'} className="h-3 w-3" />
              {location === 'cloud'
                ? 'Will be sent to your cloud provider'
                : 'Stays on this computer'}
            </span>

            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-graphite-600 text-graphite-100 hover:bg-graphite-800"
              >
                <Icon name="stop" className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim()}
                aria-label="Send"
                title="Send"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-graphite-100 transition-colors hover:bg-brand-hover disabled:bg-graphite-800 disabled:text-graphite-500"
              >
                <Icon name="send" className="h-4 w-4" />
              </button>
            )}
          </div>

          {attaching ? (
            <AttachPicker
              onPick={(path) => {
                setAttachment(path);
                setAttaching(false);
                inputRef.current?.focus();
              }}
              onClose={() => setAttaching(false)}
            />
          ) : null}
        </div>
        <p className="mt-2 text-center text-2xs text-graphite-600">
          Enter to send · Shift+Enter for a new line · PRIVIA can make mistakes, so check important
          results.
        </p>
      </div>
    </div>
  );
}

function AttachPicker({
  onPick,
  onClose,
}: {
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [results, setResults] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    api
      .searchFiles(debounced.trim())
      .then((body) => {
        if (!cancelled) {
          setResults(body.files.filter((f) => !f.is_dir).slice(0, 8));
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError((caught as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="panel-raised absolute bottom-full left-0 z-30 mb-2 w-[26rem] animate-fade-in p-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your allowed folders"
          className="field"
          aria-label="Search files to attach"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {error ? (
            <p className="px-2 py-2 text-xs text-caution">{error}</p>
          ) : results === null ? (
            <p className="px-2 py-2 text-xs text-graphite-500">
              PRIVIA can attach files only from folders you allowed in the Privacy Center.
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-2 text-xs text-graphite-500">No files match.</p>
          ) : (
            results.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onPick(file.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-graphite-750"
              >
                <Icon name="file" className="h-3.5 w-3.5 shrink-0 text-graphite-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-graphite-200">{file.name}</span>
                  <span className="block truncate text-2xs text-graphite-500">
                    {shortenPath(file.path, 60)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
