/** Interface preferences, loaded once and saved to the local backend. */

import { api } from './api';
import { appStore, createStore } from './store';
import type { Preferences } from './types';

export const DEFAULT_PREFERENCES: Preferences = {
  onboarding_completed: false,
  display_name: '',
  start_screen: 'home',
  sidebar_collapsed: false,
  reduce_motion: false,
};

export const preferencesStore = createStore<{ loaded: boolean; values: Preferences }>({
  loaded: false,
  values: DEFAULT_PREFERENCES,
});

function apply(values: Preferences) {
  document.documentElement.classList.toggle('reduce-motion', values.reduce_motion);
  appStore.setState({ sidebarCollapsed: values.sidebar_collapsed });
}

export async function loadPreferences(): Promise<Preferences> {
  const values = await api.preferences();
  preferencesStore.setState({ loaded: true, values });
  apply(values);
  return values;
}

export async function savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const optimistic = { ...preferencesStore.getState().values, ...patch };
  preferencesStore.setState({ values: optimistic });
  apply(optimistic);
  const values = await api.setPreferences(patch);
  preferencesStore.setState({ values });
  return values;
}
