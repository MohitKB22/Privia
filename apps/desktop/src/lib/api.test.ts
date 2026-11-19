import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api } from './api';

/** A fetch stub that builds a fresh Response per call: bodies are single-use. */
function stubFetch(factory: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(factory())),
  );
}

describe('api client', () => {
  it('turns an error envelope into a typed error', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'TOOL_PERMISSION_DENIED',
              message: 'PRIVIA needs your permission for: files:read',
              request_id: 'req_1',
              details: { missing_scopes: ['files:read'] },
            },
          }),
          { status: 403 },
        ),
    );

    try {
      await api.status();
      throw new Error('the request should have failed');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiRequestError);
      const error = caught as ApiRequestError;
      expect(error.code).toBe('TOOL_PERMISSION_DENIED');
      expect(error.isPermission).toBe(true);
      expect(error.status).toBe(403);
      expect(error.requestId).toBe('req_1');
      expect(error.details.missing_scopes).toEqual(['files:read']);
    }
  });

  it('reports an unreachable backend distinctly from a server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    try {
      await api.health();
      throw new Error('the request should have failed');
    } catch (caught) {
      const error = caught as ApiRequestError;
      expect(error.isOffline).toBe(true);
      expect(error.isPermission).toBe(false);
      expect(error.message).toMatch(/cannot reach its backend/i);
    }
  });

  it('falls back to a generic code when the body is not an envelope', async () => {
    stubFetch(() => new Response('<html>gateway error</html>', { status: 502 }));
    try {
      await api.status();
      throw new Error('the request should have failed');
    } catch (caught) {
      const error = caught as ApiRequestError;
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.status).toBe(502);
    }
  });

  it('parses a successful response', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ status: 'ok', version: '1.0.0', checks: {} }), {
          status: 200,
        }),
    );
    await expect(api.health()).resolves.toMatchObject({ status: 'ok', version: '1.0.0' });
  });
});

describe('connection and streaming', () => {
  it('sends the per-launch token from the desktop shell on every request', async () => {
    const { resetConnection } = await import('./connection');
    resetConnection();
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue({
        version: '1.0.0',
        api_base: 'http://127.0.0.1:51234/',
        token: 'launch-token',
        platform: 'macos',
        managed_backend: true,
      }),
    }));
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ status: 'ok', version: '1', checks: {} }))),
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await api.health();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:51234/health');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer launch-token');
      // A GET has no body, so it must not claim one.
      expect(new Headers(init.headers).get('content-type')).toBeNull();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      vi.doUnmock('@tauri-apps/api/core');
      resetConnection();
    }
  });

  it('delivers streamed chat events in order, across chunk boundaries', async () => {
    const { resetConnection } = await import('./connection');
    resetConnection();
    const frames = [
      'data: {"type":"start","session_id":"ses_1","request_id":"req_1"}\n\n',
      'data: {"type":"token","text":"Hel',
      'lo"}\n\ndata: not json\n\ndata: {"type":"token","text":" there"}\n\n',
      'data: {"type":"done","status":"completed","response":"Hello there"}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        frames.forEach((frame) => controller.enqueue(encoder.encode(frame)));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const events: { type: string; text?: string }[] = [];
    await api.chatStream({ message: 'hi' }, (event) => events.push(event as never));
    expect(events.map((e) => e.type)).toEqual(['start', 'token', 'token', 'done']);
    expect(
      events
        .filter((e) => e.type === 'token')
        .map((e) => e.text)
        .join(''),
    ).toBe('Hello there');
  });

  it('turns a refused stream into a typed error', async () => {
    const { resetConnection } = await import('./connection');
    resetConnection();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'no' } }), {
          status: 403,
        }),
      ),
    );
    await expect(api.chatStream({ message: 'hi' }, () => undefined)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});
