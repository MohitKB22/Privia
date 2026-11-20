/**
 * Plain-language descriptions of audit events, for timelines.
 *
 * The Activity screen shows every raw event. Timelines on Home show only the
 * events a person cares about, phrased as sentences ("Drafted an email").
 */

import { basename } from './format';
import type { AuditEvent } from './types';

export type ActivityKind =
  | 'file'
  | 'note'
  | 'memory'
  | 'email'
  | 'calendar'
  | 'web'
  | 'terminal'
  | 'shield'
  | 'chat'
  | 'settings';

export interface ActivityItem {
  id: string;
  text: string;
  when: string;
  kind: ActivityKind;
  /** Waiting for the user (an approval request). */
  pending: boolean;
  failed: boolean;
}

const TOOL_TEXT: Record<string, string> = {
  'files.search': 'Searched your files',
  'files.list_directory': 'Browsed a folder',
  'notes.create': 'Created a note',
  'notes.update': 'Updated a note',
  'notes.search': 'Searched your notes',
  'notes.summarize': 'Summarized your notes',
  'memory.remember': 'Saved a memory',
  'memory.forget': 'Forgot a memory',
  'email.draft': 'Drafted an email',
  'email.reply': 'Drafted a reply',
  'email.send': 'Sent an email',
  'email.search': 'Searched your email',
  'calendar.create_event': 'Added an event',
  'calendar.cancel_event': 'Cancelled an event',
  'calendar.list_events': 'Checked your calendar',
  'terminal.run': 'Ran a command',
};

const ACTION_TEXT: Record<string, string> = {
  'email.sent': 'Sent an email',
  'calendar.event_created': 'Added an event',
  'calendar.event_cancelled': 'Cancelled an event',
  'data.exported': 'Exported your data',
  'data.purged': 'Deleted local history',
  'settings.changed': 'Changed a setting',
  'security.injection_detected': 'Ignored instructions found in content',
  'security.policy_violation': 'Blocked an action outside your permissions',
};

const KIND_BY_FAMILY: Record<string, ActivityKind> = {
  files: 'file',
  file: 'file',
  notes: 'note',
  memory: 'memory',
  email: 'email',
  calendar: 'calendar',
  browser: 'web',
  url: 'web',
  terminal: 'terminal',
  command: 'terminal',
  permission: 'shield',
  confirmation: 'shield',
  security: 'shield',
  settings: 'settings',
  run: 'chat',
};

function toolOf(event: AuditEvent): string {
  return (event.tool_name ?? '').replace(/^api\./, '');
}

function kindOf(event: AuditEvent): ActivityKind {
  const family = toolOf(event).split('.')[0] || event.action.split('.')[0] || '';
  return KIND_BY_FAMILY[family] ?? 'chat';
}

const NOUN: Record<string, string> = {
  files: 'file',
  notes: 'note',
  email: 'email',
  calendar: 'event',
  memory: 'memory',
  browser: 'web page',
  terminal: 'command',
};

/** A short human label for a tool: "email.send" -> "Send email". */
export function toolLabel(tool: string): string {
  const [family = '', action = ''] = tool.replace(/^api\./, '').split('.');
  const words = action.split('_').filter(Boolean);
  const phrase = words.length > 1 ? words.join(' ') : `${action} ${NOUN[family] ?? family}`.trim();
  return phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : 'An action';
}

function sentence(event: AuditEvent): string | null {
  const tool = toolOf(event);
  const target = event.target && /[\\/]/.test(event.target) ? basename(event.target) : null;
  switch (event.action) {
    case 'confirmation.requested':
      return `${toolLabel(tool)} — awaiting approval`;
    case 'confirmation.approved':
      return `Approved: ${toolLabel(tool)}`;
    case 'confirmation.rejected':
      return `Declined: ${toolLabel(tool)}`;
    case 'permission.granted':
      return `Allowed ${event.target ?? 'a permission'}`;
    case 'permission.revoked':
      return `Revoked ${event.target === 'all' ? 'every permission' : (event.target ?? 'a permission')}`;
    case 'permission.denied':
      return `Blocked ${toolLabel(tool)}: no permission`;
    case 'file.accessed':
      return target ? `Opened ${target}` : 'Opened a file';
    case 'tool.failed':
      return `${toolLabel(tool)} did not work`;
    case 'tool.succeeded':
      if (tool === 'files.summarize')
        return target ? `Summarized ${target}` : 'Summarized a document';
      if (tool === 'files.read') return target ? `Read ${target}` : 'Read a file';
      if (tool === 'files.create') return target ? `Created ${target}` : 'Created a file';
      if (tool.startsWith('browser.')) return 'Read a web page';
      return TOOL_TEXT[tool] ?? null;
    default:
      return ACTION_TEXT[event.action] ?? null;
  }
}

/** A call that paused for the user's approval is logged as failed; it is not a failure. */
export function isAwaitingApproval(event: AuditEvent): boolean {
  return event.action === 'tool.failed' && event.detail?.error_code === 'CONFIRMATION_REQUIRED';
}

/** The events worth showing in a timeline, newest first, without repeats. */
export function describeActivity(events: AuditEvent[], limit = 4): ActivityItem[] {
  const items: ActivityItem[] = [];
  // Events arrive newest first, so an answer is seen before its request.
  const answered = new Set<string>();
  for (const event of events) {
    if (isAwaitingApproval(event)) continue;
    const key = `${event.session_id ?? ''}|${toolOf(event)}`;
    if (event.action === 'confirmation.approved' || event.action === 'confirmation.rejected') {
      answered.add(key);
    } else if (event.action === 'confirmation.requested' && answered.has(key)) {
      continue; // no longer waiting: the answer is already in the timeline
    }
    const text = sentence(event);
    if (!text) continue;
    if (items.length && items[items.length - 1]!.text === text) continue;
    items.push({
      id: event.id,
      text,
      when: event.timestamp,
      kind: kindOf(event),
      pending: event.action === 'confirmation.requested',
      failed: event.outcome === 'failure' || event.action === 'permission.denied',
    });
    if (items.length >= limit) break;
  }
  return items;
}
