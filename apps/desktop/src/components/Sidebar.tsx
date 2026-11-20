import { appStore, navigate, SCREEN_TITLES, type Screen } from '@/lib/store';
import { savePreferences } from '@/lib/preferences';
import { statusStore } from '@/lib/status';
import { Wordmark } from './Decor';
import { Icon, type IconName } from './primitives';

const GROUPS: { screen: Screen; icon: IconName }[][] = [
  [
    { screen: 'home', icon: 'home' },
    { screen: 'workspace', icon: 'chat' },
  ],
  [
    { screen: 'files', icon: 'files' },
    { screen: 'memory', icon: 'brain' },
    { screen: 'notes', icon: 'note' },
    { screen: 'planner', icon: 'calendar' },
    { screen: 'email', icon: 'mail' },
  ],
  [
    { screen: 'integrations', icon: 'plug' },
    { screen: 'activity', icon: 'activity' },
    { screen: 'privacy', icon: 'shield' },
    { screen: 'settings', icon: 'settings' },
  ],
];

/** Sub-screens that belong to a sidebar item. */
const PARENT: Partial<Record<Screen, Screen>> = {
  browser: 'integrations',
  terminal: 'integrations',
};

export function Sidebar() {
  const current = appStore.useStore((state) => state.screen);
  const collapsed = appStore.useStore((state) => state.sidebarCollapsed);
  const active = PARENT[current] ?? current;

  const toggle = () => {
    appStore.setState({ sidebarCollapsed: !collapsed });
    void savePreferences({ sidebar_collapsed: !collapsed }).catch(() => undefined);
  };

  return (
    <nav
      aria-label="Main"
      className={`relative z-10 flex shrink-0 flex-col border-r border-white/[0.06] bg-graphite-900/75 backdrop-blur-xl transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[232px]'
      }`}
    >
      <div data-tauri-drag-region className="titlebar-inset">
        <div
          data-tauri-drag-region
          className={`flex h-16 items-center ${collapsed ? 'justify-center' : 'px-6'}`}
        >
          <Wordmark collapsed={collapsed} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {GROUPS.map((group, index) => (
          <ul key={index} className={`space-y-1 ${index > 0 ? 'mt-4' : ''}`}>
            {group.map((item) => {
              const isActive = active === item.screen;
              const label = SCREEN_TITLES[item.screen];
              return (
                <li key={item.screen}>
                  <button
                    type="button"
                    onClick={() => navigate(item.screen)}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? label : undefined}
                    className={`group flex h-10 w-full items-center rounded-xl text-[0.875rem] transition-colors ${
                      collapsed ? 'justify-center' : 'gap-3 px-3.5'
                    } ${
                      isActive
                        ? 'nav-active font-medium text-white'
                        : 'text-graphite-300 hover:bg-white/[0.04] hover:text-graphite-100'
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      strokeWidth={isActive ? 2 : 1.75}
                      className={`h-[18px] w-[18px] shrink-0 ${
                        isActive ? 'text-white' : 'text-graphite-400 group-hover:text-graphite-200'
                      }`}
                    />
                    {!collapsed ? <span className="truncate">{label}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
      </div>

      <DataStaysLocal collapsed={collapsed} />

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`mx-3 mb-3 flex h-8 items-center rounded-lg text-xs text-graphite-500 transition-colors hover:bg-white/[0.04] hover:text-graphite-300 ${
          collapsed ? 'justify-center' : 'gap-2.5 px-3'
        }`}
      >
        <Icon name={collapsed ? 'expand' : 'collapse'} className="h-4 w-4" />
        {!collapsed ? 'Collapse' : null}
      </button>
    </nav>
  );
}

/** The privacy promise, kept true: it changes the moment cloud processing is on. */
function DataStaysLocal({ collapsed }: { collapsed: boolean }) {
  const status = statusStore.useStore((state) => state.status);
  const online = appStore.useStore((state) => state.backendOnline);

  const cloudOn = Boolean(status?.privacy.data_leaving_device);
  const local = status?.models.local;
  const title = !online
    ? 'Assistant offline'
    : cloudOn
      ? 'Cloud processing is on'
      : 'Your data stays local';
  const detail = !online
    ? 'The local backend is not responding'
    : !status
      ? 'Connecting…'
      : local?.available
        ? `${local.model} · on device`
        : 'Offline planner · on device';
  const dot = !online ? 'bg-danger' : cloudOn ? 'bg-caution' : 'bg-brand';

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => navigate('privacy')}
        title={`${title} · ${detail}`}
        className="relative mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-graphite-850/70 text-graphite-300 hover:border-graphite-700"
      >
        <Icon name="shield" className="h-4 w-4" />
        <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${dot}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('privacy')}
      title={local?.detail ?? title}
      className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-graphite-850/70 px-3 py-2.5 text-left transition-colors hover:border-graphite-700"
    >
      <Icon name="shield" className="h-[18px] w-[18px] shrink-0 text-graphite-300" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-graphite-100">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{title}</span>
        </span>
        <span className="mt-0.5 block truncate text-2xs text-graphite-500">{detail}</span>
      </span>
    </button>
  );
}
