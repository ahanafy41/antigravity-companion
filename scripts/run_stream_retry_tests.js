'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client(fetch, schedule) {
  const delays = [];
  const window = {fetch, setTimeout(callback, delay) {
    delays.push(delay);
    return schedule ? schedule(callback) : setTimeout(callback, 0);
  }, clearTimeout};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    '../server/web/api.js'), 'utf8'), {window, TextDecoder, TypeError, DOMException});
  return {api: window.Companion.api, delays, window};
}
function stream(frames, failure) {
  let sent = false;
  return new Response(new ReadableStream({pull(controller) {
    if (!sent) {
      sent = true;
      controller.enqueue(new TextEncoder().encode(frames));
    } else if (failure) controller.error(new TypeError('connection reset'));
    else controller.close();
  }}));
}
const frame = (id, event = 'delta') => `id: ${id}\nevent: ${event}\ndata: {"text_delta":"${id}"}\n\n`;

async function main() {
  const requests = [], received = [];
  const replay = client(async (url, options) => {
    requests.push({url, cursor: options.headers['Last-Event-ID'] || ''});
    switch (requests.length) {
      case 1: return stream(frame(1), true);
      case 2: return stream(frame(1) + frame(2), true);
      case 3: return stream(frame(3));
      default: return stream(frame(4, 'result'));
    }
  });
  await replay.api.events('same-run', {onEvent: event => received.push(event.id)});
  assert.deepEqual(replay.delays, [1000, 2000, 4000]);
  assert.deepEqual(requests.map(request => request.cursor), ['', '1', '2', '3']);
  assert.equal(new Set(requests.map(request => request.url)).size, 1);
  assert.deepEqual(received, ['1', '2', '3', '4']);

  for (const status of [403, 404]) {
    let attempts = 0;
    const denied = client(async () => { attempts++; return new Response('', {status}); });
    await assert.rejects(denied.api.events('run', {onEvent() {}}));
    assert.equal(attempts, 1);
    assert.deepEqual(denied.delays, []);
  }
  let attempts = 0;
  const unavailable = client(async () => { attempts++; return new Response('', {status: 503}); });
  await assert.rejects(unavailable.api.events('run', {onEvent() {}}));
  assert.equal(attempts, 4);
  assert.deepEqual(unavailable.delays, [1000, 2000, 4000]);

  const controller = new AbortController();
  let abortAttempts = 0;
  const aborted = client(async () => { abortAttempts++; throw new TypeError('offline'); }, () => {
    queueMicrotask(() => controller.abort());
    return 0;
  });
  await assert.rejects(aborted.api.events('run', {signal: controller.signal, onEvent() {}}),
    error => error.name === 'AbortError');
  assert.equal(abortAttempts, 1);

  let postAttempts = 0;
  const mutation = client(async () => { postAttempts++; throw new TypeError('offline'); });
  await assert.rejects(mutation.api.request('/sessions/run/runs', {method: 'POST', body: {message: 'once'}}));
  assert.equal(postAttempts, 1);

  const callback = client(async () => stream(frame(1)));
  await assert.rejects(callback.api.events('run', {onEvent() { throw new TypeError('consumer failed'); }}));
  assert.deepEqual(callback.delays, []);
  const finished = client(async () => stream(frame(1, 'result'), true));
  await finished.api.events('run', {onEvent() {}});
  assert.deepEqual(finished.delays, []);
  const expired = client(async () => stream(frame(1, 'replay_unavailable')));
  await expired.api.events('run', {onEvent() {}});
  assert.deepEqual(expired.delays, []);
  const malformed = client(async () => stream('id: 1\nevent: delta\ndata: invalid\n\n'));
  await assert.rejects(malformed.api.events('run', {onEvent() {}}));
  assert.deepEqual(malformed.delays, []);

  let eofAttempts = 0;
  const ended = client(async () => { eofAttempts++; return stream(''); });
  await ended.api.events('run', {onEvent() {}});
  assert.equal(eofAttempts, 4);
  assert.deepEqual(ended.delays, [1000, 2000, 4000]);

  for (const recoverSnapshot of [false, true]) {
    const routes = [], saved = [];
    let eventAttempts = 0;
    const adapter = client(async (route, options = {}) => {
      routes.push({route, method: options.method || 'GET'});
      if (route.endsWith('/events')) {
        eventAttempts++;
        return recoverSnapshot ? new Response('', {status: 503}) : stream(frame(1) + frame(2, 'result'));
      }
      const payload = route.endsWith('/auth/session') ? {csrf_token: 'csrf'} :
        route.endsWith('/sessions/session/runs') ? {run_id: 'original-run'} :
        route.endsWith('/runs/original-run') ? {state: 'completed', response: 'saved result', conversation_id: 'conversation'} :
        route.endsWith('/sessions/session') ? {session_id: 'session', conversation_id: 'conversation', runs: []} : null;
      assert.notEqual(payload, null, route);
      return new Response(JSON.stringify(payload), {headers: {'Content-Type': 'application/json'}});
    });
    Object.assign(adapter.window, {
      location: {origin: 'http://localhost'}, crypto: {randomUUID: () => 'request-id'},
      sessionStorage: {getItem: () => JSON.stringify({sessionId: 'session', conversationId: 'conversation'}), setItem() {}},
      addEventListener() {}
    });
    Object.assign(adapter.window.Companion, {
      native: {available: () => false}, history: {open: async () => {}, save: async record => saved.push(record)}
    });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
      '../server/web/main-v1-adapter.js'), 'utf8'), {window: adapter.window, navigator: {},
      document: {getElementById: () => null}, console, URL, Response, TextEncoder,
      ReadableStream, AbortController});
    const response = await adapter.window.mainV1Fetch('/api/ai/stream',
      {method: 'POST', body: JSON.stringify({prompt: 'execute once'})});
    const emitted = await response.text();
    assert.ok(emitted.includes('saved result'), emitted);
    assert.equal(saved.length, 1);
    assert.equal(eventAttempts, recoverSnapshot ? 4 : 1);
    assert.equal(routes.filter(request => request.method === 'POST').length, 1);
    assert.equal(routes.filter(request => request.route.endsWith('/runs/original-run')).length, 1);
  }
  console.log('Stream reconnect, deduplication, retry limits, abort and no POST replay passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
