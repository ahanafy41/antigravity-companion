const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT, 'server', 'web', 'index.html');
const JS_PATH = path.join(ROOT, 'server', 'web', 'main-ui.js');

function testHtmlControls() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  
  assert(html.includes('id="btn-live-voice"'), 'index.html must have #btn-live-voice button');
  assert(html.includes('id="native-voice-bar"'), 'index.html must have #native-voice-bar');
  assert(html.includes('id="btn-native-voice-mute"'), 'index.html must have #btn-native-voice-mute');
  assert(html.includes('id="btn-native-voice-hangup"'), 'index.html must have #btn-native-voice-hangup');
  assert(html.includes('id="native-voice-status-text"'), 'index.html must have #native-voice-status-text');
  assert(html.includes('id="btn-open-voice-dialog"'), 'index.html must have #btn-open-voice-dialog button in drawer');
  assert(html.includes('id="voice-picker-dialog"'), 'index.html must have #voice-picker-dialog modal');
  assert(html.includes('id="drawer-active-voice-name"'), 'index.html must have active voice badge');
  assert(html.includes('btn-select-voice'), 'index.html must have voice select buttons');
  
  console.log('HTML voice controls tests passed.');
}

function testJsClient() {
  const js = fs.readFileSync(JS_PATH, 'utf-8');
  
  assert(js.includes('initVoicePicker'), 'main-ui.js must implement initVoicePicker');
  assert(js.includes('/api/v1/voice/native/start'), 'main-ui.js must call native voice start');
  assert(js.includes('/api/v1/voice/native/toggle-mute'), 'main-ui.js must call native voice toggle-mute');
  assert(js.includes('/api/v1/voice/native/stop'), 'main-ui.js must call native voice stop');
  assert(js.includes('/api/v1/voice/catalog'), 'main-ui.js must fetch /api/v1/voice/catalog');
  assert(js.includes('/api/v1/voice/select'), 'main-ui.js must save selected voice to /api/v1/voice/select');
  assert(js.includes('voice-picker-dialog'), 'main-ui.js must manage voice picker modal');
  assert(js.includes('announce'), 'main-ui.js must announce voice changes to screen readers');
  
  console.log('JS voice picker client tests passed.');
}

try {
  testHtmlControls();
  testJsClient();
  console.log('ALL LIVE VOICE UI TESTS PASSED');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
