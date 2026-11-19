/**
 * Notes, stored in the local database with full-text search.
 */

import { useEffect, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useToolRunner } from '@/hooks/useToolRunner';
import { api } from '@/lib/api';
import type { Note } from '@/lib/types';
import { formatRelative } from '@/lib/format';
import { askPrivia, pushToast } from '@/lib/store';
import { Markdown } from '@/components/Markdown';
import { Chip, Icon, SkeletonList, Spinner } from '@/components/primitives';

type Draft = { title: string; body: string; tags: string };

const EMPTY: Draft = { title: '', body: '', tags: '' };

export function Notes() {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 300);
  const list = useAsync(() => api.notes(debounced), [debounced]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const { run, busy } = useToolRunner();

  const notes = [...(list.data?.notes ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const dirty = selected
    ? draft.title !== selected.title ||
      draft.body !== selected.body ||
      draft.tags !== selected.tags.join(', ')
    : Boolean(draft.title || draft.body);

  const select = (note: Note | null) => {
    setSelected(note);
    setDraft(note ? { title: note.title, body: note.body, tags: note.tags.join(', ') } : EMPTY);
    setConfirmDelete(false);
    setSummary(null);
  };

  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const saved = selected
        ? await api.updateNote(selected.id, {
            title: draft.title || 'Untitled',
            body: draft.body,
            tags,
          })
        : await api.createNote(draft.title || 'Untitled', draft.body, tags);
      select(saved);
      list.reload();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Could not save', detail: (caught as Error).message });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const togglePin = async () => {
    if (!selected) return;
    const updated = await api.updateNote(selected.id, { pinned: !selected.pinned });
    select(updated);
    list.reload();
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await api.deleteNote(selected.id);
      select(null);
      list.reload();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Could not delete', detail: (caught as Error).message });
    }
  };

  const summarize = async () => {
    if (!selected) return;
    const result = await run('notes.summarize', {
      query: selected.title,
      limit: 1,
      max_sentences: 5,
    });
    if (result?.success) setSummary((result.data as { summary: string }).summary ?? '');
  };

  return (
    <div className="flex h-full">
      <div className="flex w-80 shrink-0 flex-col border-r border-graphite-800">
        <div className="flex items-center gap-2 border-b border-graphite-800 p-3">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-500"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="field pl-9"
            />
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={() => select(null)}
            aria-label="New note"
            title="New note"
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {list.loading && !list.data ? (
            <SkeletonList rows={5} />
          ) : notes.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-graphite-500">
              {debounced ? 'No notes match.' : 'No notes yet.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => select(note)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${selected?.id === note.id ? 'bg-graphite-850' : 'hover:bg-graphite-900'}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm text-graphite-100">
                      {note.pinned ? (
                        <Icon name="pin" className="h-3 w-3 shrink-0 text-brand" />
                      ) : null}
                      <span className="truncate">{note.title || 'Untitled'}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-graphite-500">
                      {note.body.split('\n')[0] || 'Empty'}
                    </span>
                    <span className="mt-1 block text-2xs text-graphite-600">
                      {formatRelative(note.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-graphite-800 px-6">
          <span className="text-xs text-graphite-500">
            {selected ? `Edited ${formatRelative(selected.updated_at)}` : 'New note'}
            {dirty ? ' · unsaved changes' : ''}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {selected ? (
              <>
                <button
                  type="button"
                  className="btn-quiet h-8 px-2 text-xs"
                  disabled={busy}
                  onClick={() => void summarize()}
                >
                  {busy ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <Icon name="workspace" className="h-3.5 w-3.5" />
                  )}
                  Summarize
                </button>
                <button
                  type="button"
                  className="btn-quiet h-8 px-2 text-xs"
                  onClick={() =>
                    askPrivia(`About my note "${selected.title}": `, {
                      send: false,
                      newConversation: true,
                    })
                  }
                >
                  <Icon name="chat" className="h-3.5 w-3.5" />
                  Ask
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => void togglePin()}
                  aria-label={selected.pinned ? 'Unpin' : 'Pin'}
                  title={selected.pinned ? 'Unpin' : 'Pin'}
                >
                  <Icon
                    name="pin"
                    className={`h-3.5 w-3.5 ${selected.pinned ? 'text-brand' : ''}`}
                  />
                </button>
                {confirmDelete ? (
                  <>
                    <button
                      type="button"
                      className="btn-danger h-8 text-xs"
                      onClick={() => void remove()}
                    >
                      Delete note
                    </button>
                    <button
                      type="button"
                      className="btn-quiet h-8 text-xs"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-icon hover:text-danger"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : null}
            <button
              type="button"
              className="btn-primary ml-1 h-8"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl">
            {summary !== null ? (
              <div className="panel mb-5 p-4">
                <p className="label mb-2">Summary · processed on this computer</p>
                <Markdown text={summary || 'There was not enough text to summarize.'} />
              </div>
            ) : null}
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Untitled"
              aria-label="Note title"
              className="w-full bg-transparent text-xl font-semibold tracking-tight text-graphite-100 placeholder:text-graphite-600 focus:outline-none"
            />
            <input
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              placeholder="Add tags, separated by commas"
              aria-label="Tags"
              className="mt-2 w-full bg-transparent text-xs text-graphite-400 placeholder:text-graphite-600 focus:outline-none"
            />
            {tags.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Chip key={tag}>#{tag}</Chip>
                ))}
              </div>
            ) : null}
            <textarea
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              placeholder="Start writing…"
              aria-label="Note body"
              className="mt-5 min-h-[50vh] w-full resize-none bg-transparent text-[0.9rem] leading-relaxed text-graphite-200 placeholder:text-graphite-600 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
