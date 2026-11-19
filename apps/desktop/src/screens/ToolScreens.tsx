/**
 * Web reader and Terminal: the two tools that reach beyond your own data.
 *
 * These screens call the same tools the assistant calls, so the permission
 * engine and the confirmation gate apply identically whether an action came
 * from a sentence or a button.
 */

import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useToolRunner } from '@/hooks/useToolRunner';
import { api } from '@/lib/api';
import { pushToast } from '@/lib/store';
import { Chip, EmptyState, Icon, Section, SkeletonList } from '@/components/primitives';

/* ------------------------------------------------------------------- Browser */

export function Browser() {
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<Record<string, unknown> | null>(null);
  const [results, setResults] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const { run, dialog, busy } = useToolRunner();

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <p className="max-w-2xl text-sm text-graphite-400">
            A reader, not a browser. No scripts run, no cookies are sent, and private or loopback
            addresses are always blocked. Everything a page says is treated as data.
          </p>
        </header>

        <Section title="Read a page">
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await run('browser.open_url', { url });
              if (result) setPage(result.data as Record<string, unknown>);
            }}
          >
            <input
              className="field font-mono text-2xs"
              placeholder="https://example.com/page"
              aria-label="URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={busy || !url}>
              Open
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy || !url}
              onClick={async () => {
                const result = await run('browser.inspect_url', { url });
                if (result) {
                  const data = result.data as { allowed: boolean; reason: string };
                  pushToast({
                    kind: data.allowed ? 'success' : 'warning',
                    title: data.allowed ? 'That URL is allowed' : 'That URL is blocked',
                    detail: data.reason,
                  });
                }
              }}
            >
              Check first
            </button>
          </form>
        </Section>

        <Section title="Search the web">
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await run('browser.search', { query });
              if (result) {
                setResults((result.data as { results: typeof results }).results);
              }
            }}
          >
            <input
              className="field"
              placeholder="What are you looking for?"
              aria-label="Search query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={busy || !query}>
              Search
            </button>
          </form>
          {results.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {results.map((result) => (
                <li key={result.url} className="rounded-lg border border-graphite-800 px-3 py-2">
                  <p className="text-sm text-graphite-200">{result.title}</p>
                  <p className="mt-0.5 truncate font-mono text-2xs text-graphite-400">
                    {result.url}
                  </p>
                  <p className="mt-1 text-sm text-graphite-500">{result.snippet}</p>
                  <button
                    type="button"
                    className="btn-quiet mt-1 text-2xs"
                    onClick={() => setUrl(result.url)}
                  >
                    Use this URL
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {page ? (
          <Section
            title={String(page.title || page.final_url || 'Page')}
            description={String(page.final_url ?? '')}
            action={
              Array.isArray(page.injection_flags) && page.injection_flags.length > 0 ? (
                <Chip tone="caution" title={String(page.injection_flags)}>
                  <Icon name="alert" className="h-3 w-3" /> injection markers
                </Chip>
              ) : (
                <Chip>untrusted content</Chip>
              )
            }
          >
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-graphite-800 bg-graphite-950 p-3 text-2xs leading-relaxed text-graphite-300">
              {String(page.text ?? '')}
            </pre>
          </Section>
        ) : null}
      </div>
      {dialog}
    </div>
  );
}

/* ------------------------------------------------------------------ Terminal */

export function Terminal() {
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [output, setOutput] = useState<
    { command: string; stdout: string; stderr: string; code: number }[]
  >([]);
  const { run, dialog, busy } = useToolRunner();
  const allowed = useAsync(() => api.execute('terminal.list_allowed', {}), []);
  const roots = useAsync(() => api.fileRoots(), []);

  const allowedData = allowed.data?.success
    ? (allowed.data.data as {
        allowed: { program: string; description: string; always_confirms: boolean }[];
      })
    : null;

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <p className="max-w-2xl text-sm text-graphite-400">
            Commands are parsed into arguments and run without a shell. Only allowlisted programs,
            only inside your workspace folders, always with a timeout and an output cap.
          </p>
        </header>

        <Section title="Run a command">
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await run('terminal.run', { command, cwd });
              if (result) {
                const data = result.data as {
                  stdout: string;
                  stderr: string;
                  exit_code: number;
                };
                setOutput((current) => [
                  { command, stdout: data.stdout, stderr: data.stderr, code: data.exit_code },
                  ...current,
                ]);
              }
            }}
          >
            <div className="flex gap-2">
              <input
                className="field font-mono text-2xs"
                placeholder="pytest -q"
                aria-label="Command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!command}
                onClick={async () => {
                  const result = await run('terminal.inspect', { command });
                  if (result) {
                    const data = result.data as { allowed: boolean; reason: string };
                    pushToast({
                      kind: data.allowed ? 'success' : 'warning',
                      title: data.allowed ? 'Allowed' : 'Not allowed',
                      detail: data.reason,
                    });
                  }
                }}
              >
                Explain
              </button>
            </div>
            <div className="flex gap-2">
              <select
                className="field font-mono text-2xs"
                aria-label="Working directory"
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
              >
                <option value="">Choose a workspace folder…</option>
                {(roots.data?.roots ?? []).map((root) => (
                  <option key={root.path} value={root.path}>
                    {root.path}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary" disabled={busy || !command || !cwd}>
                Run…
              </button>
            </div>
          </form>
        </Section>

        {output.length > 0 ? (
          <Section title="Output">
            <ul className="space-y-3">
              {output.map((entry, index) => (
                <li key={index} className="rounded-lg border border-graphite-800">
                  <div className="flex items-center gap-2 border-b border-graphite-850 px-3 py-1.5">
                    <span className="font-mono text-2xs text-graphite-400">$ {entry.command}</span>
                    <Chip tone={entry.code === 0 ? 'ok' : 'danger'}>exit {entry.code}</Chip>
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-2xs text-graphite-300">
                    {entry.stdout || '(no output)'}
                    {entry.stderr ? `\n\nstderr:\n${entry.stderr}` : ''}
                  </pre>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section
          title="What PRIVIA may run"
          description="Anything not on this list is refused before it reaches the operating system."
        >
          {allowed.loading ? (
            <SkeletonList rows={3} />
          ) : allowedData ? (
            <div className="flex flex-wrap gap-1.5">
              {allowedData.allowed.map((rule) => (
                <span
                  key={rule.program}
                  title={rule.description}
                  className={`chip ${rule.always_confirms ? 'border-caution/40 text-caution' : 'border-graphite-700 text-graphite-400'}`}
                >
                  {rule.program}
                </span>
              ))}
            </div>
          ) : (
            <EmptyState title="Could not load the allowlist" />
          )}
        </Section>
      </div>
      {dialog}
    </div>
  );
}
