const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;

function loadAppsManager(extras = {}) {
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
  const code = fs.readFileSync(path.join(root, 'apps-manager.js'), 'utf8');
  vm.runInContext(code, context);
  return context.AppsManager;
}

(async () => {
  console.log('[Test] Running AppsManager unit tests...');

  // 1. Export test
  const AppsManagerFactory = loadAppsManager();
  assert(AppsManagerFactory && typeof AppsManagerFactory.create === 'function', 'AppsManager.create must be exported');

  // 2. Mock DOM & Announcer
  let announcedMessages = [];
  const mockAnnouncer = (msg) => {
    announcedMessages.push(msg);
  };

  const createdElements = [];
  function createMockElement(tag, id = '') {
    const el = {
      tagName: tag.toUpperCase(),
      id: id,
      className: '',
      innerHTML: '',
      textContent: '',
      open: false,
      attributes: {},
      children: [],
      listeners: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      addEventListener(evt, fn) {
        this.listeners[evt] = this.listeners[evt] || [];
        this.listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        (this.listeners[evt.type] || []).forEach(fn => fn(evt));
      },
      querySelector(selector) {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      showModal() { this.open = true; },
      close() { this.open = false; },
      focus() { this.focused = true; }
    };
    createdElements.push(el);
    return el;
  }

  const mockDoc = {
    getElementById(id) {
      return null;
    },
    createElement(tag) {
      return createMockElement(tag);
    },
    createDocumentFragment() {
      return {
        children: [],
        appendChild(child) { this.children.push(child); }
      };
    },
    contains(el) { return true; }
  };

  const mockDialog = createMockElement('dialog', 'apps-dialog');
  const mockList = createMockElement('div', 'apps-list-container');
  const mockBadge = createMockElement('span', 'val-apps-count-drawer');

  // Mock API requests
  const apiCalls = [];
  const mockApps = [
    { id: 'calculator_1', title: 'آلة حاسبة صوتية', description: 'حاسبة ناطقة للمكفوفين', updated_at: '2026-11-20T10:00:00Z', code: '<div>Calc</div>' },
    { id: 'counter_2', title: 'عداد تسبيح', description: 'عداد أذكار رقمي', updated_at: '2026-11-21T09:00:00Z', code: '<div>Counter</div>' }
  ];

  const mockCompanion = {
    request: async (endpoint, opts = {}) => {
      apiCalls.push({ endpoint, opts });
      if (endpoint === '/apps' && (!opts.method || opts.method === 'GET')) {
        return { ok: true, apps: mockApps };
      }
      if (endpoint.startsWith('/apps/') && opts.method === 'DELETE') {
        return { ok: true, deleted: true };
      }
      if (endpoint === '/apps' && opts.method === 'POST') {
        return { ok: true, app: opts.body };
      }
      if (endpoint === '/apps/calculator_1') {
        return { ok: true, app: mockApps[0] };
      }
      return { ok: true };
    }
  };

  let launchedApp = null;
  const mockCanvasRunner = {
    launch: (app) => {
      launchedApp = app;
    }
  };

  const mgr = AppsManagerFactory.create({
    document: mockDoc,
    dialogElement: mockDialog,
    listContainer: mockList,
    countBadge: mockBadge,
    announcer: mockAnnouncer,
    canvasRunner: mockCanvasRunner,
    window: {
      Companion: mockCompanion,
      confirm: () => true,
      setTimeout,
      clearTimeout
    }
  });

  // 3. Test Load Apps
  const loaded = await mgr.loadApps();
  assert.equal(loaded.length, 2, 'Should load 2 apps');
  assert.equal(mockBadge.textContent, '2', 'Badge count must be 2');

  // 4. Test Filter Apps
  mgr.filterApps('تسبيح');
  assert(announcedMessages.some(m => m.includes('1 تطبيق مطابق')), 'Must announce search match');

  mgr.filterApps('بحث_غير_موجود');
  assert(announcedMessages.some(m => m.includes('لم يتم العثور')), 'Must announce zero search matches');

  // Reset filter
  mgr.filterApps('');

  // 5. Test Run App
  await mgr.runApp('calculator_1');
  assert(launchedApp, 'CanvasRunner.launch must be invoked');
  assert.equal(launchedApp.id, 'calculator_1');
  assert.equal(mockDialog.open, false, 'Dialog must close when running app');

  // 6. Test Delete App
  await mgr.deleteApp('counter_2');
  assert.equal(mgr.getAppsList().length, 1, 'App must be removed from list');
  assert.equal(mockBadge.textContent, '1', 'Badge must update to 1');
  assert(announcedMessages.some(m => m.includes('تم حذف التطبيق بنجاح')), 'Must announce deletion');

  console.log('PASS: AppsManager unit tests (load, badge, filter, run, delete)');
})();
