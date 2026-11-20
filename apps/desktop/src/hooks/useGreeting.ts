import { useEffect, useState } from 'react';
import { greeting } from '@/lib/format';

/**
 * "Good morning / afternoon / evening" from this computer's clock, kept current
 * while the app stays open: re-checked every minute and whenever the window
 * becomes visible again (for example, after the computer wakes from sleep).
 */
export function useGreeting(): string {
  const [text, setText] = useState(() => greeting());

  useEffect(() => {
    const update = () => setText(greeting());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return text;
}
