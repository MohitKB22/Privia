/**
 * Global search and command palette. Screens, actions, and content: your
 * conversations, notes and memories. Everything reachable from the keyboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { appStore, askPrivia, navigate, SCREEN_TITLES, type Screen } from '@/lib/store';
import { useDebounced } from '@/hooks/useDebounced';
import type { Session } from '@/lib/types';
import { Icon, type IconName } from './primitives';
import { MOD_LABEL } from '@/hooks/useHotkeys';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  keywords: string;
  run: () => void;
}

const SCREENS: { screen: Screen; icon: IconName; keywords: string }[] = [
  { screen: 'home', icon: 'home', keywords: 'start overview dashboard' },
  { screen: 'workspace', icon: 'workspace', keywords: 'chat conversation talk ask assistant' },
  { screen: 'files', icon: 'files', keywords: 'documents folders browse' },
  { screen: 'memory', icon: 'brain', keywords: 'remember facts recall' },
  { screen: 'notes', icon: 'note', keywords: 'notes write jot' },
  { screen: 'planner', icon: 'calendar', keywords: 'calendar events meetings schedule day week' },
  { screen: 'email', icon: 'mail', keywords: 'mail drafts inbox send' },
  { screen: 'integrations', icon: 'plug', keywords: 'connections credentials keys accounts' },
  { screen: 'activity', icon: 'activity', keywords: 'audit history log runs approvals' },
  { screen: 'privacy', icon: 'shield', keywords: 'privacy permissions cloud data delete export' },
  { screen: 'settings', icon: 'settings', keywords: 'configuration model ollama preferences' },
  { screen: 'browser', icon: 'globe', keywords: 'web page url search reader' },
  { screen: 'terminal', icon: 'terminal', keywords: 'shell command run' },
];

function score(query: string, command: Command): number {
  const haystack = `${command.label} ${command.keywords}`.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return 1;
  if (haystack.startsWith(needle)) return 100;
  if (command.label.toLowerCase().includes(needle)) return 80;
  if (haystack.includes(needle)) return 60;
  // Subsequence match, so "cal" finds "Calendar" and "pc" finds "Privacy Center".
  let index = 0;
  for (const character of needle) {
    index = haystack.indexOf(character, index);
    if (index === -1) return 0;
    index += 1;
  }
  return 30;
}

export function CommandPalette() {
  const open = appStore.useStore((state) => state.paletteOpen);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...SCREENS.map((entry) => ({
        id: `go:${entry.screen}`,
        label: SCREEN_TITLES[entry.screen],
        hint: 'Go to',
        icon: entry.icon,
        keywords: entry.keywords,
        run: () => navigate(entry.screen),
      })),
      {
        id: 'action:new-conversation',
        label: 'New conversation',
        hint: 'Action',
        icon: 'plus',
        keywords: 'reset clear start fresh',
        run: () => {
          appStore.setState({ sessionId: null, screen: 'workspace', paletteOpen: false });
        },
      },
      {
        id: 'action:reload',
        label: 'Reload the window',
        hint: 'Action',
        icon: 'refresh',
        keywords: 'refresh restart',
        run: () => window.location.reload(),
      },
    ],
    [],
  );

  const content = useContentSearch(open ? query : '');

  const matches = useMemo(() => {
    const ranked = commands
      .map((command) => ({ command, value: score(query, command) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, query.trim() ? 5 : 9)
      .map((entry) => entry.command);
    if (!query.trim()) return ranked;
    const ask: Command = {
      id: 'action:ask',
      label: `Ask PRIVIA: “${query.trim()}”`,
      hint: 'AI Workspace',
      icon: 'workspace',
      keywords: '',
      run: () => askPrivia(query.trim(), { newConversation: true }),
    };
    return [ask, ...ranked, ...content];
  }, [commands, content, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  const close = () => appStore.setState({ paletteOpen: false });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-graphite-950/70 p-6 pt-[12vh] backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg animate-slide-up overflow-hidden rounded-2xl border border-graphite-700 bg-graphite-900 shadow-lift"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-graphite-800 px-4 py-3">
          <Icon name="search" className="h-4 w-4 text-graphite-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((c) => Math.min(matches.length - 1, c + 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                matches[cursor]?.run();
              }
            }}
            placeholder="Search conversations, notes, memories, or jump to…"
            aria-label="Search commands"
            className="w-full bg-transparent text-sm text-graphite-100 placeholder:text-graphite-600 focus:outline-none"
          />
          <kbd className="rounded border border-graphite-700 px-1.5 py-0.5 font-mono text-2xs text-graphite-500">
            esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-graphite-600">Nothing matches.</li>
          ) : (
            matches.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={command.run}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    index === cursor
                      ? 'bg-graphite-800 text-graphite-100'
                      : 'text-graphite-300 hover:bg-graphite-850'
                  }`}
                >
                  <Icon name={command.icon} className="h-4 w-4 text-graphite-500" />
                  <span className="flex-1">{command.label}</span>
                  {command.hint ? (
                    <span className="text-2xs text-graphite-600">{command.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <footer className="flex items-center gap-3 border-t border-graphite-800 px-4 py-2 text-2xs text-graphite-600">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span className="ml-auto">{MOD_LABEL}K anywhere</span>
        </footer>
      </div>
    </div>
  );
}

/** Search the user's own content once they pause typing. */
function useContentSearch(query: string): Command[] {
  const debounced = useDebounced(query.trim(), 250);
  const [results, setResults] = useState<Command[]>([]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const needle = debounced.toLowerCase();
    void Promise.allSettled([api.sessions(), api.notes(debounced), api.memories(debounced)]).then(
      ([sessions, notes, memories]) => {
        if (cancelled) return;
        const found: Command[] = [];
        if (sessions.status === 'fulfilled') {
          for (const session of (sessions.value.sessions as unknown as Session[])
            .filter((item) => item.title.toLowerCase().includes(needle))
            .slice(0, 3)) {
            found.push({
              id: `session:${session.id}`,
              label: session.title,
              hint: 'Conversation',
              icon: 'chat',
              keywords: '',
              run: () =>
                appStore.setState({
                  sessionId: session.id,
                  screen: 'workspace',
                  paletteOpen: false,
                }),
            });
          }
        }
        if (notes.status === 'fulfilled') {
          for (const note of notes.value.notes.slice(0, 3)) {
            found.push({
              id: `note:${note.id}`,
              label: note.title,
              hint: 'Note',
              icon: 'note',
              keywords: '',
              run: () => navigate('notes'),
            });
          }
        }
        if (memories.status === 'fulfilled') {
          for (const memory of memories.value.memories.slice(0, 2)) {
            found.push({
              id: `memory:${memory.id}`,
              label: memory.content,
              hint: 'Memory',
              icon: 'brain',
              keywords: '',
              run: () => navigate('memory'),
            });
          }
        }
        setResults(found);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return results;
}
