import { MOD_LABEL } from '@/hooks/useHotkeys';
import { appStore, navigate, SCREEN_TITLES } from '@/lib/store';
import { statusStore } from '@/lib/status';
import { Icon, Kbd } from './primitives';

/** The thin top bar: page title, where processing happens, and global tools. */
export function Header() {
  const screen = appStore.useStore((state) => state.screen);
  const micActive = appStore.useStore((state) => state.micActive);
  const online = appStore.useStore((state) => state.backendOnline);
  const status = statusStore.useStore((state) => state.status);

  const cloud = Boolean(status?.privacy.data_leaving_device);
  const mode = !online
    ? { label: 'Assistant offline', dot: 'bg-danger', icon: 'alert' as const }
    : cloud
      ? { label: 'Cloud processing on', dot: 'bg-caution', icon: 'cloud' as const }
      : { label: 'Local mode active', dot: 'bg-ok', icon: 'lock' as const };

  return (
    <header
      data-tauri-drag-region
      className="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.06] px-6"
    >
      <h1 data-tauri-drag-region className="min-w-0 truncate text-sm font-medium text-graphite-200">
        {screen === 'home' ? '' : SCREEN_TITLES[screen]}
      </h1>

      <div data-tauri-drag-region className="ml-auto flex items-center gap-1">
        {micActive ? (
          <span className="mr-2 flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-1 text-2xs font-medium text-graphite-100">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand" />
            Listening
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('privacy')}
          title={status?.models.local.detail ?? mode.label}
          className="mr-2 flex h-8 items-center gap-2 rounded-lg px-2 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-graphite-300 transition-colors hover:bg-white/[0.04]"
        >
          <Icon name={mode.icon} className="h-3.5 w-3.5 text-graphite-400" />
          <span className={`h-1.5 w-1.5 rounded-full ${mode.dot}`} />
          {mode.label}
        </button>

        <button
          type="button"
          onClick={() => appStore.setState({ paletteOpen: true })}
          className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 text-xs text-graphite-400 transition-colors hover:border-graphite-700 hover:text-graphite-200"
          aria-label="Search"
        >
          <Icon name="search" className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Search</span>
          <span className="flex gap-0.5">
            <Kbd>{MOD_LABEL}</Kbd>
            <Kbd>K</Kbd>
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
