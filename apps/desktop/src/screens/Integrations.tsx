/**
 * Integrations: what PRIVIA is connected to, what each connection may do,
 * and when it last did something. Only integrations that exist are shown.
 */

import { useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { navigate, pushToast, type Screen } from '@/lib/store';
import type { AuditEvent, IntegrationInfo, ScopeInfo } from '@/lib/types';
import { formatRelative, titleCase } from '@/lib/format';
import {
  Chip,
  Dot,
  ErrorState,
  Icon,
  Page,
  Section,
  SkeletonList,
  Toggle,
  type IconName,
} from '@/components/primitives';

const META: Record<string, { label: string; icon: IconName; screen?: Screen; about: string }> = {
  files: {
    label: 'Files',
    icon: 'files',
    screen: 'files',
    about: 'Folders on this computer that you allowed.',
  },
  notes: { label: 'Notes', icon: 'note', screen: 'notes', about: 'Notes in the local database.' },
  calendar: {
    label: 'Calendar',
    icon: 'calendar',
    screen: 'planner',
    about: 'Calendar files (.ics) on this computer.',
  },
  email: {
    label: 'Email',
    icon: 'mail',
    screen: 'email',
    about: 'Local mailbox, or your own SMTP/IMAP account.',
  },
  browser: {
    label: 'Web reader',
    icon: 'globe',
    screen: 'browser',
    about: 'Fetches public web pages as text. Private network addresses are always blocked.',
  },
  terminal: {
    label: 'Terminal',
    icon: 'terminal',
    screen: 'terminal',
    about: 'An allow-list of commands, run without a shell, inside your folders.',
  },
};

const PLANNED = ['Google Calendar and CalDAV sync', 'Gmail and Outlook sign-in (OAuth)'];

function statusTone(status: IntegrationInfo['status']): 'ok' | 'warn' | 'bad' {
  if (status === 'ready') return 'ok';
  if (status === 'error' || status === 'unavailable') return 'bad';
  return 'warn';
}

export function Integrations() {
  const integrations = useAsync(() => api.integrations(), []);
  const permissions = useAsync(() => api.permissions(), []);
  const activity = useAsync(() => api.audit({ limit: 400 }), []);
  const [busyFamily, setBusyFamily] = useState<string | null>(null);

  const lastActivity = useMemo(() => {
    const map = new Map<string, AuditEvent>();
    for (const event of activity.data?.events ?? []) {
      const family = event.tool_name?.replace(/^api\./, '').split('.')[0];
      if (family && !map.has(family)) map.set(family, event);
    }
    return map;
  }, [activity.data]);

  const scopesFor = (family: string): ScopeInfo[] =>
    (permissions.data?.scopes ?? []).filter((scope) => scope.family === family);

  const setScope = async (scope: string, grant: boolean) => {
    try {
      await api.setPermission(scope, grant);
      permissions.reload();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not change that',
        detail: (caught as Error).message,
      });
    }
  };

  const disconnect = async (family: string) => {
    setBusyFamily(family);
    try {
      for (const scope of scopesFor(family).filter((s) => s.state === 'granted')) {
        await api.setPermission(scope.scope, false);
      }
      pushToast({
        kind: 'success',
        title: `${META[family]?.label ?? family} disconnected`,
        detail: 'Every permission for it was revoked.',
      });
      permissions.reload();
    } finally {
      setBusyFamily(null);
    }
  };

  if (integrations.error) {
    return (
      <Page>
        <ErrorState detail={integrations.error.message} onRetry={integrations.reload} />
      </Page>
    );
  }

  return (
    <Page intro="Everything PRIVIA can connect to, and exactly what each connection is allowed to do. Revoking access takes effect immediately.">
      {integrations.loading ? (
        <SkeletonList rows={5} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {(integrations.data?.integrations ?? []).map((integration) => {
            const meta = META[integration.family] ?? {
              label: titleCase(integration.family),
              icon: 'plug' as IconName,
              about: '',
            };
            const scopes = scopesFor(integration.family);
            const granted = scopes.filter((s) => s.state === 'granted');
            const last = lastActivity.get(integration.family);
            return (
              <section key={integration.name} className="panel flex flex-col p-5">
                <header className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-graphite-700 bg-graphite-800">
                    <Icon name={meta.icon} className="h-4 w-4 text-graphite-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-graphite-100">
                      {meta.label}
                      <Chip
                        tone={
                          statusTone(integration.status) === 'ok'
                            ? 'ok'
                            : statusTone(integration.status) === 'bad'
                              ? 'danger'
                              : 'caution'
                        }
                      >
                        <Dot tone={statusTone(integration.status)} />
                        {titleCase(integration.status)}
                      </Chip>
                    </h3>
                    <p className="mt-0.5 text-xs text-graphite-500">{meta.about}</p>
                  </div>
                  {meta.screen ? (
                    <button
                      type="button"
                      className="btn-quiet h-7 px-2 text-xs"
                      onClick={() => navigate(meta.screen!)}
                    >
                      Open
                      <Icon name="chevronRight" className="h-3 w-3" />
                    </button>
                  ) : null}
                </header>

                <p className="mt-3 text-xs text-graphite-400">{integration.detail}</p>
                <p className="mt-1 text-2xs text-graphite-600">
                  Provider <span className="font-mono">{integration.provider}</span> ·{' '}
                  {last
                    ? `last used ${formatRelative(last.timestamp)} (${last.tool_name})`
                    : 'not used yet'}
                </p>

                {scopes.length ? (
                  <div className="mt-3 divide-y divide-graphite-800 border-t border-graphite-800">
                    {scopes.map((scope) => (
                      <Toggle
                        key={scope.scope}
                        checked={scope.state === 'granted'}
                        onChange={(next) => void setScope(scope.scope, next)}
                        label={scope.scope}
                        description={scope.description}
                      />
                    ))}
                  </div>
                ) : null}

                {granted.length ? (
                  <button
                    type="button"
                    className="btn-danger mt-3 self-start text-xs"
                    disabled={busyFamily === integration.family}
                    onClick={() => void disconnect(integration.family)}
                  >
                    Disconnect (revoke {granted.length})
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <Credentials />

      <Section
        title="Not built yet"
        description="Listed so you know they are not hidden somewhere. PRIVIA does not connect to these today."
      >
        <ul className="space-y-1.5">
          {PLANNED.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-graphite-500">
              <Chip>Planned</Chip>
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

function Credentials() {
  const secrets = useAsync(() => api.secrets(), []);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const result = await api.setSecret(key, value);
      pushToast({
        kind: 'success',
        title: 'Credential stored',
        detail: `${result.stored} in ${result.backend}`,
      });
      setValue('');
      secrets.reload();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Not stored', detail: (caught as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Credentials"
      description={`Stored in ${secrets.data?.writable_backend ?? 'secure storage'} on this computer. PRIVIA never displays them again and never sends them anywhere except the service they belong to.`}
    >
      {secrets.data?.stored_keys.length ? (
        <ul className="mb-4 divide-y divide-graphite-800 rounded-lg border border-graphite-800">
          {secrets.data.stored_keys.map((stored) => (
            <li key={stored} className="flex items-center gap-3 px-3 py-2">
              <Icon name="key" className="h-3.5 w-3.5 text-graphite-500" />
              <span className="flex-1 font-mono text-xs text-graphite-200">{stored}</span>
              <span className="font-mono text-2xs text-graphite-600">••••••••</span>
              <button
                type="button"
                className="btn-icon hover:text-danger"
                aria-label={`Delete ${stored}`}
                onClick={() => void api.deleteSecret(stored).then(secrets.reload)}
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (key && value) void save();
        }}
      >
        <select
          className="field w-56"
          aria-label="Credential"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        >
          <option value="">Choose a credential…</option>
          {(secrets.data?.settable_keys ?? []).map((settable) => (
            <option key={settable} value={settable}>
              {settable}
            </option>
          ))}
        </select>
        <input
          className="field min-w-[14rem] flex-1"
          type="password"
          autoComplete="off"
          placeholder="Value"
          aria-label="Credential value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="btn-ghost" disabled={busy || !key || !value}>
          Store
        </button>
      </form>
    </Section>
  );
}
