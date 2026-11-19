/**
 * One shared status poll for the whole app.
 *
 * The sidebar, header and home screen all show model and privacy status. They
 * read it from here instead of each polling the backend.
 */

import { useEffect } from 'react';
import { api } from './api';
import { createStore, appStore } from './store';
import type { StatusResponse } from './types';

interface StatusState {
  status: StatusResponse | null;
  error: string | null;
  updatedAt: number;
}

export const statusStore = createStore<StatusState>({ status: null, error: null, updatedAt: 0 });

export async function refreshStatus(): Promise<void> {
  try {
    const status = await api.status();
    statusStore.setState({ status, error: null, updatedAt: Date.now() });
    appStore.setState({ backendOnline: true });
  } catch (caught) {
    const code = (caught as { code?: string }).code;
    statusStore.setState({ error: String((caught as Error).message ?? caught) });
    if (code === 'NETWORK_UNREACHABLE') appStore.setState({ backendOnline: false });
  }
}

/** Mount once, near the root. Polls while the window is visible. */
export function useStatusPolling(intervalMs = 15_000) {
  useEffect(() => {
    void refreshStatus();
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshStatus();
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
}
