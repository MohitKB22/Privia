/**
 * First-run setup.
 *
 * Nothing is granted by default. This wizard explains what PRIVIA can do, helps
 * the user get a local model running, and lets them grant access one item at a
 * time. Every step can be revisited later from Settings and the Privacy Center.
 */

import { useEffect, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { getConnection, isDesktop, pickFolder } from '@/lib/connection';
import { savePreferences } from '@/lib/preferences';
import { appStore, pushToast } from '@/lib/store';
import { refreshStatus, statusStore } from '@/lib/status';
import { formatBytes } from '@/lib/format';
import { Wordmark } from '@/components/Decor';
import { Dot, Icon, Logo, Spinner, Toggle, type IconName } from '@/components/primitives';
import { OllamaGuide } from './Settings';

const STEPS = [
  'Welcome',
  'System check',
  'Local model',
  'AI provider',
  'Permissions',
  'Your access',
  'Ready',
] as const;

/** The scopes offered during setup. Everything else stays off until asked for. */
const STARTER_SCOPES: { scope: string; label: string; detail: string }[] = [
  {
    scope: 'files:read',
    label: 'Read files in allowed folders',
    detail: 'Search, open and summarize documents.',
  },
  { scope: 'notes:read', label: 'Read your notes', detail: 'Find and summarize notes.' },
  { scope: 'notes:write', label: 'Write notes', detail: 'Create and edit notes when you ask.' },
  { scope: 'calendar:read', label: 'Read your calendar', detail: 'See events to plan your day.' },
  {
    scope: 'memory:read',
    label: 'Recall memories',
    detail: 'Use what you asked PRIVIA to remember.',
  },
  {
    scope: 'memory:write',
    label: 'Save memories',
    detail: 'Remember facts when you say “remember…”.',
  },
  {
    scope: 'email:draft',
    label: 'Draft emails',
    detail: 'Drafts only. Sending is separate and always asks.',
  },
];

const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'Runs on this computer',
    text: 'Your data, history and memory stay in a local database. No account, no telemetry.',
  },
  {
    icon: 'shield',
    title: 'Asks before it acts',
    text: 'Sending, deleting or changing anything shows you the exact action first.',
  },
  {
    icon: 'activity',
    title: 'Shows its work',
    text: 'Every tool call and permission decision is recorded in Activity.',
  },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const last = STEPS.length - 1;

  const finish = async () => {
    try {
      const prefs = await savePreferences({ onboarding_completed: true });
      appStore.setState({ screen: prefs.start_screen === 'workspace' ? 'workspace' : 'home' });
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Setup could not be saved',
        detail: (caught as Error).message,
      });
    }
  };

  return (
    <div className="flex h-screen bg-graphite-950">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-graphite-800 bg-graphite-900 px-5 py-6 md:flex">
        <div data-tauri-drag-region className="titlebar-inset flex items-center">
          <Wordmark />
        </div>
        <ol className="mt-10 space-y-1">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${index === step ? 'bg-graphite-800 text-graphite-100' : index < step ? 'text-graphite-400' : 'text-graphite-600'}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs ${index < step ? 'border-graphite-600 bg-graphite-700 text-graphite-200' : index === step ? 'border-brand bg-brand-soft text-graphite-100' : 'border-graphite-700'}`}
              >
                {index < step ? <Icon name="check" className="h-3 w-3" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className="mt-auto text-2xs text-graphite-600">
          You can change every choice later in Settings and the Privacy Center.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-14 animate-fade-in" key={step}>
            {step === 0 ? <Welcome /> : null}
            {step === 1 ? <SystemCheck /> : null}
            {step === 2 ? <LocalModel /> : null}
            {step === 3 ? <Provider /> : null}
            {step === 4 ? <PermissionsExplained /> : null}
            {step === 5 ? <GrantAccess /> : null}
            {step === 6 ? <Ready /> : null}
          </div>
        </div>
        <footer className="flex items-center gap-2 border-t border-graphite-800 px-8 py-4">
          {step > 0 ? (
            <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : null}
          <span className="ml-auto text-xs text-graphite-600">
            Step {step + 1} of {STEPS.length}
          </span>
          {step < last ? (
            <button type="button" className="btn-primary" onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Get started' : 'Continue'}
              <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void finish()}>
              Open PRIVIA
              <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-graphite-100">{title}</h1>
      <p className="mt-2 text-[0.95rem] text-graphite-400">{text}</p>
    </header>
  );
}

function Welcome() {
  return (
    <>
      <Logo className="mb-6 h-12 w-12" />
      <Heading
        title="Welcome to PRIVIA"
        text="Your space. Your intelligence. A personal AI assistant that works for you, on your own computer."
      />
      <ul className="space-y-3">
        {PRINCIPLES.map((p) => (
          <li key={p.title} className="panel flex gap-3 p-4">
            <Icon name={p.icon} className="mt-0.5 h-4 w-4 shrink-0 text-graphite-300" />
            <span>
              <span className="block text-sm font-medium text-graphite-100">{p.title}</span>
              <span className="mt-0.5 block text-sm text-graphite-500">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Check({
  ok,
  label,
  detail,
  pending,
}: {
  ok: boolean;
  label: string;
  detail: string;
  pending?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5">
        {pending ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <Icon
            name={ok ? 'check' : 'alert'}
            className={`h-4 w-4 ${ok ? 'text-ok' : 'text-caution'}`}
          />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-graphite-100">{label}</span>
        <span className="mt-0.5 block break-words text-xs text-graphite-500">{detail}</span>
      </span>
    </li>
  );
}

function SystemCheck() {
  const health = useAsync(() => api.health(), []);
  const status = useAsync(() => api.status(), []);
  const connection = useAsync(() => getConnection(), []);
  const s = status.data;
  return (
    <>
      <Heading
        title="Checking your system"
        text="PRIVIA needs no account and no internet connection for local use. Here is what it found."
      />
      <ul className="panel divide-y divide-graphite-800 px-4">
        <Check
          pending={health.loading}
          ok={Boolean(health.data)}
          label="Assistant backend"
          detail={
            health.data
              ? `Running locally, version ${health.data.version}`
              : (health.error?.message ?? 'Checking…')
          }
        />
        <Check
          pending={status.loading}
          ok={Boolean(s && s.database.schema_version > 0)}
          label="Local database"
          detail={
            s ? `Ready at ${s.database.path} (${formatBytes(s.database.size_bytes)})` : 'Checking…'
          }
        />
        <Check
          pending={connection.loading}
          ok
          label="Application"
          detail={
            connection.data
              ? `${connection.data.desktop ? 'Desktop app' : 'Browser preview'} on ${s?.platform ?? connection.data.platform}`
              : 'Checking…'
          }
        />
        <Check
          pending={status.loading}
          ok={!s?.privacy.data_leaving_device}
          label="Privacy"
          detail={
            s?.privacy.data_leaving_device
              ? 'Cloud processing is enabled in your configuration.'
              : 'Local only. Nothing is sent to a cloud service, and there is no telemetry.'
          }
        />
      </ul>
      {s?.warnings.length ? (
        <ul className="mt-4 space-y-1 text-sm text-caution">
          {s.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function LocalModel() {
  const models = useAsync(() => api.models(), []);
  const [switching, setSwitching] = useState<string | null>(null);
  const data = models.data;

  const choose = async (model: string) => {
    setSwitching(model);
    try {
      await api.setLocalModel(model);
      models.reload();
      void refreshStatus();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not use that model',
        detail: (caught as Error).message,
      });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <Heading
        title="Your local model"
        text="PRIVIA uses Ollama to run AI models on your own hardware. It is free, and nothing you type leaves this computer."
      />
      {models.loading && !data ? (
        <Spinner />
      ) : data && data.installed.length > 0 ? (
        <div className="panel p-4">
          <p className="flex items-center gap-2 text-sm text-graphite-100">
            <Dot tone="ok" />
            Ollama is running with {data.installed.length} model
            {data.installed.length === 1 ? '' : 's'}.
          </p>
          <ul className="mt-3 space-y-1">
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
                    <span className="text-xs text-graphite-300">Selected</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost h-7 text-xs"
                      disabled={switching !== null}
                      onClick={() => void choose(name)}
                    >
                      {switching === name ? <Spinner className="h-3.5 w-3.5" /> : 'Use this'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <>
          <div className="panel flex items-center gap-3 p-4">
            <Dot tone="warn" />
            <p className="flex-1 text-sm text-graphite-300">
              {data?.local.detail ?? 'No local model was found.'}
            </p>
            <button type="button" className="btn-ghost h-8 text-xs" onClick={models.reload}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Check again
            </button>
          </div>
          <OllamaGuide />
        </>
      )}
      <p className="mt-6 text-xs text-graphite-500">
        Local models use your computer&apos;s memory and processor. Free hosting does not mean free
        AI compute; here, the compute is yours.
      </p>
    </>
  );
}

function Provider() {
  const status = statusStore.useStore((state) => state.status);
  const cloud = status?.models.cloud;
  const [enabling, setEnabling] = useState(false);
  const cloudOn = Boolean(status?.privacy.cloud_processing_enabled);

  const setCloud = async (next: boolean) => {
    setEnabling(true);
    try {
      await api.setPrivacy({ cloud_processing: next });
      await refreshStatus();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not change cloud processing',
        detail: (caught as Error).message,
      });
    } finally {
      setEnabling(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  return (
    <>
      <Heading
        title="Where your requests run"
        text="Local is the default and needs nothing else. Cloud providers are optional, off by default, and need your own API key."
      />
      <div className="space-y-3">
        <div className="panel flex items-start gap-3 border-brand-line p-4">
          <Icon name="lock" className="mt-0.5 h-4 w-4 text-graphite-100" />
          <span className="flex-1">
            <span className="block text-sm font-medium text-graphite-100">Local (recommended)</span>
            <span className="mt-0.5 block text-sm text-graphite-500">
              {status?.models.local.available
                ? `Using ${status.models.local.model} through Ollama.`
                : 'Using the offline planner until a local model is installed.'}
            </span>
          </span>
          <span className="text-xs text-graphite-300">Always on</span>
        </div>
        <div className="panel px-4">
          {cloud ? (
            <Toggle
              tone="caution"
              checked={cloudOn}
              disabled={enabling}
              onChange={(next) => void setCloud(next)}
              label={`Allow ${cloud.provider} (${cloud.model})`}
              description="Requests may leave this computer only when you choose cloud for a message, and each conversation still asks for the cloud permission."
            />
          ) : (
            <div className="flex items-start gap-3 py-4">
              <Icon name="cloud" className="mt-0.5 h-4 w-4 text-graphite-500" />
              <span>
                <span className="block text-sm text-graphite-300">Cloud: not configured</span>
                <span className="mt-0.5 block text-sm text-graphite-500">
                  To use OpenAI or Anthropic later, set the provider in your configuration and store
                  the API key under Integrations. Basic use never needs it.
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PermissionsExplained() {
  const rules: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'lock',
      title: 'Nothing is allowed by default',
      text: 'PRIVIA cannot read a file, note or calendar until you allow that kind of access.',
    },
    {
      icon: 'folder',
      title: 'Files are limited to folders you choose',
      text: 'Everything else on your computer is invisible to it, and credential files such as SSH keys stay hidden even inside allowed folders.',
    },
    {
      icon: 'shield',
      title: 'Consequential actions always ask',
      text: 'Sending email, deleting or moving files, changing events and running commands show you the exact action. Your approval covers only that action.',
    },
    {
      icon: 'globe',
      title: 'Content is not a command',
      text: 'Text from web pages, emails and files can inform PRIVIA, but it can never tell PRIVIA to do something.',
    },
    {
      icon: 'activity',
      title: 'Everything is recorded',
      text: 'Activity lists every tool call, approval and refusal. You can export or delete it at any time.',
    },
  ];
  return (
    <>
      <Heading
        title="How permissions work"
        text="The AI model only proposes actions. A separate, deterministic part of PRIVIA checks every action against your permissions before it runs."
      />
      <ul className="space-y-3">
        {rules.map((rule) => (
          <li key={rule.title} className="panel flex gap-3 p-4">
            <Icon name={rule.icon} className="mt-0.5 h-4 w-4 shrink-0 text-graphite-300" />
            <span>
              <span className="block text-sm font-medium text-graphite-100">{rule.title}</span>
              <span className="mt-0.5 block text-sm text-graphite-500">{rule.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function GrantAccess() {
  const permissions = useAsync(() => api.permissions(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const states = new Map((permissions.data?.scopes ?? []).map((s) => [s.scope, s.state]));
  const folders = permissions.data?.allowed_directories ?? [];

  const toggle = async (scope: string, next: boolean) => {
    setBusy(scope);
    try {
      await api.setPermission(scope, next);
      permissions.reload();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'Could not change that',
        detail: (caught as Error).message,
      });
    } finally {
      setBusy(null);
    }
  };

  const addFolder = async () => {
    let chosen = await pickFolder().catch(() => null);
    if (!chosen && !isDesktop()) chosen = window.prompt('Full path of the folder to allow') ?? null;
    if (!chosen) return;
    try {
      await api.addDirectory(chosen);
      permissions.reload();
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: 'That folder cannot be allowed',
        detail: (caught as Error).message,
      });
    }
  };

  return (
    <>
      <Heading
        title="Choose what PRIVIA may use"
        text="Allow only what you need. Each item is separate, and you can revoke any of them later."
      />
      <section className="panel p-4">
        <div className="flex items-center gap-3">
          <Icon name="folderOpen" className="h-4 w-4 text-graphite-300" />
          <span className="flex-1">
            <span className="block text-sm font-medium text-graphite-100">Folders</span>
            <span className="block text-xs text-graphite-500">
              {folders.length
                ? `${folders.length} allowed`
                : 'None yet. PRIVIA cannot see any files.'}
            </span>
          </span>
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => void addFolder()}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Allow a folder
          </button>
        </div>
        {folders.length ? (
          <ul className="mt-3 space-y-1">
            {folders.map((folder) => (
              <li
                key={folder}
                className="truncate rounded-md bg-graphite-900 px-3 py-1.5 font-mono text-xs text-graphite-300"
                title={folder}
              >
                {folder}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="panel mt-3 divide-y divide-graphite-800 px-4">
        {STARTER_SCOPES.map((item) => (
          <Toggle
            key={item.scope}
            checked={states.get(item.scope) === 'granted'}
            disabled={busy === item.scope || permissions.loading}
            onChange={(next) => void toggle(item.scope, next)}
            label={item.label}
            description={`${item.detail} (${item.scope})`}
          />
        ))}
      </section>
      <p className="mt-3 text-xs text-graphite-500">
        Sending email, deleting files, running terminal commands and cloud processing are not
        offered here. PRIVIA asks for them in context, when you first need them.
      </p>
    </>
  );
}

function Ready() {
  const status = useAsync(() => api.status(), []);
  const permissions = useAsync(() => api.permissions(), []);
  const granted = (permissions.data?.scopes ?? []).filter((s) => s.state === 'granted').length;
  const folders = permissions.data?.allowed_directories.length ?? 0;
  const s = status.data;
  return (
    <>
      <Heading
        title="You are ready"
        text="Here is how PRIVIA is set up. You can change any of it later."
      />
      <ul className="panel divide-y divide-graphite-800 px-4">
        <Check
          pending={status.loading}
          ok={Boolean(s)}
          label="Assistant"
          detail={s ? 'Running on this computer' : 'Checking…'}
        />
        <Check
          pending={status.loading}
          ok={Boolean(s?.models.local.available)}
          label="Model"
          detail={
            s?.models.local.available
              ? `${s.models.local.model} through Ollama`
              : 'Offline planner. Install a model any time from Settings.'
          }
        />
        <Check
          pending={permissions.loading}
          ok={folders > 0}
          label="Folders"
          detail={
            folders
              ? `${folders} folder${folders === 1 ? '' : 's'} allowed`
              : 'No folders allowed. File features stay off until you allow one.'
          }
        />
        <Check
          pending={permissions.loading}
          ok
          label="Permissions"
          detail={`${granted} permission${granted === 1 ? '' : 's'} granted. Everything else asks first.`}
        />
        <Check
          pending={status.loading}
          ok={!s?.privacy.data_leaving_device}
          label="Privacy"
          detail={
            s?.privacy.data_leaving_device ? 'Cloud processing is on.' : 'Local only. No telemetry.'
          }
        />
      </ul>
    </>
  );
}
