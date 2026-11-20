import { useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useVoice } from '@/hooks/useVoice';
import { useGreeting } from '@/hooks/useGreeting';
import { api } from '@/lib/api';
import { describeActivity, type ActivityKind } from '@/lib/activity';
import { appStore, askPrivia, navigate } from '@/lib/store';
import { statusStore } from '@/lib/status';
import type { AuditEvent, Session } from '@/lib/types';
import { basename, formatRelative, shortenPath } from '@/lib/format';
import { Halo } from '@/components/Decor';
import { Icon, SkeletonList, Spinner, type IconName } from '@/components/primitives';

const QUICK_ACTIONS: { label: string; icon: IconName; run: () => void }[] = [
  {
    label: 'Start a conversation',
    icon: 'chat',
    run: () => askPrivia('', { send: false, newConversation: true }),
  },
  { label: 'Search my files', icon: 'search', run: () => navigate('files') },
  { label: 'Manage my memory', icon: 'brain', run: () => navigate('memory') },
  { label: 'Create a note', icon: 'note', run: () => navigate('notes') },
  {
    label: 'Plan my day',
    icon: 'calendar',
    run: () => askPrivia('What is on my calendar today?', { newConversation: true }),
  },
  { label: 'Open privacy center', icon: 'shield', run: () => navigate('privacy') },
];

const KIND_ICON: Record<ActivityKind, IconName> = {
  file: 'file',
  note: 'note',
  memory: 'brain',
  email: 'mail',
  calendar: 'calendar',
  web: 'globe',
  terminal: 'terminal',
  shield: 'shield',
  chat: 'search',
  settings: 'settings',
};

/** File paths PRIVIA touched, newest first, from the audit log. */
function recentFiles(events: AuditEvent[]): { path: string; when: string }[] {
  const seen = new Set<string>();
  const files: { path: string; when: string }[] = [];
  for (const event of events) {
    if (!event.tool_name?.includes('files.') || !event.target || event.outcome !== 'success')
      continue;
    if (!/[\\/]/.test(event.target) || seen.has(event.target)) continue;
    seen.add(event.target);
    files.push({ path: event.target, when: event.timestamp });
    if (files.length >= 5) break;
  }
  return files;
}

export function Home() {
  const hello = useGreeting();
  const sessions = useAsync(() => api.sessions(), []);
  const activity = useAsync(() => api.audit({ limit: 200 }), []);

  const conversations = useMemo(
    () =>
      ((sessions.data?.sessions ?? []) as unknown as Session[])
        .filter((s) => (s.message_count ?? 1) > 0)
        .slice(0, 5),
    [sessions.data],
  );
  const files = useMemo(() => recentFiles(activity.data?.events ?? []), [activity.data]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-10 pb-12 pt-12">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <section className="relative">
              <Halo className="absolute -right-24 -top-20 hidden h-64 w-[22rem] opacity-90 lg:block" />
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-graphite-500">
                Your space. Your intelligence.
              </p>
              <h2 className="relative mt-3 text-[3.4rem] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
                {hello}
              </h2>
              <p className="relative mt-3 text-[1.15rem] text-graphite-400">
                <span className="text-graphite-100">Hey, I&apos;m PRIVIA.</span> Your private
                workspace is ready.
              </p>
            </section>

            <PromptCard />

            <StatusCards />
          </div>

          <RecentActivity events={activity.data?.events ?? []} loading={activity.loading} />
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-graphite-850/70 px-3.5 py-2 text-sm text-graphite-300 transition-colors hover:border-graphite-700 hover:text-white"
            >
              <Icon name={action.icon} className="h-4 w-4 text-graphite-500" />
              {action.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel
            title="Recent conversations"
            action="Open AI Workspace"
            onAction={() => navigate('workspace')}
          >
            {sessions.loading ? (
              <SkeletonList rows={3} />
            ) : conversations.length === 0 ? (
              <Empty text="Your conversations will appear here." />
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() =>
                        appStore.setState({ sessionId: session.id, screen: 'workspace' })
                      }
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/[0.03]"
                    >
                      <Icon name="chat" className="h-4 w-4 shrink-0 text-graphite-500" />
                      <span className="min-w-0 flex-1 truncate text-sm text-graphite-200">
                        {session.title}
                      </span>
                      <span className="text-2xs text-graphite-600">
                        {formatRelative(session.updated_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recently accessed files"
            action="My Files"
            onAction={() => navigate('files')}
          >
            {activity.loading ? (
              <SkeletonList rows={3} />
            ) : files.length === 0 ? (
              <Empty text="Files PRIVIA reads for you will be listed here." />
            ) : (
              <ul className="space-y-0.5">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center gap-3 rounded-lg px-2 py-2"
                    title={file.path}
                  >
                    <Icon name="file" className="h-4 w-4 shrink-0 text-graphite-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-graphite-200">
                        {basename(file.path)}
                      </span>
                      <span className="block truncate text-2xs text-graphite-600">
                        {shortenPath(file.path, 48)}
                      </span>
                    </span>
                    <span className="text-2xs text-graphite-600">{formatRelative(file.when)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function PromptCard() {
  const [prompt, setPrompt] = useState('');
  const voice = useVoice();

  const submit = () => {
    if (prompt.trim()) askPrivia(prompt.trim(), { newConversation: true });
  };
  const stopListening = async () => {
    appStore.setState({ micActive: false });
    const text = await voice.stop();
    if (text) askPrivia(text, { newConversation: true });
  };

  return (
    <form
      className="mt-9 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-graphite-850/80 p-3 pl-3.5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur transition-colors focus-within:border-white/[0.16]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-graphite-800">
        <Icon name="workspace" className="h-5 w-5 text-white" />
      </span>
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ask Privia anything..."
        aria-label="Ask PRIVIA"
        className="h-11 min-w-0 flex-1 bg-transparent text-[1.05rem] text-graphite-100 placeholder:text-graphite-500 focus:outline-none"
      />
      {voice.state !== 'unsupported' ? (
        <button
          type="button"
          className={`btn-icon h-9 w-9 ${voice.state === 'recording' ? 'bg-brand-soft text-white' : ''}`}
          aria-label="Hold to talk"
          title="Hold to talk"
          onPointerDown={() => {
            appStore.setState({ micActive: true });
            void voice.start();
          }}
          onPointerUp={() => void stopListening()}
          onPointerLeave={() => {
            if (voice.state === 'recording') void stopListening();
          }}
        >
          {voice.state === 'transcribing' ? (
            <Spinner />
          ) : (
            <Icon name="mic" className="h-[18px] w-[18px]" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-icon h-9 w-9"
        aria-label="Attach a file"
        title="Attach a file from your allowed folders"
        onClick={() => askPrivia(prompt, { send: false, newConversation: true, attach: true })}
      >
        <Icon name="paperclip" className="h-[18px] w-[18px]" />
      </button>
      <span className="h-7 w-px bg-white/[0.08]" aria-hidden />
      <button
        type="submit"
        disabled={!prompt.trim()}
        aria-label="Send"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-[0_8px_24px_-10px_rgba(168,50,54,0.9)] transition-colors hover:bg-brand-hover disabled:bg-brand-muted disabled:text-white/60 disabled:shadow-none"
      >
        <Icon name="send" className="h-5 w-5" />
      </button>
    </form>
  );
}

function StatusCards() {
  const memory = useAsync(() => api.memories(''), []);
  const integrations = useAsync(() => api.integrations(), []);
  const approvals = useAsync(() => api.approvals(), []);
  const status = statusStore.useStore((state) => state.status);

  const memoryOn = memory.data?.enabled ?? status?.privacy.memory_enabled ?? true;
  const ready = (integrations.data?.integrations ?? []).filter((i) => i.status === 'ready').length;
  const pending = approvals.data?.approvals ?? [];

  const openApproval = () => {
    const newest = pending[0];
    if (newest) appStore.setState({ sessionId: newest.session_id, screen: 'workspace' });
    else navigate('activity');
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatusCard
        icon="database"
        title="Local Memory"
        detail={
          memory.data ? (memoryOn ? `On-device · ${memory.data.count} saved` : 'Switched off') : '…'
        }
        dot={memoryOn ? 'bg-ok' : 'bg-graphite-600'}
        onClick={() => navigate('memory')}
      />
      <StatusCard
        icon="link"
        title="Connected Sources"
        detail={integrations.data ? `${ready} available` : '…'}
        dot={ready > 0 ? 'bg-ok' : 'bg-graphite-600'}
        onClick={() => navigate('integrations')}
      />
      <StatusCard
        icon="shield"
        title="Pending Approvals"
        detail={
          approvals.data
            ? pending.length
              ? `${pending.length} ${pending.length === 1 ? 'request' : 'requests'}`
              : 'Nothing waiting'
            : '…'
        }
        dot={pending.length ? 'bg-caution' : 'bg-ok'}
        onClick={openApproval}
      />
    </div>
  );
}

function StatusCard({
  icon,
  title,
  detail,
  dot,
  onClick,
}: {
  icon: IconName;
  title: string;
  detail: string;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-2xl border border-white/[0.07] bg-graphite-850/80 p-5 text-left transition-colors hover:border-white/[0.14]"
    >
      <span className={`absolute right-5 top-5 h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <Icon name={icon} className="h-6 w-6 text-graphite-200" strokeWidth={1.6} />
      <span className="mt-4 block text-[0.95rem] font-semibold text-white">{title}</span>
      <span className="mt-1 block text-sm text-graphite-400">{detail}</span>
    </button>
  );
}

function RecentActivity({ events, loading }: { events: AuditEvent[]; loading: boolean }) {
  const items = useMemo(() => describeActivity(events, 4), [events]);
  return (
    <aside className="self-start rounded-2xl border border-white/[0.07] bg-graphite-850/80 p-5 xl:mt-28">
      <header className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <h3 className="text-[0.95rem] font-semibold text-white">Recent Activity</h3>
        <button
          type="button"
          onClick={() => navigate('activity')}
          className="flex items-center gap-1 text-xs text-graphite-300 hover:text-white"
        >
          View All
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </button>
      </header>
      {loading ? (
        <div className="pt-4">
          <SkeletonList rows={3} />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-graphite-500">
          What PRIVIA does for you will show up here, step by step.
        </p>
      ) : (
        <ol className="relative pt-4">
          {items.map((item, index) => (
            <li key={item.id} className="relative flex gap-4 pb-6 last:pb-1">
              {index < items.length - 1 ? (
                <span
                  className="absolute left-[19px] top-11 h-[calc(100%-2.25rem)] w-px bg-white/[0.08]"
                  aria-hidden
                />
              ) : null}
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-graphite-800">
                <Icon
                  name={KIND_ICON[item.kind]}
                  className={`h-[18px] w-[18px] ${item.failed ? 'text-danger' : 'text-graphite-200'}`}
                />
                {item.pending ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-caution ring-2 ring-graphite-850" />
                ) : null}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-sm font-medium leading-snug text-graphite-100">
                  {item.text}
                </span>
                <span className="mt-1 block text-xs text-graphite-500">
                  {formatRelative(item.when)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function Panel({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-graphite-850/70 p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-semibold text-white">{title}</h3>
        <button
          type="button"
          onClick={onAction}
          className="text-xs text-graphite-400 hover:text-white"
        >
          {action}
        </button>
      </header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-6 text-center text-sm text-graphite-500">{text}</p>;
}
