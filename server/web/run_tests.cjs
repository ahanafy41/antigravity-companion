const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
function load(name, extras = {}) {
  const context = { console, TextDecoder, URL, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, ...extras };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
  return context.Companion;
}
(async () => {
  const calls = [];
  const api = load('api.js', { fetch: async (url, options) => {
    calls.push({url, options});
    return {ok:true, status:200, json:async()=>({csrf_token:'test-token'})};
  }}).api;
  await api.restoreSession();
  await api.request('/sessions', {method:'POST', body:{cwd:'.'}});
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'test-token');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].url, '/api/v1/sessions');
  const stream = load('api.js').parseSseFrames;
  const frames = stream('event: delta\r\ndata: {"text_delta":"سلام"}\r\n\r\nevent: result\ndata: {"state":"completed"}\n\npartial');
  assert.equal(frames.events[0].payload.text_delta, 'سلام');
  assert.equal(frames.events[1].event, 'result');
  assert.equal(frames.remainder, 'partial');
  const legacy = load('history.js').legacyRecords;
  const source = { length:3, key:i=>['other','antigravity_chats','chat_history'][i], getItem:key=>({other:'{"token":"secret"}', antigravity_chats:'[{"id":"old","title":"قديم","messages":[{"role":"user","content":"نص"}]}]',chat_history:'invalid'})[key]};
  const records = legacy(source);
  assert.equal(records.length, 1);
  assert.equal(records[0].messages[0].text, 'نص');
  assert.equal(records[0].read_only, true);
  for (const invalid of ['null','{"chats":{}}','42']) {
    const malformed = {length:1,key:()=>"chats",getItem:()=>invalid};
    assert.equal(legacy(malformed).length,0);
  }
  const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(sw, /STATIC_PATHS/);
  assert.match(sw, /request.method !== 'GET'/);
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.doesNotMatch(html, /https:\/\/.*(?:cdn|unpkg)/);
  assert.match(html, /alpine-csp/);
  console.log('PASS: CSRF recovery, credentialed mutation, Unicode SSE framing, nondestructive legacy import, static-only worker, local dependencies');
})().catch(error=>{console.error(error); process.exitCode=1;});
