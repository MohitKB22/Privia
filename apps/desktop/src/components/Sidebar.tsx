import { appStore, navigate, SCREEN_TITLES, type Screen } from '@/lib/store';
import { savePreferences } from '@/lib/preferences';
import { statusStore } from '@/lib/status';
import { Dot, Icon, Logo, type IconName } from './primitives';

const GROUPS: { screen: Screen; icon: IconName }[][] = [
  [
    { screen: 'home', icon: 'home' },
    { screen: 'workspace', icon: 'workspace' },
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
  ],
  [
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
      className={`flex shrink-0 flex-col border-r border-graphite-800 bg-graphite-900 transition-[width] duration-200 ${
        collapsed ? 'w-[60px]' : 'w-60'
      }`}
    >
      <div className={`flex h-14 items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-4'}`}>
        <Logo className="h-7 w-7 shrink-0" />
        {!collapsed ? (
          <span className="text-sm font-semibold tracking-[0.14em] text-graphite-100">PRIVIA</span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-2 pt-1">
        {GROUPS.map((group, index) => (
          <ul
            key={index}
            className={`space-y-0.5 ${index > 0 ? 'mt-3 border-t border-graphite-800 pt-3' : ''}`}
          >
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
                    className={`group relative flex h-8 w-full items-center rounded-lg text-sm transition-colors ${
                      collapsed ? 'justify-center' : 'gap-2.5 px-2.5'
                    } ${
                      isActive
                        ? 'bg-graphite-800 text-graphite-100'
                        : 'text-graphite-400 hover:bg-graphite-850 hover:text-graphite-200'
                    }`}
                  >
                    {isActive ? (
                      <span
                        className="absolute left-0 top-1.5 h-5 w-[2px] rounded-full bg-brand"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      name={item.icon}
                      className={`h-[17px] w-[17px] shrink-0 ${
                        isActive
                          ? 'text-graphite-100'
                          : 'text-graphite-500 group-hover:text-graphite-300'
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

      <ConnectionStatus collapsed={collapsed} />

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`mx-2.5 mb-3 flex h-8 items-center rounded-lg text-xs text-graphite-500 transition-colors hover:bg-graphite-850 hover:text-graphite-300 ${
          collapsed ? 'justify-center' : 'gap-2.5 px-2.5'
        }`}
      >
        <Icon name={collapsed ? 'expand' : 'collapse'} className="h-4 w-4" />
        {!collapsed ? 'Collapse' : null}
      </button>
    </nav>
  );
}

function ConnectionStatus({ collapsed }: { collapsed: boolean }) {
  const status = statusStore.useStore((state) => state.status);
  const online = appStore.useStore((state) => state.backendOnline);

  const local = status?.models.local;
  const cloudOn = Boolean(status?.privacy.data_leaving_device);
  const tone = !online ? 'bad' : !status ? 'idle' : local?.available ? 'ok' : 'warn';
  const model = !online
    ? 'Assistant offline'
    : !status
      ? 'Connecting…'
      : local?.available
        ? local.model
        : 'Offline planner';
  const detail = !online
    ? 'The local backend is not responding'
    : cloudOn
      ? 'Cloud processing on'
      : 'Local only · no telemetry';

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => navigate('settings')}
        title={`${model} · ${detail}`}
        className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-graphite-850"
      >
        <Dot tone={tone} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate('settings')}
      title={local?.detail ?? detail}
      className="mx-2.5 mb-2 rounded-lg border border-graphite-800 bg-graphite-850/60 px-3 py-2.5 text-left transition-colors hover:border-graphite-700"
    >
      <span className="flex items-center gap-2 text-xs text-graphite-200">
        <Dot tone={tone} />
        <span className="truncate font-medium">{model}</span>
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-2xs text-graphite-500">
        <Icon name={cloudOn ? 'cloud' : 'lock'} className="h-3 w-3" />
        {detail}
      </span>
    </button>
  );
}
