/**
 * A tiny observable store.
 *
 * PRIVIA's state is small and mostly server-owned, so a state library would be
 * more ceremony than value. This is ~40 lines, has no dependencies, and works
 * with `useSyncExternalStore` so React 18 concurrency is handled correctly.
 */

import { useSyncExternalStore } from 'react';

export type Listener = () => void;

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();

  const getState = () => state;

  const setState = (patch: Partial<T> | ((current: T) => Partial<T>)) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    let changed = false;
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (!Object.is(state[key], next[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function useStore<S>(selector: (value: T) => S): S {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(initial),
    );
  }

  return { getState, setState, subscribe, useStore };
}

export type Screen =
  | 'home'
  | 'workspace'
  | 'files'
  | 'memory'
  | 'notes'
  | 'planner'
  | 'email'
  | 'integrations'
  | 'activity'
  | 'privacy'
  | 'settings'
  | 'browser'
  | 'terminal';

export const SCREEN_TITLES: Record<Screen, string> = {
  home: 'Home',
  workspace: 'AI Workspace',
  files: 'My Files',
  memory: 'Memory',
  notes: 'Notes',
  planner: 'Planner',
  email: 'Email',
  integrations: 'Integrations',
  activity: 'Activity',
  privacy: 'Privacy Center',
  settings: 'Settings',
  browser: 'Web reader',
  terminal: 'Terminal',
};

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error' | 'warning';
  title: string;
  detail?: string;
}

/** A message handed to the AI Workspace from elsewhere (Home, Files, Notes...). */
export interface PendingPrompt {
  text: string;
  send: boolean;
  nonce: number;
}

export interface AppState {
  screen: Screen;
  sessionId: string | null;
  paletteOpen: boolean;
  toasts: Toast[];
  backendOnline: boolean;
  sidebarCollapsed: boolean;
  micActive: boolean;
  pendingPrompt: PendingPrompt | null;
  /** Bumped whenever a conversation changes, so lists can refresh. */
  sessionsVersion: number;
}

export const appStore = createStore<AppState>({
  screen: 'home',
  sessionId: null,
  paletteOpen: false,
  toasts: [],
  backendOnline: true,
  sidebarCollapsed: false,
  micActive: false,
  pendingPrompt: null,
  sessionsVersion: 0,
});

export const navigate = (screen: Screen) => appStore.setState({ screen, paletteOpen: false });

/** Open the AI Workspace with `text` in the composer, optionally sending it. */
export function askPrivia(
  text: string,
  options: { send?: boolean; newConversation?: boolean } = {},
) {
  appStore.setState((state) => ({
    screen: 'workspace',
    paletteOpen: false,
    sessionId: options.newConversation ? null : state.sessionId,
    pendingPrompt: { text, send: options.send ?? true, nonce: Date.now() },
  }));
}

export function pushToast(toast: Omit<Toast, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  appStore.setState((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
  window.setTimeout(() => dismissToast(id), toast.kind === 'error' ? 8000 : 4000);
  return id;
}

export function dismissToast(id: string) {
  appStore.setState((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
}
