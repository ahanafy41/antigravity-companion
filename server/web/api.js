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
  async function events(runId, options) {
    const headers = {Accept: 'text/event-stream'};
    if (options.cursor) headers['Last-Event-ID'] = options.cursor;
    const response = await global.fetch('/api/v1/runs/' + encodeURIComponent(runId) + '/events', {
      credentials: 'same-origin', cache: 'no-store', headers, signal: options.signal
    });
    if (!response.ok) throw new ApiError('تعذر استعادة بث الرد.', response.status, 'stream_failed');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, {stream: true});
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) options.onEvent(event);
      }
    } finally { reader.releaseLock(); }
  }
  companion.parseSseFrames = parseSseFrames;
  companion.ApiError = ApiError;
  companion.api = {request, restoreSession, pair, events};
})(window);
