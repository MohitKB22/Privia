import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { appStore } from '@/lib/store';
import { Sidebar } from './Sidebar';

vi.mock('@/lib/preferences', () => ({ savePreferences: () => Promise.resolve({}) }));

const SECTIONS = [
  'Home',
  'AI Workspace',
  'My Files',
  'Memory',
  'Notes',
  'Planner',
  'Email',
  'Integrations',
  'Activity',
  'Privacy Center',
  'Settings',
];

describe('Sidebar', () => {
  it('lists every section and marks the current one', () => {
    appStore.setState({ screen: 'planner', sidebarCollapsed: false });
    render(<Sidebar />);
    for (const label of SECTIONS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates and collapses', () => {
    appStore.setState({ screen: 'home', sidebarCollapsed: false });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'AI Workspace' }));
    expect(appStore.getState().screen).toBe('workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(appStore.getState().sidebarCollapsed).toBe(true);
  });

  it('keeps the parent highlighted on sub-screens', () => {
    appStore.setState({ screen: 'terminal', sidebarCollapsed: false });
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: 'Integrations' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
