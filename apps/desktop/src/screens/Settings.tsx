import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import {
  backendProcessStatus,
  getConnection,
  isDesktop,
  openExternal,
  restartBackend,
} from '@/lib/connection';
import { preferencesStore, savePreferences } from '@/lib/preferences';
import { navigate, pushToast } from '@/lib/store';
import { refreshStatus, statusStore } from '@/lib/status';
import { formatBytes, formatDuration } from '@/lib/format';
import {
  Chip,
  Dot,
  Icon,
  Page,
  RiskChip,
  Section,
  Segmented,
  SkeletonList,
  Spinner,
  Toggle,
} from '@/components/primitives';

export const RELEASES_URL = 'https://github.com/MohitKB22/Privia/releases';

export function Settings() {
  const status = statusStore.useStore((state) => state.status);
  const prefs = preferencesStore.useStore((state) => state.values);

  const save = (patch: Parameters<typeof savePreferences>[0]) =>
    void savePreferences(patch).catch((caught: unknown) =>
      pushToast({ kind: 'error', title: 'Not saved', detail: (caught as Error).message }),
    );

  return (
    <Page
      width="max-w-3xl"
      intro="How PRIVIA looks, which model it uses, and what to do when something is wrong. Privacy controls live in the Privacy Center."
    >
      <Section title="Appearance">
        <div className="divide-y divide-graphite-800">
          <div className="flex items-center justify-between py-3">
            <span>
              <span className="block text-sm text-graphite-200">Theme</span>
              <span className="mt-0.5 block text-sm text-graphite-500">
                PRIVIA uses one dark theme, designed for long sessions.
              </span>
            </span>
            <Chip>Dark</Chip>
          </div>
          <Toggle
            checked={prefs.reduce_motion}
            onChange={(next) => save({ reduce_motion: next })}
            label="Reduce motion"
            description="Turn off transitions and animations."
          />
          <Toggle
            checked={prefs.sidebar_collapsed}
            onChange={(next) => save({ sidebar_collapsed: next })}
            label="Compact sidebar"
            description="Show only icons in the navigation."
          />
        </div>
      </Section>

      <ModelSettings />

      <Section
        title="Speech"
        description="Speech runs on this computer. Audio is never stored or uploaded."
      >
        {status ? (
          <dl className="divide-y divide-graphite-800 text-sm">
            <Row label="Speech to text">
              <StatusLine
                ok={status.speech.stt.status === 'ready'}
                text={status.speech.stt.detail}
              />
            </Row>
            <Row label="Text to speech">
              <StatusLine
                ok={status.speech.tts.status === 'ready'}
                text={status.speech.tts.detail}
              />
            </Row>
          </dl>
        ) : (
          <SkeletonList rows={2} />
        )}
      </Section>

      <Section
        title="Storage"
        description="Everything PRIVIA keeps is in one SQLite database on this computer."
      >
        {status ? (
          <dl className="divide-y divide-graphite-800 text-sm">
            <Row label="Database">
              <span className="break-all font-mono text-xs text-graphite-300">
                {status.database.path}
              </span>
            </Row>
            <Row label="Size">{formatBytes(status.database.size_bytes)}</Row>
            <Row label="Schema">version {status.database.schema_version}</Row>
          </dl>
        ) : (
          <SkeletonList rows={2} />
        )}
        <button
          type="button"
          className="btn-quiet mt-3 px-0 text-xs"
          onClick={() => navigate('privacy')}
        >
          Export or delete your data in the Privacy Center
          <Icon name="arrowRight" className="h-3.5 w-3.5" />
        </button>
      </Section>

      <Section
        title="Permissions"
        description="What PRIVIA may read and do is decided per permission, and every decision is recorded."
      >
        <button type="button" className="btn-ghost" onClick={() => navigate('privacy')}>
          <Icon name="shield" className="h-3.5 w-3.5" />
          Open the Privacy Center
        </button>
      </Section>

      <Section title="Startup">
        <div className="flex items-center justify-between gap-6">
          <span>
            <span className="block text-sm text-graphite-200">Open PRIVIA on</span>
            <span className="mt-0.5 block text-sm text-graphite-500">
              The screen you see when the app starts.
            </span>
          </span>
          <Segmented<'home' | 'workspace'>
            label="Start screen"
            value={prefs.start_screen}
            onChange={(next) => save({ start_screen: next })}
            options={[
              { value: 'home', label: 'Home' },
              { value: 'workspace', label: 'AI Workspace' },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Updates"
        description="PRIVIA does not update itself or check for updates in the background, because that would mean contacting a server."
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-graphite-300">Version {status?.version ?? '…'}</span>
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={() => void openExternal(RELEASES_URL)}
          >
            Check releases on GitHub
            <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </button>
        </div>
      </Section>

      <Troubleshooting />
      <ToolCatalogue />
    </Page>
  );
}

function ModelSettings() {
  const models = useAsync(() => api.models(), []);
  const [switching, setSwitching] = useState<string | null>(null);

  const choose = async (model: string) => {
    setSwitching(model);
    try {
      await api.setLocalModel(model);
      pushToast({ kind: 'success', title: 'Model changed', detail: model });
      models.reload();
      void refreshStatus();
    } catch (caught) {
      pushToast({ kind: 'error', title: 'Could not switch', detail: (caught as Error).message });
    } finally {
      setSwitching(null);
    }
  };

  const data = models.data;
  const ollamaMissing = data?.local_provider === 'ollama' && data.installed.length === 0;

  return (
    <Section
      title="AI model"
      description="PRIVIA runs models on this computer through Ollama. Local models use your own hardware, so there is no subscription and nothing leaves the machine."
      action={
        <button
          type="button"
          className="btn-quiet h-7 shrink-0 whitespace-nowrap px-2 text-xs"
          onClick={models.reload}
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Check again
        </button>
      }
    >
      {models.loading && !data ? (
        <SkeletonList rows={3} />
      ) : data ? (
        <>
          <dl className="divide-y divide-graphite-800 text-sm">
            <Row label="Local runtime">
              <StatusLine
                ok={data.local.available}
                text={
                  data.local_provider === 'ollama'
                    ? `Ollama at ${data.ollama_url}`
                    : 'Offline planner (no model)'
                }
              />
            </Row>
            <Row label="Active model">
              <span className="font-mono text-xs">{data.local.model}</span>
              <span className="ml-2 text-xs text-graphite-500">{data.local.detail}</span>
            </Row>
            <Row label="Cloud">
              {data.cloud ? (
                <span className="text-xs">
                  <span className="font-mono">
                    {data.cloud.provider}:{data.cloud.model}
                  </span>
                  <span className="ml-2 text-graphite-500">
                    {data.cloud_enabled ? 'enabled' : 'configured, switched off'}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-graphite-500">
                  Not configured. Basic use never needs it.
                </span>
              )}
            </Row>
          </dl>

          {data.installed.length ? (
            <div className="mt-4">
              <p className="label mb-2">Installed models</p>
              <ul className="space-y-1">
                {data.installed.map((name) => {
                  const active = name === data.local.model || name === `${data.local.model}:latest`;
                  return (
                    <li
                      key={name}
                      className="flex items-center gap-3 rounded-lg border border-graphite-800 px-3 py-2"
                    >
                      <Icon name="cpu" className="h-3.5 w-3.5 text-graphite-500" />
                      <span className="flex-1 font-mono text-xs text-graphite-200">{name}</span>
                      {active ? (
                        <Chip tone="brand">In use</Chip>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost h-7 text-xs"
                          disabled={switching !== null}
                          onClick={() => void choose(name)}
                        >
                          {switching === name ? (
                            <Spinner className="h-3.5 w-3.5" />
                          ) : (
                            'Use this model'
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {ollamaMissing ? <OllamaGuide /> : null}
        </>
      ) : null}
    </Section>
  );
}

export function OllamaGuide() {
  return (
    <div className="mt-4 rounded-xl border border-graphite-700 bg-graphite-900 p-4">
      <p className="text-sm font-medium text-graphite-100">Set up a local model</p>
      <ol className="mt-3 space-y-3 text-sm text-graphite-400">
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-graphite-600 text-2xs text-graphite-300">
            1
          </span>
          <span>
            Install Ollama, the free local model runtime, from{' '}
            <button
              type="button"
              className="text-graphite-100 underline decoration-brand-line underline-offset-2"
              onClick={() => void openExternal('https://ollama.com/download')}
            >
              ollama.com/download
            </button>
            , then open it.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-graphite-600 text-2xs text-graphite-300">
            2
          </span>
          <span>
            Download a model. In a terminal, run
            <code className="mx-1 rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-xs text-graphite-100">
              ollama pull llama3.2:3b
            </code>
            (about 2 GB, good for 8 GB of RAM) or
            <code className="mx-1 rounded bg-graphite-800 px-1.5 py-0.5 font-mono text-xs text-graphite-100">
              ollama pull llama3.1:8b
            </code>
            (about 5 GB, better answers, 16 GB of RAM recommended).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-graphite-600 text-2xs text-graphite-300">
            3
          </span>
          <span>Press “Check again”, then choose the model here.</span>
        </li>
      </ol>
      <p className="mt-3 text-xs text-graphite-500">
        Until then, PRIVIA uses its offline planner: files, notes, calendar and memory still work,
        with simpler answers.
      </p>
    </div>
  );
}

function Troubleshooting() {
  const status = statusStore.useStore((state) => state.status);
  const processState = useAsync(() => backendProcessStatus(), []);
  const [restarting, setRestarting] = useState(false);

  const copyDiagnostics = async () => {
    const connection = await getConnection();
    const lines = [
      `PRIVIA ${status?.version ?? '?'} (${connection.desktop ? 'desktop' : 'browser'}, ${connection.platform})`,
      `Backend: python ${status?.python ?? '?'} on ${status?.platform ?? '?'}, ${status?.app_env ?? '?'}`,
      `Model: ${status?.models.local.provider}:${status?.models.local.model} available=${status?.models.local.available}`,
      `Cloud processing: ${status?.privacy.cloud_processing_enabled ? 'on' : 'off'}`,
      `Database schema: ${status?.database.schema_version}`,
      `Uptime: ${status ? formatDuration(status.uptime_seconds * 1000) : '?'}`,
      ...(status?.warnings ?? []).map((w) => `Warning: ${w}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      pushToast({
        kind: 'success',
        title: 'Diagnostics copied',
        detail: 'No file paths, messages or personal data are included.',
      });
    } catch {
      pushToast({ kind: 'error', title: 'The clipboard is not available' });
    }
  };

  const restart = async () => {
    setRestarting(true);
    await restartBackend().catch(() => undefined);
    window.setTimeout(() => {
      void refreshStatus();
      processState.reload();
      setRestarting(false);
    }, 2500);
  };

  const process = processState.data;

  return (
    <Section title="Troubleshooting">
      <div className="flex flex-wrap gap-2">
        {isDesktop() ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={restarting}
            onClick={() => void restart()}
          >
            {restarting ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Icon name="refresh" className="h-3.5 w-3.5" />
            )}
            Restart assistant
          </button>
        ) : null}
        <button type="button" className="btn-ghost" onClick={() => void copyDiagnostics()}>
          <Icon name="copy" className="h-3.5 w-3.5" />
          Copy diagnostics
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void savePreferences({ onboarding_completed: false })}
        >
          <Icon name="regenerate" className="h-3.5 w-3.5" />
          Run setup again
        </button>
      </div>
      {status?.warnings.length ? (
        <ul className="mt-4 space-y-1 text-sm text-caution">
          {status.warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      {process?.log_tail.length ? (
        <details className="mt-4 rounded-lg border border-graphite-800 bg-graphite-900">
          <summary className="cursor-pointer px-3 py-2 text-xs text-graphite-400">
            Backend log (last {process.log_tail.length} lines)
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-graphite-800 px-3 py-2 font-mono text-2xs leading-relaxed text-graphite-400">
            {process.log_tail.join('\n')}
          </pre>
        </details>
      ) : null}
    </Section>
  );
}

function ToolCatalogue() {
  const tools = useAsync(() => api.tools(), []);
  return (
    <Section
      title="Tools"
      description="Every action PRIVIA can take. The model can only propose these; a separate runtime checks permissions and arguments before anything runs."
    >
      <details>
        <summary className="cursor-pointer text-sm text-graphite-400">
          Show all {tools.data?.length ?? ''} tools
        </summary>
        <ul className="mt-3 divide-y divide-graphite-800 rounded-lg border border-graphite-800">
          {(tools.data ?? []).map((tool) => (
            <li key={tool.name} className="flex items-center gap-3 px-3 py-2">
              <span className="w-44 shrink-0 font-mono text-xs text-graphite-200">{tool.name}</span>
              <span
                className="min-w-0 flex-1 truncate text-xs text-graphite-500"
                title={tool.description}
              >
                {tool.description}
              </span>
              {tool.requires_confirmation ? <Chip tone="caution">asks first</Chip> : null}
              <RiskChip level={tool.risk_level} />
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5">
      <dt className="w-32 shrink-0 text-graphite-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-graphite-200">{children}</dd>
    </div>
  );
}

function StatusLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="flex items-start gap-2 text-xs">
      <span className="mt-1.5">
        <Dot tone={ok ? 'ok' : 'warn'} />
      </span>
      <span className="text-graphite-300">{text}</span>
    </span>
  );
}
