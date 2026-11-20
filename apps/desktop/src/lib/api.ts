/**
 * The single place the client talks to the backend.
 *
 * Every failure becomes an `ApiRequestError` carrying the server's stable error
 * code, so screens can react to `TOOL_PERMISSION_DENIED` or
 * `CONFIRMATION_REQUIRED` without string matching on messages.
 */

import { getConnection } from './connection';
import { readEventStream } from './sse';
import type {
  AuditEvent,
  CalendarEvent,
  ChatResponse,
  EmailDraft,
  FileEntry,
  MemoryRecord,
  ModelsResponse,
  PendingApproval,
  Note,
  Preferences,
  PrivacyState,
  ScopeInfo,
  StatusResponse,
  StreamEvent,
  ToolResult,
  ToolSpec,
} from './types';

const OFFLINE_MESSAGE =
  'PRIVIA cannot reach its backend. If you run from source, start it with `make dev-api`.';

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {},
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  get isPermission() {
    return this.code === 'TOOL_PERMISSION_DENIED';
  }
  get isConfirmation() {
    return this.code === 'CONFIRMATION_REQUIRED';
  }
  get isOffline() {
    return this.code === 'NETWORK_UNREACHABLE';
  }
}

/** True when an error means "PRIVIA has not been allowed to do this yet". */
export function isPermissionError(error: ApiRequestError | null | undefined): boolean {
  return Boolean(error && (error.code === 'TOOL_PERMISSION_DENIED' || error.isPermission));
}

/** Send a request with the connection's base URL and token. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const connection = await getConnection();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (connection.token) headers.set('authorization', `Bearer ${connection.token}`);
  try {
    return await fetch(`${connection.base}${path}`, { ...init, headers });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') throw caught;
    throw new ApiRequestError('NETWORK_UNREACHABLE', OFFLINE_MESSAGE, 0);
  }
}

async function failure(response: Response): Promise<ApiRequestError> {
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const envelope = (payload as { error?: Record<string, unknown> } | null)?.error;
  return new ApiRequestError(
    String(envelope?.code ?? 'INTERNAL_ERROR'),
    String(envelope?.message ?? `Request failed with status ${response.status}.`),
    response.status,
    (envelope?.details as Record<string, unknown>) ?? {},
    (envelope?.request_id as string) ?? response.headers.get('x-request-id'),
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init);

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = (payload as { error?: Record<string, unknown> } | null)?.error;
    throw new ApiRequestError(
      String(envelope?.code ?? 'INTERNAL_ERROR'),
      String(envelope?.message ?? `Request failed with status ${response.status}.`),
      response.status,
      (envelope?.details as Record<string, unknown>) ?? {},
      (envelope?.request_id as string) ?? response.headers.get('x-request-id'),
    );
  }
  return payload as T;
}

export interface ChatStreamBody {
  message: string;
  session_id?: string | null;
  confirmation_id?: string | null;
  confirm?: boolean | null;
  prefer?: 'local' | 'cloud' | null;
}

/**
 * Stream one turn. Resolves when the stream ends. Aborting `signal` closes the
 * connection; the backend cancels the run and records it as stopped.
 */
async function chatStream(
  body: ChatStreamBody,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await send('/api/v1/chat/stream', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await failure(response);
  await readEventStream(response, (data) => onEvent(data as unknown as StreamEvent), signal);
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  health: () =>
    get<{ status: string; version: string; checks: Record<string, unknown> }>('/health'),
  status: () => get<StatusResponse>('/api/v1/status'),
  metrics: () =>
    get<{ counters: Record<string, number>; timers: Record<string, Record<string, number>> }>(
      '/api/v1/metrics',
    ),

  chat: (body: {
    message: string;
    session_id?: string | null;
    confirmation_id?: string | null;
    confirm?: boolean | null;
    speak?: boolean;
    prefer?: string | null;
  }) => post<ChatResponse>('/api/v1/chat', body),

  chatStream,

  models: () => get<ModelsResponse>('/api/v1/models'),
  setLocalModel: (model: string) =>
    put<{ local: ModelsResponse['local'] }>('/api/v1/models/local', { model }),

  approvals: () => get<{ count: number; approvals: PendingApproval[] }>('/api/v1/approvals'),

  preferences: () => get<Preferences>('/api/v1/preferences'),
  setPreferences: (patch: Partial<Preferences>) => put<Preferences>('/api/v1/preferences', patch),

  sessions: () => get<{ sessions: Record<string, unknown>[] }>('/api/v1/sessions'),
  createSession: (title = 'New conversation') =>
    post<{ session_id: string }>('/api/v1/sessions', { title }),
  session: (id: string) =>
    get<{ session: Record<string, unknown>; messages: Record<string, unknown>[] }>(
      `/api/v1/sessions/${id}`,
    ),
  deleteSession: (id: string) => del<{ deleted: string }>(`/api/v1/sessions/${id}`),

  tools: () => get<ToolSpec[]>('/api/v1/tools'),
  execute: (tool_name: string, args: Record<string, unknown>, confirmationId?: string) =>
    post<ToolResult>('/api/v1/tools/execute', {
      tool_name,
      arguments: args,
      confirmation_id: confirmationId ?? null,
    }),

  permissions: () =>
    get<{ scopes: ScopeInfo[]; allowed_directories: string[]; terminal_roots: string[] }>(
      '/api/v1/permissions',
    ),
  setPermission: (scope: string, grant: boolean, resources: string[] = []) =>
    post<{ scope: string; state: string }>('/api/v1/permissions', { scope, grant, resources }),
  addDirectory: (path: string) =>
    post<{ allowed_directories: string[] }>('/api/v1/permissions/directories', { path }),
  removeDirectory: (path: string) =>
    del<{ allowed_directories: string[] }>('/api/v1/permissions/directories', { path }),
  resetPermissions: () => post<{ revoked: number }>('/api/v1/permissions/reset'),

  memories: (query = '') =>
    get<{ count: number; enabled: boolean; memories: MemoryRecord[] }>(
      `/api/v1/memory?query=${encodeURIComponent(query)}`,
    ),
  memoryStats: () => get<Record<string, unknown>>('/api/v1/memory/stats'),
  remember: (content: string, kind = 'fact', pinned = false) =>
    post<MemoryRecord>('/api/v1/memory', { content, kind, pinned }),
  updateMemory: (id: string, patch: { content?: string; pinned?: boolean; tags?: string[] }) =>
    put<MemoryRecord>(`/api/v1/memory/${id}`, patch),
  forget: (id: string) => del<{ deleted: string }>(`/api/v1/memory/${id}`),
  forgetAll: (keepPinned: boolean) =>
    post<{ deleted: number }>(`/api/v1/memory/clear?keep_pinned=${keepPinned}`),

  notes: (query = '') =>
    get<{ count: number; notes: Note[] }>(`/api/v1/notes?query=${encodeURIComponent(query)}`),
  createNote: (title: string, body: string, tags: string[] = []) =>
    post<Note>('/api/v1/notes', { title, body, tags }),
  updateNote: (id: string, patch: Partial<Note>) => put<Note>(`/api/v1/notes/${id}`, patch),
  deleteNote: (id: string) => del<{ deleted: string }>(`/api/v1/notes/${id}`),

  fileRoots: () =>
    get<{ roots: { path: string; exists: boolean; name: string }[] }>('/api/v1/files/roots'),
  listDirectory: (path: string) =>
    get<{ path: string; count: number; entries: FileEntry[] }>(
      `/api/v1/files/list?path=${encodeURIComponent(path)}`,
    ),
  searchFiles: (query: string, contents = false) =>
    get<{ count: number; files: FileEntry[] }>(
      `/api/v1/files/search?query=${encodeURIComponent(query)}&contents=${contents}`,
    ),
  readFile: (path: string) =>
    get<{ path: string; text: string; truncated: boolean; bytes_read: number }>(
      `/api/v1/files/read?path=${encodeURIComponent(path)}`,
    ),

  audit: (params: { limit?: number; action?: string; minutes?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.action) search.set('action', params.action);
    if (params.minutes) search.set('minutes', String(params.minutes));
    return get<{ count: number; total: number; events: AuditEvent[] }>(
      `/api/v1/audit?${search.toString()}`,
    );
  },
  runs: () => get<{ runs: Record<string, unknown>[] }>('/api/v1/audit/runs'),
  run: (id: string) => get<Record<string, unknown>>(`/api/v1/audit/runs/${id}`),

  privacy: () => get<PrivacyState>('/api/v1/privacy'),
  setPrivacy: (patch: Record<string, unknown>) =>
    post<{ changed: Record<string, unknown> }>('/api/v1/privacy', patch),
  exportData: () => get<Record<string, unknown>>('/api/v1/privacy/export'),
  purge: (options: { conversations?: boolean; memories?: boolean; audit_log?: boolean }) => {
    const search = new URLSearchParams();
    Object.entries(options).forEach(([k, v]) => search.set(k, String(Boolean(v))));
    return post<{ deleted: Record<string, number> }>(`/api/v1/privacy/purge?${search.toString()}`);
  },

  integrations: () => get<{ integrations: IntegrationInfoList }>('/api/v1/integrations'),
  secrets: () =>
    get<{
      backends: string[];
      writable_backend: string;
      stored_keys: string[];
      settable_keys: string[];
    }>('/api/v1/integrations/secrets'),
  setSecret: (key: string, value: string) =>
    post<{ stored: string; backend: string }>('/api/v1/integrations/secrets', { key, value }),
  deleteSecret: (key: string) => del<{ deleted: string }>(`/api/v1/integrations/secrets/${key}`),

  voiceStatus: () => get<Record<string, unknown>>('/api/v1/voice/status'),
  synthesize: (text: string) =>
    post<{ audio_base64: string; format: string }>('/api/v1/voice/synthesize', { text }),
  transcribe: async (blob: Blob) => {
    const form = new FormData();
    form.append('audio', blob, 'speech.wav');
    return request<{
      text: string;
      speech_detected: boolean;
      message?: string;
      latency_ms: number;
    }>('/api/v1/voice/transcribe', { method: 'POST', body: form });
  },

  // Convenience wrappers used by the Calendar and Email screens. They go
  // through the tool runtime, so the permission engine still applies.
  calendarEvents: async (days = 7) => {
    const result = await api.execute('calendar.list_events', { days });
    if (!result.success)
      throw new ApiRequestError(
        result.error_code ?? 'TOOL_EXECUTION_FAILED',
        result.error ?? 'Failed',
        400,
      );
    return (result.data as { events: CalendarEvent[] }).events;
  },
  emailDrafts: async () => {
    const result = await api.execute('email.list_drafts', { limit: 50 });
    if (!result.success)
      throw new ApiRequestError(
        result.error_code ?? 'TOOL_EXECUTION_FAILED',
        result.error ?? 'Failed',
        400,
      );
    return (result.data as { drafts: EmailDraft[] }).drafts;
  },
};

type IntegrationInfoList = import('./types').IntegrationInfo[];

/**
 * Subscribe to the live audit stream. Returns an unsubscribe function.
 * Uses fetch rather than EventSource so the API token can be sent.
 */
export function subscribeToActivity(onEvent: (event: AuditEvent) => void): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      const response = await send('/api/v1/audit/stream', { signal: controller.signal });
      if (!response.ok) return;
      await readEventStream(
        response,
        (data) => onEvent(data as unknown as AuditEvent),
        controller.signal,
      );
    } catch {
      /* the feed is best effort; the Activity screen also loads history */
    }
  })();
  return () => controller.abort();
}
