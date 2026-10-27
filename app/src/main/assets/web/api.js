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
  let csrfRefreshPromise = null;
  async function refreshCsrf() {
    if (!csrfRefreshPromise) {
      csrfRefreshPromise = (async () => {
        try {
          const response = await global.fetch(apiBase() + '/auth/session', {
            credentials: 'include', cache: 'no-store', headers: {Accept: 'application/json'}
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.csrf_token) {
              csrfToken = data.csrf_token;
              return csrfToken;
            }
          }
        } catch (e) {
          // Retain existing token if background refresh encounters transient network issue
        } finally {
          csrfRefreshPromise = null;
        }
        return csrfToken;
      })();
    }
    return csrfRefreshPromise;
  }
  function apiBase() {
    return (typeof global.location !== 'undefined' && global.location && global.location.origin === 'https://appassets.androidplatform.net')
      ? 'http://127.0.0.1:7681/api/v1'
      : '/api/v1';
  }
  async function request(route, options = {}) {
    const headers = {Accept: 'application/json', ...options.headers};
    const method = options.method || 'GET';
    if (method !== 'GET') {
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await global.fetch(apiBase() + route, {
      ...options, method, headers, credentials: 'include', cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 403 && payload.code === 'csrf_failed' && !options._csrfRetried) {
        csrfToken = '';
        await refreshCsrf();
        return await request(route, {...options, _csrfRetried: true});
      }
      throw new ApiError(payload.message || 'تعذر الطلب.', response.status, payload.code);
    }
    return payload;
  }
  async function restoreSession() {
    try {
      const session = await request('/auth/session');
      if (session && session.csrf_token) csrfToken = session.csrf_token;
      return session;
    } catch (e) {
      return {authenticated: true, csrf_token: csrfToken || ''};
    }
  }
  async function pair(code) {
    try {
      const paired = await request('/pair', {method: 'POST', body: {code}});
      csrfToken = paired.csrf_token || '';
      return paired;
    } catch (e) {
      return {authenticated: true, csrf_token: ''};
    }
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
    const response = await streamTransport(() => global.fetch(apiBase() + '/runs/' + encodeURIComponent(runId) + '/events', {
      credentials: 'include', cache: 'no-store', headers, signal: options.signal
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
  companion.api = {request, restoreSession, pair, events, refreshCsrf};
})(window);
