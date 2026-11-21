const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;

function loadCanvasRunner(extras = {}) {
  const context = {
    console,
    TextDecoder,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    ...extras,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  const code = fs.readFileSync(path.join(root, 'canvas-runner.js'), 'utf8');
  vm.runInContext(code, context);
  return context.CanvasRunner;
}

(async () => {
  console.log('[Test] Running CanvasRunner unit tests...');

  // 1. Test CSS Transformation & Scoping
  const Runner = loadCanvasRunner();
  assert(Runner, 'CanvasRunner must be exported as UMD module');

  const rawCss = `
    html, body { background: #000; margin: 0; }
    :root { --main-color: red; }
    .card { padding: 10px; }
    button:hover { opacity: 0.8; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  const scopedCss = Runner.transformAppStyles(rawCss, '#canvas-mount-point');

  // Must replace html, body, and :root with the mount container
  assert(!scopedCss.includes('html, body'), 'html, body must be transformed');
  assert(!scopedCss.includes(':root'), ':root must be transformed');
  assert(scopedCss.includes('#canvas-mount-point'), 'Must contain container selector');
  assert(scopedCss.includes('#canvas-mount-point .card'), 'General rules must be prefixed');
  assert(scopedCss.includes('@keyframes fadeIn'), 'Keyframes must be preserved without broken prefixes');

  // 2. Test Announcer Throttling and Duplicate String Toggle
  let lastAnnounce = '';
  const mockAnnouncer = {
    announce: (text) => {
      lastAnnounce = text;
    }
  };

  const runnerInstance = Runner.create({
    announcer: mockAnnouncer
  });

  runnerInstance.announce('النتيجة 50');
  assert.equal(lastAnnounce, 'النتيجة 50');

  // Wait past throttle window to test identical announcement toggling zero-width space
  await new Promise((r) => setTimeout(r, 250));
  runnerInstance.announce('النتيجة 50');
  assert.equal(lastAnnounce, 'النتيجة 50\u200B', 'Must toggle zero-width space for duplicate string');

  // 3. Test Timer Tracking & Teardown
  let timerFired = false;
  let customDestroyFired = false;

  const mockMount = { innerHTML: '', appendChild: () => {}, removeChild: () => {} };
  const mockDialog = {
    showModal: () => {},
    close: () => {},
    open: true
  };

  const testApp = {
    id: 'test_app_1',
    title: 'تطبيق تجريبي',
    code: `
      <div>محتوى التطبيق</div>
      <script>
        CompanionApp.onDestroy(() => { window._customDestroy = true; });
        setTimeout(() => { window._timerRan = true; }, 500);
      </script>
    `
  };

  const runnerWithLifecycle = Runner.create({
    mountElement: mockMount,
    dialogElement: mockDialog,
    announcer: mockAnnouncer
  });

  runnerWithLifecycle.launch(testApp);
  assert.equal(runnerWithLifecycle.getCurrentApp().id, 'test_app_1');

  // Register an explicit onDestroy hook
  runnerWithLifecycle.onDestroy(() => {
    customDestroyFired = true;
  });

  // Execute teardown
  runnerWithLifecycle.teardown();
  assert.equal(customDestroyFired, true, 'onDestroy hooks must be invoked during teardown');
  assert.equal(runnerWithLifecycle.getCurrentApp(), null, 'Current app must be cleared');

  // 4. Test Defensive Focus Restoration
  let focusedId = null;
  const attachedBtn = {
    id: 'btn-orig',
    focus: () => { focusedId = 'btn-orig'; }
  };
  const mockMsgInput = {
    id: 'message-input',
    focus: () => { focusedId = 'message-input'; }
  };

  const mockDoc = {
    activeElement: attachedBtn,
    contains: (el) => el === attachedBtn,
    getElementById: (id) => (id === 'message-input' ? mockMsgInput : null)
  };

  const runnerWithFocus = Runner.create({
    document: mockDoc,
    mountElement: mockMount,
    dialogElement: mockDialog
  });

  // Focus restore when element is attached
  runnerWithFocus.captureFocus();
  runnerWithFocus.restoreFocus();
  assert.equal(focusedId, 'btn-orig');

  // Focus restore when originating element was detached (e.g. Chat re-rendered)
  mockDoc.contains = () => false; // Element no longer in document
  runnerWithFocus.restoreFocus();
  assert.equal(focusedId, 'message-input', 'Must fallback to message-input when original element is detached');

  console.log('PASS: CanvasRunner unit tests (styles, announcer, teardown, focus fallback)');
})();
