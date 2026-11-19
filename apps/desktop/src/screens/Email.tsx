/**
 * Email: mailbox status, messages, drafts, and sending with approval.
 *
 * Drafting never sends. Sending always shows the exact message, recipients
 * included, and waits for approval every time, with no way to remember it.
 */

import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useToolRunner } from '@/hooks/useToolRunner';
import { ApiRequestError, api, isPermissionError } from '@/lib/api';
import type { EmailDraft, IntegrationInfo } from '@/lib/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { AccessNotice } from '@/components/AccessNotice';
import { Markdown } from '@/components/Markdown';
import {
  Chip,
  Dot,
  EmptyState,
  ErrorState,
  Icon,
  Page,
  Section,
  Segmented,
  SkeletonList,
} from '@/components/primitives';

interface MessageSummary {
  id: string;
  folder: string;
  subject: string;
  sender: { address: string; name: string | null } | null;
  to: { address: string; name: string | null }[];
  date: string | null;
  snippet: string;
  unread: boolean;
}

type Tab = 'INBOX' | 'sent' | 'drafts';

export function Email() {
  const [tab, setTab] = useState<Tab>('drafts');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 300);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const mailbox = useAsync(async () => {
    const body = await api.integrations();
    return body.integrations.find((i: IntegrationInfo) => i.family === 'email') ?? null;
  }, []);
  const drafts = useAsync(() => api.emailDrafts(), []);
  const messages = useAsync(async () => {
    if (tab === 'drafts') return null;
    const result = await api.execute('email.search', { query: debounced, folder: tab, limit: 50 });
    if (!result.success)
      throw new ApiRequestError(
        result.error_code ?? 'TOOL_EXECUTION_FAILED',
        result.error ?? 'Search failed',
        400,
      );
    return (result.data as { messages: MessageSummary[] }).messages;
  }, [tab, debounced]);

  const { run, dialog, busy } = useToolRunner(() => {
    drafts.reload();
    messages.reload();
  });

  const connected = mailbox.data?.provider === 'smtp';

  return (
    <Page
      intro="Drafts and the local mailbox live on this computer. Sending always shows you the exact message and waits for your approval."
      actions={
        <button type="button" className="btn-primary" onClick={() => setComposing(true)}>
          <Icon name="edit" className="h-3.5 w-3.5" />
          New draft
        </button>
      }
    >
      <div className="panel flex items-center gap-3 px-4 py-3">
        <Dot tone={mailbox.data?.status === 'ready' ? 'ok' : mailbox.data ? 'warn' : 'idle'} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-graphite-100">
            {mailbox.data?.name === 'email.local' || !connected
              ? 'Local mailbox'
              : 'SMTP / IMAP mailbox'}
          </p>
          <p className="truncate text-2xs text-graphite-500">
            {mailbox.data?.detail ?? 'Checking…'}
          </p>
        </div>
        <Chip tone={connected ? 'caution' : 'neutral'}>
          <Icon name={connected ? 'globe' : 'lock'} className="h-3 w-3" />
          {connected ? 'Sends over the internet' : 'Nothing is transmitted'}
        </Chip>
      </div>

      {composing ? (
        <Compose
          busy={busy}
          onCancel={() => setComposing(false)}
          onSave={(args) =>
            void run('email.draft', args).then((r) => r?.success && setComposing(false))
          }
        />
      ) : null}

      <div className="flex items-center gap-2">
        <Segmented<Tab>
          label="Folder"
          value={tab}
          onChange={(next) => {
            setTab(next);
            setOpenId(null);
          }}
          options={[
            { value: 'drafts', label: 'Drafts' },
            { value: 'INBOX', label: 'Inbox' },
            { value: 'sent', label: 'Sent' },
          ]}
        />
        {tab !== 'drafts' ? (
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages"
              aria-label="Search messages"
              className="field pl-9"
            />
          </div>
        ) : null}
      </div>

      {tab === 'drafts' ? (
        drafts.loading ? (
          <SkeletonList rows={3} />
        ) : isPermissionError(drafts.error) ? (
          <AccessNotice
            scope="email:draft"
            title="PRIVIA has not been allowed to write drafts"
            explanation="Drafts stay on this computer. Sending is a separate permission and always asks first."
            onGranted={drafts.reload}
          />
        ) : drafts.error ? (
          <ErrorState
            detail={drafts.error.message}
            code={drafts.error.code}
            onRetry={drafts.reload}
          />
        ) : (drafts.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Icon name="mail" />}
            title="No drafts"
            detail="Write one, or ask PRIVIA to draft a reply."
          />
        ) : (
          <ul className="panel divide-y divide-graphite-800">
            {(drafts.data ?? []).map((draft: EmailDraft) => (
              <li key={draft.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-graphite-100">
                      {draft.subject || '(no subject)'}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-graphite-500">
                      To {draft.to.map((a) => a.address).join(', ')} ·{' '}
                      {formatRelative(draft.updated_at)}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-sm text-graphite-400">{draft.body}</p>
                  </div>
                  <Chip
                    tone={
                      draft.status === 'sent'
                        ? 'ok'
                        : draft.status === 'failed'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {draft.status}
                  </Chip>
                  {draft.status === 'draft' ? (
                    <button
                      type="button"
                      className="btn-ghost shrink-0"
                      disabled={busy}
                      onClick={() => void run('email.send', { draft_id: draft.id })}
                    >
                      Review and send
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : messages.loading ? (
        <SkeletonList rows={4} />
      ) : isPermissionError(messages.error) ? (
        <AccessNotice
          scope="email:read"
          title="PRIVIA has not been allowed to read email"
          explanation="Allow read access to search and open messages. Message text is treated as untrusted content and can never instruct PRIVIA to act."
          onGranted={messages.reload}
        />
      ) : messages.error ? (
        <ErrorState detail={messages.error.message} onRetry={messages.reload} />
      ) : (messages.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Icon name="mail" />}
          title={debounced ? 'No messages match' : 'This folder is empty'}
          detail={
            !connected && tab === 'INBOX'
              ? 'The local mailbox does not receive mail. Connect an SMTP/IMAP account in Integrations to read your inbox.'
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <ul className="panel divide-y divide-graphite-800 lg:col-span-2">
            {(messages.data ?? []).map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(message.id)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-graphite-800 ${openId === message.id ? 'bg-graphite-800' : ''}`}
                >
                  <p className="flex items-center gap-2 truncate text-sm text-graphite-100">
                    {message.unread ? <Dot tone="brand" /> : null}
                    {message.subject || '(no subject)'}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-graphite-500">
                    {tab === 'sent'
                      ? `To ${message.to.map((a) => a.address).join(', ')}`
                      : message.sender?.name || message.sender?.address}{' '}
                    · {formatDateTime(message.date)}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-graphite-500">{message.snippet}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className="lg:col-span-3">
            {openId ? (
              <Reader id={openId} folder={tab} run={run} busy={busy} />
            ) : (
              <EmptyState title="Select a message to read it" />
            )}
          </div>
        </div>
      )}
      {dialog}
    </Page>
  );
}

function Reader({
  id,
  folder,
  run,
  busy,
}: {
  id: string;
  folder: string;
  run: ReturnType<typeof useToolRunner>['run'];
  busy: boolean;
}) {
  const message = useAsync(async () => {
    const result = await api.execute('email.read', { message_id: id, folder });
    if (!result.success)
      throw new ApiRequestError(
        result.error_code ?? 'TOOL_EXECUTION_FAILED',
        result.error ?? 'Could not open the message',
        400,
      );
    return result.data as { message: MessageSummary & { body: string | null } } & Record<
      string,
      unknown
    >;
  }, [id, folder]);
  const [reply, setReply] = useState('');

  if (message.loading) return <SkeletonList rows={4} />;
  if (message.error) return <ErrorState detail={message.error.message} />;
  const data = (message.data?.message ?? message.data) as
    (MessageSummary & { body?: string | null }) | undefined;
  if (!data) return null;

  return (
    <article className="panel p-5">
      <h3 className="text-base font-semibold text-graphite-100">
        {data.subject || '(no subject)'}
      </h3>
      <p className="mt-1 text-xs text-graphite-500">
        From{' '}
        {data.sender?.name
          ? `${data.sender.name} <${data.sender.address}>`
          : (data.sender?.address ?? 'unknown')}{' '}
        · {formatDateTime(data.date)}
      </p>
      <div className="mt-4 border-t border-graphite-800 pt-4">
        <Markdown text={data.body ?? data.snippet ?? ''} />
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-2xs text-graphite-600">
        <Icon name="shield" className="h-3 w-3" />
        Message content is treated as untrusted: it can inform PRIVIA but never instruct it.
      </p>
      <form
        className="mt-4 space-y-2 border-t border-graphite-800 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run('email.reply', { message_id: id, folder, body: reply }).then(
            (r) => r?.success && setReply(''),
          );
        }}
      >
        <textarea
          className="field min-h-24"
          placeholder="Write a reply. It is saved as a draft, never sent."
          aria-label="Reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <button type="submit" className="btn-ghost" disabled={busy || !reply.trim()}>
          Save reply as draft
        </button>
      </form>
    </article>
  );
}

function Compose({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (args: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ to: '', subject: '', body: '' });
  return (
    <Section title="New draft" description="Saving a draft never sends anything.">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            to: form.to
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
            subject: form.subject,
            body: form.body,
          });
        }}
      >
        <input
          className="field"
          placeholder="To (comma separated)"
          aria-label="To"
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
        />
        <input
          className="field"
          placeholder="Subject"
          aria-label="Subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <textarea
          className="field min-h-32"
          placeholder="Message"
          aria-label="Message body"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !form.to.trim()}>
            Save draft
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Section>
  );
}
