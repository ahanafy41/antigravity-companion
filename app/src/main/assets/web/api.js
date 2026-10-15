(function (global) {
  'use strict';
  const companion = global.Companion = global.Companion || {};
  function parseSseFrames(buffer) {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const frames = normalized.split('\n\n');
    const remainder = frames.pop();
    const events = frames.filter(frame => frame.trim()).map(frame => {
      let event = 'message';
      let id = '';
      const lines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('id:')) id = line.slice(3).trim();
        if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
      }
      return { event, id, payload: lines.length ? JSON.parse(lines.join('\n')) : {} };
    });
    return { events, remainder };
  }
  class ApiError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code; }
  }
  let csrfToken = '';
  async function request(route, options = {}) {
    const headers = {Accept: 'application/json', ...options.headers};
    const method = options.method || 'GET';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await global.fetch('/api/v1' + route, {
      ...options, method, headers, credentials: 'same-origin', cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = await response.json();
    if (!response.ok) throw new ApiError(payload.message || 'تعذر الطلب.', response.status, payload.code);
    return payload;
  }
  async function restoreSession() {
    const session = await request('/auth/session');
    csrfToken = session.csrf_token;
    return session;
  }
  async function pair(code) {
    const paired = await request('/pair', {method: 'POST', body: {code}});
    csrfToken = paired.csrf_token;
    return paired;
  }
  async function streamTransport(operation) {
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new ApiError('انقطع اتصال بث الرد.', 0, 'stream_disconnected');
    }
  }
  function reconnectDelay(milliseconds, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const abort = () => { global.clearTimeout(timer); reject(signal.reason); };
      const timer = global.setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, milliseconds);
      signal?.addEventListener('abort', abort, {once: true});
    });
  }
  async function readEvents(runId, options) {
    const headers = {Accept: 'text/event-stream'};
    if (options.cursor) headers['Last-Event-ID'] = options.cursor;
    const response = await streamTransport(() => global.fetch('/api/v1/runs/' + encodeURIComponent(runId) + '/events', {
      credentials: 'same-origin', cache: 'no-store', headers, signal: options.signal
    }));
    if (!response.ok) throw new ApiError('تعذر استعادة بث الرد.', response.status, 'stream_failed');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const chunk = await streamTransport(() => reader.read());
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, {stream: true});
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) options.onEvent(event);
      }
    } finally { reader.releaseLock(); }
  }
  async function events(runId, options) {
    let cursor = options.cursor || '';
    let completed = false;
    const onEvent = event => {
      if (event.id && Number(event.id) <= Number(cursor)) return;
      options.onEvent(event);
      if (event.id) cursor = event.id;
      if (event.event === 'result' || event.event === 'replay_unavailable') completed = true;
    };
    for (let attempt = 0; ; attempt++) {
      try {
        await readEvents(runId, {...options, cursor, onEvent});
        if (completed || attempt === 3) return;
        throw new ApiError('انقطع بث الرد قبل تمامه.', 0, 'stream_disconnected');
      } catch (error) {
        const retryable = error instanceof ApiError && (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500);
        if (options.signal?.aborted) throw error;
        if (completed && retryable) return;
        if (!retryable || attempt === 3) throw error;
        await reconnectDelay(1000 * 2 ** attempt, options.signal);
      }
    }
  }
  companion.parseSseFrames = parseSseFrames;
  companion.ApiError = ApiError;
  companion.api = {request, restoreSession, pair, events};
})(window);
