/**
 * Personal memory: everything PRIVIA remembers about you, in plain view.
 *
 * Each memory shows where it came from and how often it was used. You can
 * edit, pin or forget any of them, or all of them. Credentials and financial
 * identifiers are refused by the backend, whether added or edited.
 */

import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { api } from '@/lib/api';
import { pushToast } from '@/lib/store';
import { refreshStatus } from '@/lib/status';
import type { MemoryRecord } from '@/lib/types';
import { formatRelative, titleCase } from '@/lib/format';
import { Chip, EmptyState, Icon, Notice, Page, SkeletonList } from '@/components/primitives';

const KINDS = ['fact', 'preference'] as const;

/** Where a memory came from, in words. Run ids link back to the Activity log. */
function provenanceLabel(provenance: string): string {
  if (provenance.startsWith('user:explicit')) return 'Added by you';
  if (provenance.startsWith('run:')) return `From a conversation (${provenance.slice(4, 16)}…)`;
  return titleCase(provenance.replace(':', ' '));
}

export function Memory() {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 300);
  const list = useAsync(() => api.memories(debounced), [debounced]);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('fact');
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await api.remember(draft.trim(), kind);
      setDraft('');
      list.reload();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Not remembered', detail: (caught as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    try {
      const result = await api.forgetAll(true);
      pushToast({
        kind: 'success',
        title: `Forgot ${result.deleted} memories`,
        detail: 'Pinned memories were kept.',
      });
      setConfirmClear(false);
      list.reload();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not clear memory',
        detail: (caught as Error).message,
      });
    }
  };

  const enabled = list.data?.enabled ?? true;

  return (
    <Page
      intro="What PRIVIA remembers about you, and why. Memories stay in the local database and are only used to answer you."
      actions={
        confirmClear ? (
          <>
            <span className="text-xs text-graphite-400">Forget every unpinned memory?</span>
            <button type="button" className="btn-danger" onClick={() => void clearAll()}>
              Forget them
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setConfirmClear(true)}
            disabled={!list.data?.count}
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            Forget all
          </button>
        )
      }
    >
      {!enabled ? (
        <Notice
          tone="caution"
          title="Memory is switched off"
          action={
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                void api.setPrivacy({ memory_enabled: true }).then(() => {
                  list.reload();
                  void refreshStatus();
                })
              }
            >
              Turn on
            </button>
          }
        >
          PRIVIA is not saving or using memories. Existing ones are kept until you forget them.
        </Notice>
      ) : null}

      <form
        className="panel flex flex-wrap items-center gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim().length >= 2) void add();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tell PRIVIA something to remember, e.g. “I prefer morning meetings”"
          aria-label="New memory"
          className="field min-w-[16rem] flex-1"
          maxLength={2000}
        />
        <select
          className="field w-36"
          aria-label="Kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as (typeof KINDS)[number])}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {titleCase(k)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="btn-primary"
          disabled={saving || draft.trim().length < 2 || !enabled}
        >
          Remember
        </button>
      </form>
      <p className="-mt-3 flex items-center gap-1.5 px-1 text-2xs text-graphite-600">
        <Icon name="key" className="h-3 w-3" />
        Passwords, API keys and card numbers are refused, never stored.
      </p>

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-500"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search memories by meaning"
          aria-label="Search memories"
          className="field pl-9"
        />
      </div>

      {list.loading && !list.data ? (
        <SkeletonList rows={4} />
      ) : (list.data?.memories ?? []).length === 0 ? (
        <EmptyState
          icon={<Icon name="brain" />}
          title={debounced ? 'Nothing matches' : 'No memories yet'}
          detail={
            debounced ? undefined : 'Add one above, or say “remember that…” in the AI Workspace.'
          }
        />
      ) : (
        <ul className="panel divide-y divide-graphite-800">
          {(list.data?.memories ?? []).map((record) => (
            <MemoryRow key={record.id} record={record} onChanged={list.reload} />
          ))}
        </ul>
      )}
    </Page>
  );
}

function MemoryRow({ record, onChanged }: { record: MemoryRecord; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(record.content);
  const [busy, setBusy] = useState(false);

  const patch = async (change: { content?: string; pinned?: boolean }) => {
    setBusy(true);
    try {
      await api.updateMemory(record.id, change);
      setEditing(false);
      onChanged();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Not saved', detail: (caught as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    setBusy(true);
    try {
      await api.forget(record.id);
      onChanged();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not forget that',
        detail: (caught as Error).message,
      });
      setBusy(false);
    }
  };

  return (
    <li className="group px-4 py-3.5">
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void patch({ content: text.trim() });
          }}
        >
          <textarea
            className="field min-h-20"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Edit memory"
            autoFocus
            maxLength={2000}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy || text.trim().length < 2}>
              Save
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditing(false);
                setText(record.content);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-graphite-100">{record.content}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-graphite-500">
              <Chip>{titleCase(record.kind)}</Chip>
              {record.pinned ? (
                <Chip tone="brand">
                  <Icon name="pin" className="h-3 w-3" />
                  Pinned
                </Chip>
              ) : null}
              <span>{provenanceLabel(record.provenance)}</span>
              <span>·</span>
              <span>{formatRelative(record.created_at)}</span>
              <span>·</span>
              <span>
                used {record.use_count} {record.use_count === 1 ? 'time' : 'times'}
              </span>
              {record.tags.map((tag) => (
                <span key={tag} className="font-mono">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="btn-icon"
              disabled={busy}
              onClick={() => void patch({ pinned: !record.pinned })}
              aria-label={record.pinned ? 'Unpin' : 'Pin'}
              title={record.pinned ? 'Unpin' : 'Pin (kept when clearing)'}
            >
              <Icon name="pin" className={`h-3.5 w-3.5 ${record.pinned ? 'text-brand' : ''}`} />
            </button>
            <button
              type="button"
              className="btn-icon"
              disabled={busy}
              onClick={() => setEditing(true)}
              aria-label="Edit"
              title="Edit"
            >
              <Icon name="edit" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn-icon hover:text-danger"
              disabled={busy}
              onClick={() => void forget()}
              aria-label="Forget"
              title="Forget"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
