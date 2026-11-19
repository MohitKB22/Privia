/**
 * Planner: events stored as iCalendar files on this computer.
 *
 * Every change goes through the calendar tools, so creating or cancelling an
 * event shows the full details for approval first.
 */

import { useMemo, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useToolRunner } from '@/hooks/useToolRunner';
import { api, isPermissionError } from '@/lib/api';
import { askPrivia } from '@/lib/store';
import type { CalendarEvent } from '@/lib/types';
import { formatTime } from '@/lib/format';
import { AccessNotice } from '@/components/AccessNotice';
import {
  EmptyState,
  ErrorState,
  Icon,
  Page,
  Section,
  Segmented,
  SkeletonList,
} from '@/components/primitives';

type View = 'day' | 'week';

function dayKey(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function Planner() {
  const [view, setView] = useState<View>('week');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 300);
  const days = view === 'day' ? 1 : 7;
  const events = useAsync(() => api.calendarEvents(days), [days]);
  const search = useAsync(async () => (debounced ? searchEvents(debounced) : null), [debounced]);
  const { run, dialog, busy } = useToolRunner(() => events.reload());
  const [form, setForm] = useState({
    title: '',
    start: '',
    duration: '60',
    location: '',
    participants: '',
  });

  async function searchEvents(text: string): Promise<CalendarEvent[]> {
    const result = await api.execute('calendar.search_events', { query: text, limit: 25 });
    return result.success ? ((result.data as { events: CalendarEvent[] }).events ?? []) : [];
  }

  const groups = useMemo(() => {
    const shown = debounced ? (search.data ?? []) : (events.data ?? []);
    const map = new Map<string, CalendarEvent[]>();
    for (const event of shown) {
      const key = dayKey(event.start);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.entries()];
  }, [debounced, search.data, events.data]);

  const loading = debounced ? search.loading : events.loading;
  const error = debounced ? search.error : events.error;

  return (
    <Page
      intro="Your schedule, stored as calendar files on this computer. No account and no sync."
      actions={
        <>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => askPrivia('Plan my day based on my calendar', { newConversation: true })}
          >
            <Icon name="workspace" className="h-3.5 w-3.5" />
            Plan my day
          </button>
          <Segmented<View>
            label="Range"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
            ]}
          />
        </>
      }
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite-500"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events"
            aria-label="Search events"
            className="field pl-9"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : isPermissionError(error) ? (
        <AccessNotice
          scope="calendar:read"
          title="PRIVIA has not been allowed to read your calendar"
          explanation="Allow read access so PRIVIA can show and plan around your events. Creating or cancelling events will still ask you each time."
          onGranted={events.reload}
        />
      ) : error ? (
        <ErrorState
          title="The calendar could not be read"
          detail={error.message}
          code={error.code}
          onRetry={events.reload}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" />}
          title={
            debounced
              ? 'No events match'
              : view === 'day'
                ? 'Nothing scheduled today'
                : 'Nothing scheduled this week'
          }
          detail="Add an event below, or ask PRIVIA to schedule one."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([key, items]) => (
            <section key={key}>
              <h3 className="label mb-2">{dayLabel(items[0]!.start)}</h3>
              <ul className="panel divide-y divide-graphite-800">
                {items.map((event) => (
                  <li key={event.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-24 shrink-0 text-sm tabular-nums text-graphite-300">
                      {event.all_day ? 'All day' : `${formatTime(event.start)}`}
                      {!event.all_day ? (
                        <span className="block text-2xs text-graphite-600">
                          until {formatTime(event.end)}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className="h-8 w-[2px] shrink-0 rounded-full bg-graphite-700"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${event.cancelled ? 'text-graphite-500 line-through' : 'text-graphite-100'}`}
                      >
                        {event.title}
                      </p>
                      <p className="mt-0.5 truncate text-2xs text-graphite-500">
                        {[event.location, event.participants.join(', ')]
                          .filter(Boolean)
                          .join(' · ') || event.calendar}
                      </p>
                    </div>
                    {!event.cancelled ? (
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={busy}
                        aria-label={`Cancel ${event.title}`}
                        title="Cancel event (asks first)"
                        onClick={() => void run('calendar.cancel_event', { event_id: event.id })}
                      >
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Section
        title="New event"
        description="You will see the full details and approve them before the event is created."
      >
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            void run('calendar.create_event', {
              title: form.title.trim(),
              start: form.start,
              duration_minutes: Number(form.duration) || 60,
              location: form.location.trim() || null,
              participants: form.participants
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            }).then((result) => {
              if (result?.success)
                setForm({ title: '', start: '', duration: '60', location: '', participants: '' });
            });
          }}
        >
          <input
            className="field md:col-span-2"
            placeholder="Title"
            aria-label="Event title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="field md:col-span-2"
            type="datetime-local"
            aria-label="Start"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
          />
          <select
            className="field"
            aria-label="Duration"
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })}
          >
            {['15', '30', '45', '60', '90', '120'].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
          <input
            className="field md:col-span-1"
            placeholder="Location"
            aria-label="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <input
            className="field md:col-span-5"
            placeholder="Participants (comma separated emails)"
            aria-label="Participants"
            value={form.participants}
            onChange={(e) => setForm({ ...form, participants: e.target.value })}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !form.title.trim() || !form.start}
          >
            Review event
          </button>
        </form>
      </Section>
      {dialog}
    </Page>
  );
}
