/**
 * Shown in place of a screen's content when PRIVIA has not been allowed to use
 * that kind of data yet. Granting is one explicit click and is recorded in the
 * audit log; it can be revoked at any time in the Privacy Center.
 */

import { useState } from 'react';
import { api } from '@/lib/api';
import { navigate, pushToast } from '@/lib/store';
import { Icon } from './primitives';

export function AccessNotice({
  scope,
  title,
  explanation,
  onGranted,
}: {
  scope: string;
  title: string;
  explanation: string;
  onGranted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const allow = async () => {
    setBusy(true);
    try {
      await api.setPermission(scope, true);
      pushToast({ kind: 'success', title: 'Access granted', detail: scope });
      onGranted();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not grant access',
        detail: (caught as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-graphite-700 bg-graphite-800">
        <Icon name="lock" className="h-4 w-4 text-graphite-300" />
      </div>
      <p className="mt-4 text-sm font-medium text-graphite-100">{title}</p>
      <p className="mt-1 max-w-md text-sm text-graphite-500">{explanation}</p>
      <p className="mt-1 font-mono text-2xs text-graphite-600">{scope}</p>
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void allow()}>
          Allow access
        </button>
        <button type="button" className="btn-ghost" onClick={() => navigate('privacy')}>
          Review in Privacy Center
        </button>
      </div>
    </div>
  );
}
