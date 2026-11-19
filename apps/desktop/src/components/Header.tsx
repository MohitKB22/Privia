import { MOD_LABEL } from '@/hooks/useHotkeys';
import { appStore, navigate, SCREEN_TITLES } from '@/lib/store';
import { statusStore } from '@/lib/status';
import { Dot, Icon, Kbd } from './primitives';

export function Header() {
  const screen = appStore.useStore((state) => state.screen);
  const micActive = appStore.useStore((state) => state.micActive);
  const online = appStore.useStore((state) => state.backendOnline);
  const status = statusStore.useStore((state) => state.status);

  const local = status?.models.local;
  const cloud = Boolean(status?.privacy.data_leaving_device);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-graphite-800 bg-graphite-950/80 px-6">
      <h1 className="min-w-0 truncate text-[0.95rem] font-semibold tracking-tight text-graphite-100">
        {SCREEN_TITLES[screen]}
      </h1>

      <button
        type="button"
        onClick={() => appStore.setState({ paletteOpen: true })}
        className="mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-lg border border-graphite-800 bg-graphite-900 px-3 text-sm text-graphite-500 transition-colors hover:border-graphite-700 hover:text-graphite-300"
      >
        <Icon name="search" className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <span className="flex gap-0.5">
          <Kbd>{MOD_LABEL}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {micActive ? (
          <span className="flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-2xs font-medium text-graphite-100">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand" />
            Listening
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('settings')}
          title={!online ? 'The backend is not responding' : local?.detail}
          className="flex h-8 items-center gap-2 rounded-lg border border-graphite-800 px-2.5 text-xs text-graphite-300 transition-colors hover:border-graphite-700"
        >
          <Dot tone={!online ? 'bad' : !status ? 'idle' : local?.available ? 'ok' : 'warn'} />
          <span className="max-w-[10rem] truncate">
            {!online ? 'Offline' : local?.available ? local.model : 'Offline planner'}
          </span>
          <span className="text-graphite-600">·</span>
          <span className="flex items-center gap-1 text-graphite-500">
            <Icon name={cloud ? 'cloud' : 'lock'} className="h-3 w-3" />
            {cloud ? 'Cloud on' : 'Local'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('activity')}
          aria-label="Activity"
          title="Activity"
          className="btn-icon"
        >
          <Icon name="activity" />
        </button>
        <button
          type="button"
          onClick={() => navigate('settings')}
          aria-label="Settings"
          title="Settings"
          className="btn-icon"
        >
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
