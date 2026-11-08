const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT, 'server', 'web', 'index.html');
const JS_PATH = path.join(ROOT, 'server', 'web', 'main-ui.js');

function testHtmlControls() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  
  assert(html.includes('id="btn-live-voice"'), 'index.html must have #btn-live-voice button');
  assert(html.includes('aria-pressed="false"'), '#btn-live-voice must start with aria-pressed="false"');
  assert(html.includes('بدء البث المباشر'), '#btn-live-voice must have accessible Arabic label بدء البث المباشر');
  assert(html.includes('id="voice-select"'), 'index.html must have #voice-select voice dropdown');
  
  console.log('HTML controls tests passed.');
}

function testJsClient() {
  const js = fs.readFileSync(JS_PATH, 'utf-8');
  
  assert(js.includes('LiveVoice') || js.includes('live-voice'), 'app.js must implement live voice streaming logic');
  assert(js.includes('getUserMedia'), 'app.js must call getUserMedia for microphone');
  assert(js.includes('echoCancellation'), 'app.js must specify echoCancellation: true for clean voice duplex');
  assert(js.includes('/api/v1/voice/live'), 'app.js must connect to /api/v1/voice/live websocket');
  assert(js.includes('sr-announcer'), 'app.js must announce voice state changes to screen readers');
  
  console.log('JS live voice client tests passed.');
}

try {
  testHtmlControls();
  testJsClient();
  console.log('ALL LIVE VOICE UI TESTS PASSED');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
