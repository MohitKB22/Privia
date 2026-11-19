/**
 * Where the backend is, and how to prove we are PRIVIA's own client.
 *
 * In the desktop app the Rust shell starts the backend on a free loopback port
 * with a per-launch token, and hands both over through `app_info`. In a browser
 * during development, requests go to the Vite dev server, which proxies `/api`
 * and `/health` to `make dev-api`.
 *
 * Nothing here is baked in at build time, so one build works on every machine.
 */

export interface Connection {
  base: string;
  token: string;
  desktop: boolean;
  managedBackend: boolean;
  version: string;
  platform: string;
}

export type BackendProcessState =
  | { state: 'running' }
  | { state: 'external' }
  | { state: 'exited'; code: number | null }
  | { state: 'failed'; message: string };

export interface BackendProcessStatus {
  state: BackendProcessState;
  log_tail: string[];
}

interface AppInfo {
  version: string;
  api_base: string;
  token: string;
  platform: string;
  managed_backend: boolean;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

let pending: Promise<Connection> | null = null;

/** Resolve once and reuse. Every API call awaits this. */
export function getConnection(): Promise<Connection> {
  if (!pending) {
    pending = (async () => {
      if (isDesktop()) {
        const info = await invoke<AppInfo>('app_info');
        return {
          base: info.api_base.replace(/\/$/, ''),
          token: info.token,
          desktop: true,
          managedBackend: info.managed_backend,
          version: info.version,
          platform: info.platform,
        };
      }
      return {
        base: (import.meta.env.VITE_PRIVIA_API ?? '').replace(/\/$/, ''),
        token: import.meta.env.VITE_PRIVIA_TOKEN ?? '',
        desktop: false,
        managedBackend: false,
        version: '',
        platform: 'browser',
      };
    })();
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

/** Test hook: forget the cached connection. */
export function resetConnection() {
  pending = null;
}

export async function backendProcessStatus(): Promise<BackendProcessStatus | null> {
  if (!isDesktop()) return null;
  return invoke<BackendProcessStatus>('backend_status');
}

export async function restartBackend(): Promise<void> {
  if (isDesktop()) await invoke('restart_backend');
}

/** Native folder picker. Returns null in a browser or when cancelled. */
export async function pickFolder(): Promise<string | null> {
  if (!isDesktop()) return null;
  return invoke<string | null>('pick_folder');
}

/** Open an http(s) link in the user's browser, never inside the app window. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isDesktop()) {
    await invoke('open_external', { url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
