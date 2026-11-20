/**
 * Holds the interface until the local backend answers.
 *
 * In the desktop app the shell starts the backend a moment before the window
 * opens, so the first second or two is normal start-up. If the process exits
 * or never answers, the user sees why (with the last log lines) and can
 * restart it, instead of a blank window.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import {
  backendProcessStatus,
  getConnection,
  isDesktop,
  restartBackend,
  type BackendProcessStatus,
} from '@/lib/connection';
import { Icon, Logo, Spinner } from './primitives';

const START_TIMEOUT_MS = 45_000;
const POLL_MS = 400;

type GateState =
  | { phase: 'starting' }
  | { phase: 'ready' }
  | { phase: 'failed'; reason: string; process: BackendProcessStatus | null };

export function BackendGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ phase: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    const check = async () => {
      if (cancelled) return;
      try {
        const connection = await getConnection();
        if (connection.desktop) document.documentElement.dataset.platform = connection.platform;
        await api.health();
        if (!cancelled) setState({ phase: 'ready' });
        return;
      } catch {
        /* not up yet */
      }
      const process = await backendProcessStatus().catch(() => null);
      const dead =
        process && (process.state.state === 'exited' || process.state.state === 'failed');
      if (dead) {
        const reason =
          process.state.state === 'failed'
            ? process.state.message
            : `The local backend stopped (exit code ${process.state.state === 'exited' ? (process.state.code ?? 'unknown') : 'unknown'}).`;
        if (!cancelled) setState({ phase: 'failed', reason, process });
        return;
      }
      if (Date.now() - started > START_TIMEOUT_MS) {
        if (!cancelled)
          setState({
            phase: 'failed',
            reason: isDesktop()
              ? 'The local backend did not answer in time.'
              : 'The backend is not running. From the repository, start it with `make dev-api`.',
            process,
          });
        return;
      }
      window.setTimeout(() => void check(), POLL_MS);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(async (restart: boolean) => {
    setState({ phase: 'starting' });
    if (restart) await restartBackend().catch(() => undefined);
    setAttempt((n) => n + 1);
  }, []);

  if (state.phase === 'ready') return <>{children}</>;

  return (
    <div className="flex h-screen items-center justify-center bg-graphite-950 px-6">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-12" />
        {state.phase === 'starting' ? (
          <>
            <p className="mt-5 text-sm font-medium text-graphite-100">Starting PRIVIA</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-sm text-graphite-500">
              <Spinner className="h-3.5 w-3.5" />
              Preparing your private workspace on this computer
            </p>
          </>
        ) : (
          <div className="mt-5 text-left">
            <p className="text-center text-sm font-medium text-graphite-100">
              PRIVIA could not start its assistant
            </p>
            <p className="mt-1 text-center text-sm text-graphite-400">{state.reason}</p>
            {state.process?.log_tail.length ? (
              <details className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900">
                <summary className="cursor-pointer px-3 py-2 text-xs text-graphite-400">
                  Show technical details
                </summary>
                <pre className="max-h-56 overflow-auto border-t border-graphite-800 px-3 py-2 font-mono text-2xs leading-relaxed text-graphite-400">
                  {state.process.log_tail.slice(-30).join('\n')}
                </pre>
              </details>
            ) : null}
            <div className="mt-5 flex justify-center gap-2">
              {isDesktop() ? (
                <button type="button" className="btn-primary" onClick={() => void retry(true)}>
                  <Icon name="refresh" className="h-4 w-4" />
                  Restart assistant
                </button>
              ) : null}
              <button type="button" className="btn-ghost" onClick={() => void retry(false)}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
