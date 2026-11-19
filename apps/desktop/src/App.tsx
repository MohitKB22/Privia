import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo } from 'react';
import { appStore, navigate, type Screen } from '@/lib/store';
import { loadPreferences, preferencesStore } from '@/lib/preferences';
import { useStatusPolling } from '@/lib/status';
import { useHotkeys } from '@/hooks/useHotkeys';
import { BackendGate } from '@/components/BackendGate';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { CommandPalette } from '@/components/CommandPalette';
import { Toasts } from '@/components/Toasts';
import { ErrorState, Logo, Spinner } from '@/components/primitives';
import { Home } from '@/screens/Home';
import { Workspace } from '@/screens/Workspace';
import { Activity } from '@/screens/Activity';
import { Files } from '@/screens/Files';
import { Notes } from '@/screens/Notes';
import { Memory } from '@/screens/Memory';
import { Planner } from '@/screens/Planner';
import { Email } from '@/screens/Email';
import { Integrations } from '@/screens/Integrations';
import { Privacy } from '@/screens/Privacy';
import { Settings } from '@/screens/Settings';
import { Onboarding } from '@/screens/Onboarding';
import { Browser, Terminal } from '@/screens/ToolScreens';

/** A render error in one screen must not take down the whole app. */
class ScreenBoundary extends Component<
  { children: ReactNode; screen: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Screen crashed', this.props.screen, error, info.componentStack);
  }

  componentDidUpdate(previous: { screen: string }) {
    if (previous.screen !== this.props.screen && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <ErrorState
            title="This screen ran into a problem"
            detail={this.state.error.message}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

const SCREENS: Record<Screen, () => JSX.Element> = {
  home: Home,
  workspace: Workspace,
  files: Files,
  memory: Memory,
  notes: Notes,
  planner: Planner,
  email: Email,
  integrations: Integrations,
  activity: Activity,
  privacy: Privacy,
  settings: Settings,
  browser: Browser,
  terminal: Terminal,
};

function Shell() {
  const screen = appStore.useStore((state) => state.screen);
  const online = appStore.useStore((state) => state.backendOnline);
  useStatusPolling();

  useHotkeys(
    useMemo(
      () => ({
        'mod+k': () => appStore.setState((state) => ({ paletteOpen: !state.paletteOpen })),
        'mod+/': () => appStore.setState({ paletteOpen: true }),
        'mod+n': () => appStore.setState({ sessionId: null, screen: 'workspace' }),
        'mod+b': () =>
          appStore.setState((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        'mod+1': () => navigate('home'),
        'mod+2': () => navigate('workspace'),
        'mod+3': () => navigate('files'),
        'mod+4': () => navigate('memory'),
        'mod+5': () => navigate('notes'),
        'mod+6': () => navigate('planner'),
        'mod+,': () => navigate('settings'),
        'mod+shift+p': () => navigate('privacy'),
      }),
      [],
    ),
  );

  const Screen = SCREENS[screen] ?? Home;

  return (
    <div className="flex h-screen overflow-hidden bg-graphite-950 text-graphite-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {!online ? (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-danger/30 bg-danger-soft px-6 py-2 text-xs text-danger"
          >
            The assistant stopped responding. Open Settings, Troubleshooting to restart it.
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-hidden">
          <ScreenBoundary screen={screen}>
            <Screen />
          </ScreenBoundary>
        </main>
      </div>
      <CommandPalette />
      <Toasts />
    </div>
  );
}

function Ready() {
  const loaded = preferencesStore.useStore((state) => state.loaded);
  const onboarded = preferencesStore.useStore((state) => state.values.onboarding_completed);

  useEffect(() => {
    loadPreferences()
      .then((prefs) => {
        if (prefs.start_screen === 'workspace') navigate('workspace');
      })
      .catch(() => preferencesStore.setState({ loaded: true }));
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-graphite-950">
        <div className="text-center">
          <Logo className="mx-auto h-10 w-10" />
          <Spinner className="mx-auto mt-4 h-4 w-4" />
        </div>
      </div>
    );
  }
  return onboarded ? <Shell /> : <Onboarding />;
}

export default function App() {
  return (
    <BackendGate>
      <Ready />
    </BackendGate>
  );
}
