/**
 * My Files: only the folders the user allowed, browsed through the same path
 * guard the assistant uses. Anything outside them is invisible, and the screen
 * says so instead of failing silently.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useToolRunner } from '@/hooks/useToolRunner';
import { ApiRequestError, api } from '@/lib/api';
import { isDesktop, pickFolder } from '@/lib/connection';
import { askPrivia, pushToast } from '@/lib/store';
import type { FileEntry } from '@/lib/types';
import { basename, formatBytes, formatRelative } from '@/lib/format';
import { Markdown } from '@/components/Markdown';
import {
  EmptyState,
  ErrorState,
  Icon,
  Notice,
  SkeletonList,
  Spinner,
} from '@/components/primitives';

type Preview = { path: string; text: string; truncated: boolean };

const BOUNDARY_CODES = new Set(['PATH_NOT_ALLOWED', 'PATH_TRAVERSAL']);

function parent(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return index > 0 ? trimmed.slice(0, index) : trimmed;
}

export function Files() {
  const roots = useAsync(() => api.fileRoots(), []);
  const [path, setPath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 300);
  const [searchContents, setSearchContents] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiRequestError | null>(null);
  const [creating, setCreating] = useState(false);

  const rootList = useMemo(() => roots.data?.roots ?? [], [roots.data]);
  const root = rootList.find((r) => path && (path === r.path || path.startsWith(r.path)));

  useEffect(() => {
    if (!path && rootList.length > 0) setPath(rootList[0]!.path);
  }, [path, rootList]);

  const listing = useAsync(async () => (path ? api.listDirectory(path) : null), [path]);
  const results = useAsync(
    async () => (debounced ? api.searchFiles(debounced, searchContents) : null),
    [debounced, searchContents],
  );
  const { run, dialog, busy } = useToolRunner();

  const open = async (entry: FileEntry) => {
    setProblem(null);
    setSummary(null);
    if (entry.is_dir) {
      setPath(entry.path);
      setPreview(null);
      setQuery('');
      return;
    }
    try {
      setPreview(await api.readFile(entry.path));
    } catch (caught) {
      setPreview(null);
      setProblem(caught instanceof ApiRequestError ? caught : null);
    }
  };

  const allowFolder = async () => {
    let chosen = await pickFolder().catch(() => null);
    if (!chosen && !isDesktop()) chosen = window.prompt('Full path of the folder to allow') ?? null;
    if (!chosen) return;
    try {
      await api.addDirectory(chosen);
      pushToast({ kind: 'success', title: 'Folder allowed', detail: chosen });
      roots.reload();
      setPath(chosen);
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'That folder cannot be allowed',
        detail: (caught as Error).message,
      });
    }
  };

  const summarize = async () => {
    if (!preview) return;
    const result = await run('files.summarize', { path: preview.path, max_sentences: 6 });
    if (result?.success) {
      const data = result.data as { summary?: string; text?: string };
      setSummary(data.summary ?? data.text ?? '');
    }
  };

  const atRoot = Boolean(root && path === root.path);
  const entries = debounced ? (results.data?.files ?? []) : (listing.data?.entries ?? []);
  const loading = debounced ? results.loading : listing.loading;
  const listError = debounced ? results.error : listing.error;

  if (roots.loading) {
    return (
      <div className="p-8">
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (rootList.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <EmptyState
          icon={<Icon name="folderOpen" />}
          title="PRIVIA cannot see any of your files yet"
          detail="Choose a folder PRIVIA may read. Everything outside it stays invisible, and deleting, moving or overwriting a file always asks you first."
          action={
            <button type="button" className="btn-primary" onClick={() => void allowFolder()}>
              Allow a folder
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[46%] min-w-[22rem] flex-col border-r border-graphite-800">
        <div className="space-y-3 border-b border-graphite-800 px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {rootList.map((r) => (
              <button
                key={r.path}
                type="button"
                title={r.path}
                onClick={() => {
                  setPath(r.path);
                  setQuery('');
                  setPreview(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  root?.path === r.path
                    ? 'border-graphite-600 bg-graphite-800 text-graphite-100'
                    : 'border-graphite-800 text-graphite-400 hover:border-graphite-700 hover:text-graphite-200'
                }`}
              >
                <Icon name="folder" className="h-3.5 w-3.5" />
                {r.name}
              </button>
            ))}
            <button
              type="button"
              className="btn-quiet h-7 px-2 text-xs"
              onClick={() => void allowFolder()}
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              Allow a folder
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-500"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your allowed folders"
                aria-label="Search files"
                className="field pl-9"
              />
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-graphite-400">
              <input
                type="checkbox"
                checked={searchContents}
                onChange={(event) => setSearchContents(event.target.checked)}
                className="accent-[#A83236]"
              />
              Contents
            </label>
          </div>
        </div>

        {!debounced && path ? (
          <div className="flex items-center gap-2 border-b border-graphite-800 px-5 py-2 text-xs text-graphite-500">
            <button
              type="button"
              className="btn-icon h-6 w-6"
              disabled={atRoot}
              onClick={() => setPath(parent(path))}
              aria-label="Up one folder"
              title={atRoot ? 'This is the top of an allowed folder' : 'Up'}
            >
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            </button>
            <span className="truncate font-mono" title={path}>
              {path}
            </span>
            <button
              type="button"
              className="btn-quiet ml-auto h-6 px-2 text-2xs"
              onClick={() => setCreating((v) => !v)}
            >
              <Icon name="plus" className="h-3 w-3" />
              New file
            </button>
          </div>
        ) : null}

        {creating && path ? (
          <CreateFile
            folder={path}
            busy={busy}
            onCancel={() => setCreating(false)}
            onCreate={(name, content) =>
              void run('files.create', {
                path: `${path.replace(/[\\/]$/, '')}/${name}`,
                content,
              }).then((r) => {
                if (r?.success) {
                  setCreating(false);
                  listing.reload();
                }
              })
            }
          />
        ) : null}

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="px-2">
              <SkeletonList rows={6} />
            </div>
          ) : listError ? (
            BOUNDARY_CODES.has(listError.code) ? (
              <Boundary />
            ) : (
              <ErrorState detail={listError.message} code={listError.code} />
            )
          ) : entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-graphite-500">
              {debounced ? 'Nothing matches.' : 'This folder is empty.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => void open(entry)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-graphite-850 ${preview?.path === entry.path ? 'bg-graphite-850' : ''}`}
                  >
                    <Icon
                      name={entry.is_dir ? 'folder' : 'file'}
                      className={`h-4 w-4 shrink-0 ${entry.is_dir ? 'text-graphite-400' : 'text-graphite-500'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-graphite-200">{entry.name}</span>
                      {debounced ? (
                        <span className="block truncate text-2xs text-graphite-600">
                          {entry.path}
                        </span>
                      ) : null}
                    </span>
                    {!entry.is_dir ? (
                      <span className="shrink-0 text-2xs tabular-nums text-graphite-600">
                        {formatBytes(entry.size_bytes)}
                      </span>
                    ) : null}
                    <span className="w-16 shrink-0 text-right text-2xs text-graphite-600">
                      {formatRelative(entry.modified_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {problem ? (
          <div className="p-6">
            {BOUNDARY_CODES.has(problem.code) ? (
              <Boundary />
            ) : (
              <ErrorState
                title="That file could not be opened"
                detail={problem.message}
                code={problem.code}
              />
            )}
          </div>
        ) : preview ? (
          <div className="px-7 py-6">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-graphite-100">
                  {basename(preview.path)}
                </h2>
                <p
                  className="mt-0.5 truncate font-mono text-2xs text-graphite-500"
                  title={preview.path}
                >
                  {preview.path}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
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
                className="btn-ghost"
                onClick={() =>
                  askPrivia(`Help me with this file.\n\nAttached file: ${preview.path}`, {
                    send: false,
                    newConversation: true,
                  })
                }
              >
                <Icon name="chat" className="h-3.5 w-3.5" />
                Ask about it
              </button>
            </div>
            {summary !== null ? (
              <div className="panel mt-4 p-4">
                <p className="label mb-2">Summary · processed on this computer</p>
                <Markdown text={summary || 'There was not enough text to summarize.'} />
              </div>
            ) : null}
            {preview.truncated ? (
              <div className="mt-4">
                <Notice>Only the first part of this file is shown.</Notice>
              </div>
            ) : null}
            <div className="mt-4 rounded-xl border border-graphite-800 bg-graphite-900">
              {/\.(md|markdown)$/i.test(preview.path) ? (
                <div className="p-5">
                  <Markdown text={preview.text} />
                </div>
              ) : (
                <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-graphite-300">
                  {preview.text}
                </pre>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Icon name="file" />}
              title="Select a file to preview it"
              detail="Reading is logged in Activity. Changes to files always ask you first."
            />
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}

function Boundary() {
  return (
    <Notice tone="caution" title="Outside your allowed folders">
      PRIVIA can only see folders you have allowed, and never system or credential files such as SSH
      keys, even inside them. Allow the folder in the Privacy Center if you want PRIVIA to use it.
    </Notice>
  );
}

function CreateFile({
  folder,
  busy,
  onCreate,
  onCancel,
}: {
  folder: string;
  busy: boolean;
  onCreate: (name: string, content: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const valid = /^[^\\/:*?"<>|]{1,120}$/.test(name.trim()) && !name.trim().startsWith('.');
  return (
    <form
      className="space-y-2 border-b border-graphite-800 px-5 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onCreate(name.trim(), content);
      }}
    >
      <p className="text-2xs text-graphite-500">
        New file in <span className="font-mono">{basename(folder)}</span>. You will approve it
        before it is written.
      </p>
      <input
        className="field"
        placeholder="notes.md"
        aria-label="File name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <textarea
        className="field min-h-20 font-mono text-xs"
        placeholder="Contents (optional)"
        aria-label="File contents"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy || !valid}>
          Review and create
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
