import { useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { appStore, askPrivia, navigate, type Screen } from '@/lib/store';
import { preferencesStore } from '@/lib/preferences';
import { statusStore } from '@/lib/status';
import type { AuditEvent, Session } from '@/lib/types';
import { basename, formatRelative, greeting, shortenPath, titleCase } from '@/lib/format';
import { Dot, Icon, SkeletonList, type IconName } from '@/components/primitives';

const QUICK_ACTIONS: { label: string; icon: IconName; run: () => void }[] = [
  {
    label: 'Start a conversation',
    icon: 'workspace',
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

/** File paths PRIVIA touched, newest first, from the audit log. */
function recentFiles(events: AuditEvent[]): { path: string; when: string; tool: string }[] {
  const seen = new Set<string>();
  const files: { path: string; when: string; tool: string }[] = [];
  for (const event of events) {
    if (!event.tool_name?.includes('files.') || !event.target || event.outcome !== 'success')
      continue;
    if (!/[\\/]/.test(event.target) || seen.has(event.target)) continue;
    seen.add(event.target);
    files.push({ path: event.target, when: event.timestamp, tool: event.tool_name });
    if (files.length >= 5) break;
  }
  return files;
}

export function Home() {
  const name = preferencesStore.useStore((state) => state.values.display_name);
  const status = statusStore.useStore((state) => state.status);
  const sessions = useAsync(() => api.sessions(), []);
  const activity = useAsync(() => api.audit({ limit: 200 }), []);
  const [prompt, setPrompt] = useState('');

  const conversations = useMemo(
    () =>
      ((sessions.data?.sessions ?? []) as unknown as Session[])
        .filter((s) => (s.message_count ?? 1) > 0)
        .slice(0, 5),
    [sessions.data],
  );
  const files = useMemo(() => recentFiles(activity.data?.events ?? []), [activity.data]);
  const events = (activity.data?.events ?? []).slice(0, 6);

  const local = status?.models.local;
  const cloudOn = Boolean(status?.privacy.data_leaving_device);

  const submit = () => {
    if (!prompt.trim()) return;
    askPrivia(prompt.trim(), { newConversation: true });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 pb-10 pt-12">
        <p className="text-sm text-graphite-500">
          {greeting()}
          {name ? `, ${name}` : ''}
        </p>
        <h2 className="mt-1 text-[1.9rem] font-semibold leading-tight tracking-tight text-graphite-100">
          Your space. Your intelligence.
        </h2>
        <p className="mt-2 text-[0.95rem] text-graphite-400">
          Everything you need, with your own private AI assistant.
        </p>

        <form
          className="mt-7 flex items-center gap-2 rounded-2xl border border-graphite-700 bg-graphite-900 p-2 pl-4 transition-colors focus-within:border-graphite-600"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Icon name="workspace" className="h-4 w-4 shrink-0 text-graphite-500" />
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask PRIVIA anything..."
            aria-label="Ask PRIVIA"
            className="h-9 flex-1 bg-transparent text-[0.95rem] text-graphite-100 placeholder:text-graphite-500 focus:outline-none"
          />
          <button type="submit" disabled={!prompt.trim()} className="btn-primary h-9 px-4">
            Ask
            <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className="flex items-center gap-2 rounded-lg border border-graphite-800 bg-graphite-900 px-3 py-1.5 text-sm text-graphite-300 transition-colors hover:border-graphite-700 hover:text-graphite-100"
            >
              <Icon name={action.icon} className="h-3.5 w-3.5 text-graphite-500" />
              {action.label}
            </button>
          ))}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatusCard
            icon="cpu"
            title="Assistant"
            tone={!status ? 'idle' : local?.available ? 'ok' : 'warn'}
            value={!status ? 'Connecting…' : local?.available ? local.model : 'Offline planner'}
            detail={
              !status
                ? ''
                : local?.available
                  ? 'Local model through Ollama'
                  : 'No local model yet. Basic tasks still work offline.'
            }
            action={{ label: local?.available ? 'Models' : 'Set up a model', screen: 'settings' }}
          />
          <StatusCard
            icon={cloudOn ? 'cloud' : 'lock'}
            title="Privacy"
            tone={cloudOn ? 'warn' : 'ok'}
            value={cloudOn ? 'Cloud processing on' : 'Local only'}
            detail={
              cloudOn
                ? `Some requests can go to ${status?.models.cloud?.provider ?? 'your cloud provider'}.`
                : 'Nothing leaves this computer. No telemetry.'
            }
            action={{ label: 'Privacy Center', screen: 'privacy' }}
          />
          <StatusCard
            icon="shield"
            title="Access"
            tone={status && status.warnings.length === 0 ? 'ok' : 'idle'}
            value={`${status?.tools ?? '…'} tools, permission-gated`}
            detail="Consequential actions always wait for your approval."
            action={{ label: 'Permissions', screen: 'privacy' }}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Recent conversations"
            action={{ label: 'Open workspace', screen: 'workspace' }}
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
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-graphite-800"
                    >
                      <Icon name="chat" className="h-3.5 w-3.5 shrink-0 text-graphite-500" />
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

          <Panel title="Recently accessed files" action={{ label: 'My Files', screen: 'files' }}>
            {activity.loading ? (
              <SkeletonList rows={3} />
            ) : files.length === 0 ? (
              <Empty text="Files PRIVIA reads for you will be listed here." />
            ) : (
              <ul className="space-y-0.5">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                    title={file.path}
                  >
                    <Icon name="file" className="h-3.5 w-3.5 shrink-0 text-graphite-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-graphite-200">
                        {basename(file.path)}
                      </span>
                      <span className="block truncate text-2xs text-graphite-600">
                        {shortenPath(file.path, 40)}
                      </span>
                    </span>
                    <span className="text-2xs text-graphite-600">{formatRelative(file.when)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" action={{ label: 'Activity', screen: 'activity' }}>
            {activity.loading ? (
              <SkeletonList rows={3} />
            ) : events.length === 0 ? (
              <Empty text="Every action and permission decision is recorded here." />
            ) : (
              <ul className="space-y-0.5">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <Dot
                      tone={
                        event.outcome === 'success'
                          ? 'ok'
                          : event.outcome === 'failure'
                            ? 'bad'
                            : event.outcome === 'denied'
                              ? 'warn'
                              : 'idle'
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-graphite-300">
                      {titleCase(event.action)}
                      {event.tool_name ? (
                        <span className="text-graphite-500"> · {event.tool_name}</span>
                      ) : null}
                    </span>
                    <span className="text-2xs text-graphite-600">
                      {formatRelative(event.timestamp)}
                    </span>
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

function StatusCard({
  icon,
  title,
  value,
  detail,
  tone,
  action,
}: {
  icon: IconName;
  title: string;
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'idle';
  action: { label: string; screen: Screen };
}) {
  return (
    <div className="panel flex flex-col p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="h-3.5 w-3.5 text-graphite-500" />
        <span className="label">{title}</span>
        <span className="ml-auto">
          <Dot tone={tone} />
        </span>
      </div>
      <p className="mt-3 truncate text-sm font-medium text-graphite-100">{value}</p>
      <p className="mt-1 text-xs text-graphite-500">{detail}</p>
      <button
        type="button"
        onClick={() => navigate(action.screen)}
        className="mt-3 flex items-center gap-1 self-start text-xs text-graphite-400 hover:text-graphite-100"
      >
        {action.label}
        <Icon name="chevronRight" className="h-3 w-3" />
      </button>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action: { label: string; screen: Screen };
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-graphite-100">{title}</h3>
        <button
          type="button"
          onClick={() => navigate(action.screen)}
          className="text-xs text-graphite-500 hover:text-graphite-200"
        >
          {action.label}
        </button>
      </header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-6 text-center text-xs text-graphite-500">{text}</p>;
}
