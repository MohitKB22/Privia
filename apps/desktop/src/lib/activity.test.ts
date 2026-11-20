import { describe, expect, it } from 'vitest';
import { describeActivity } from './activity';
import type { AuditEvent } from './types';

let n = 0;
const event = (
  action: string,
  tool_name: string | null = null,
  target: string | null = null,
): AuditEvent => ({
  id: `aud_${n++}`,
  timestamp: '2026-11-20T08:00:00Z',
  action,
  session_id: null,
  run_id: null,
  request_id: null,
  actor: 'agent',
  tool_name,
  target,
  outcome: action === 'tool.failed' ? 'failure' : 'success',
  detail: {},
});

describe('describeActivity', () => {
  it('turns audit events into sentences and drops plumbing', () => {
    const items = describeActivity([
      event('confirmation.requested', 'email.send'),
      event('tool.invoked', 'email.draft'),
      event('tool.succeeded', 'email.draft'),
      event('run.started'),
      event('tool.succeeded', 'files.summarize', '/home/me/Documents/report.md'),
      event('permission.granted', null, 'files:read'),
    ]);
    expect(items.map((i) => i.text)).toEqual([
      'Send email — awaiting approval',
      'Drafted an email',
      'Summarized report.md',
      'Allowed files:read',
    ]);
    expect(items[0]!.pending).toBe(true);
    expect(items[0]!.kind).toBe('email');
    expect(items[2]!.kind).toBe('file');
  });

  it('collapses repeats and respects the limit', () => {
    const items = describeActivity(
      [
        event('tool.succeeded', 'notes.create'),
        event('tool.succeeded', 'notes.create'),
        event('tool.succeeded', 'memory.remember'),
      ],
      1,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('Created a note');
  });

  it('does not report an action paused for approval as a failure', () => {
    const paused = {
      ...event('tool.failed', 'email.send'),
      detail: { error_code: 'CONFIRMATION_REQUIRED' },
    };
    const items = describeActivity([paused, event('confirmation.requested', 'email.send')]);
    expect(items.map((i) => i.text)).toEqual(['Send email — awaiting approval']);
  });

  it('stops showing a request as waiting once it is answered', () => {
    const declined = { ...event('confirmation.rejected', 'email.send'), session_id: 'ses_1' };
    const request = { ...event('confirmation.requested', 'email.send'), session_id: 'ses_1' };
    const other = { ...event('confirmation.requested', 'email.send'), session_id: 'ses_2' };
    const items = describeActivity([declined, other, request]);
    expect(items.map((i) => [i.text, i.pending])).toEqual([
      ['Declined: Send email', false],
      ['Send email — awaiting approval', true],
    ]);
  });

  it('marks failures', () => {
    expect(describeActivity([event('tool.failed', 'calendar.create_event')])[0]).toMatchObject({
      text: 'Create event did not work',
      failed: true,
    });
  });
});
