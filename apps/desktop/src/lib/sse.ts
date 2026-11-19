/**
 * Server-sent events over `fetch`.
 *
 * `EventSource` cannot send an Authorization header, and the API requires the
 * per-launch token, so streams are read with `fetch` and parsed here. Aborting
 * the signal closes the connection, which the backend treats as "stop".
 */

export async function readEventStream(
  response: Response,
  onEvent: (data: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flush = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '{}') return;
    try {
      onEvent(JSON.parse(data) as Record<string, unknown>);
    } catch {
      /* a malformed frame must not end the stream */
    }
  };

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        flush(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) flush(buffer);
  } finally {
    reader.releaseLock();
  }
}
