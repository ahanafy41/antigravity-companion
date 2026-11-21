const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;

function loadEnvironment() {
  const context = {
    console,
    TextDecoder,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    Blob,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  // Load CanvasRunner
  const canvasRunnerCode = fs.readFileSync(path.join(root, 'canvas-runner.js'), 'utf8');
  vm.runInContext(canvasRunnerCode, context);

  // Load AppsManager
  const appsManagerCode = fs.readFileSync(path.join(root, 'apps-manager.js'), 'utf8');
  vm.runInContext(appsManagerCode, context);

  return context;
}

(async () => {
  console.log('[Test] Running Canvas & Apps Integration tests...');
  const env = loadEnvironment();

  assert(env.CanvasRunner, 'CanvasRunner must be defined');
  assert(env.AppsManager, 'AppsManager must be defined');

  // Verify CSS transformation
  const testHtmlApp = `
    <style>
      body { background: #111; color: #fff; }
      .btn { padding: 10px; }
    </style>
    <div id="counter">0</div>
    <button id="inc-btn">زيادة</button>
    <script>
      let count = 0;
      const el = document.getElementById('counter');
      CompanionApp.announce('تم فتح العداد');
      CompanionApp.onDestroy(() => {
        window._counterDestroyed = true;
      });
    </script>
  `;

  let announced = [];
  const mockAnnouncer = (text) => {
    announced.push(text);
  };

  const mockMount = { innerHTML: '', appendChild: () => {}, removeChild: () => {} };
  const mockDialog = {
    showModal: () => { mockDialog.open = true; },
    close: () => { mockDialog.open = false; },
    open: false
  };

  const runner = env.CanvasRunner.create({
    mountElement: mockMount,
    dialogElement: mockDialog,
    announcer: mockAnnouncer
  });

  // Launch app in canvas
  const launched = runner.launch({
    id: 'counter_app',
    title: 'تطبيق عداد',
    code: testHtmlApp
  });

  assert.equal(launched, true, 'App must launch successfully');
  assert.equal(mockDialog.open, true, 'Dialog must open on launch');
  assert(mockMount.innerHTML.includes('id="counter"'), 'Mount point must contain app markup');
  assert(mockMount.innerHTML.includes('#canvas-mount-point'), 'Styles must be scoped to mount point');

  // Verify save app flow
  const savedApps = [];
  const mockCompanion = {
    request: async (endpoint, opts = {}) => {
      if (endpoint === '/apps' && opts.method === 'POST') {
        savedApps.push(opts.body);
        return { ok: true, app: opts.body };
      }
      if (endpoint === '/apps' && (!opts.method || opts.method === 'GET')) {
        return { ok: true, apps: savedApps };
      }
      return { ok: true };
    }
  };

  const mockBadge = { textContent: '0', setAttribute: () => {} };
  const mockDoc = {
    getElementById: () => null,
    createElement: (tag) => ({
      tagName: tag,
      setAttribute: () => {},
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    }),
    createDocumentFragment: () => ({ children: [], appendChild: () => {} }),
    contains: () => true
  };

  const appsMgr = env.AppsManager.create({
    countBadge: mockBadge,
    announcer: mockAnnouncer,
    canvasRunner: runner,
    document: mockDoc,
    window: {
      Companion: mockCompanion,
      setTimeout,
      clearTimeout
    }
  });

  // Save via toolbar callback
  const currentApp = runner.getCurrentApp();
  const saved = await appsMgr.saveApp(currentApp);
  assert.equal(saved.id, 'counter_app');
  assert.equal(savedApps.length, 1);
  assert.equal(mockBadge.textContent, '1', 'Badge must update to 1 app');

  // Teardown
  runner.teardown();
  assert.equal(runner.getCurrentApp(), null);
  assert.equal(mockMount.innerHTML, '');
  assert.equal(mockDialog.open, false);

  console.log('PASS: Canvas & Apps Integration tests (launch, scoping, save, teardown)');
})();
