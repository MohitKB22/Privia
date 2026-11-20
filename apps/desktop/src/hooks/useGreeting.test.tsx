import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useGreeting } from './useGreeting';

function Greeting() {
  return <p>{useGreeting()}</p>;
}

describe('useGreeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows the clock while the app stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 11, 59, 30));
    render(<Greeting />);
    expect(screen.getByText('Good morning')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000); // 12:00:30
    });
    expect(screen.getByText('Good afternoon')).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date(2026, 10, 20, 18, 0, 5));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Good evening')).toBeInTheDocument();
  });
});
