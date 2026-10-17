(function (global) {
  'use strict';
  const companion = global.Companion;
  const api = companion.api;
  const encode = encodeURIComponent;
  const uuid = () => global.crypto.randomUUID();
  const bundled = global.location.origin === 'https://appassets.androidplatform.net';
  const dashboard = bundled || !!document.getElementById('btn-wake-server');
  if (companion.native.available()) {
    const native = (action, args) => companion.native.request(action, args);
    global.AntigravityBridge = {
      getAppVersion: async () => (await native('get_app_version')).version,
      canInstallUnknownApps: async () => (await native('get_app_version')).can_install,
      isTermuxServerReady: async () => (await native('probe_server')).server_available === true,
      openSettings: () => native('open_settings'), openTermuxApp: () => native('open_termux_app'),
      copySetupCommand: () => native('copy_setup_command'),
      triggerServerWakeup: () => native('start_server'),
      startServer: () => native('start_server'), stopServer: () => native('stop_server'),
      openInstallPermissionSettings: () => native('open_install_permission'),
      runDiagnostics: async () => JSON.stringify(await native('run_diagnostics')),
      loadChatUrl: () => native('open_chat'), loadDashboardUrl: () => native('open_dashboard'),
      checkForUpdate: async () => {
        try { global.onUpdateCheckResult?.(await native('check_update')); }
        catch (error) { global.onUpdateCheckError?.({error: error.message}); }
      },
      startUpdateDownload: async () => {
        try { global.onUpdateDownloadComplete?.(await native('download_update')); }
        catch (error) { global.onUpdateDownloadError?.({error: error.message}); report(error); }
      }
    };
  }
  const mcpCatalog = [
  {
    "id": "fs",
    "name": "Filesystem",
    "category": "النظام والملفات",
    "description": "قراءة وكتابة واستعراض ملفات نظام أندرويد وتيرماكس بأمان",
    "package": "@modelcontextprotocol/server-filesystem",
    "icon": "📁",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-filesystem"
    ]
  },
  {
    "id": "sqlite",
    "name": "SQLite",
    "category": "قواعد البيانات",
    "description": "استعلام وإدارة قواعد بيانات SQLite3 المحلية بسهولة وسرعة",
    "package": "@modelcontextprotocol/server-sqlite",
    "icon": "🗄️",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-sqlite"
    ]
  },
  {
    "id": "memory",
    "name": "Memory (Knowledge Graph)",
    "category": "الذاكرة والاستدلال",
    "description": "رسم شجرة معرفية طويلة المدى وتذكر تفضيلات المستخدم بين الجلسات",
    "package": "@modelcontextprotocol/server-memory",
    "icon": "🧠",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-memory"
    ]
  },
  {
    "id": "fetch",
    "name": "Fetch",
    "category": "الشبكة والويب",
    "description": "جلب وقراءة صفحات الإنترنت وتحويلها لنصوص مهيأة للذكاء الاصطناعي",
    "package": "@modelcontextprotocol/server-fetch",
    "icon": "🌐",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-fetch"
    ]
  },
  {
    "id": "git",
    "name": "Git",
    "category": "أدوات التطوير",
    "description": "فحص مستودعات Git، قراءة الفروع، استعراض السجل والتغييرات",
    "package": "@modelcontextprotocol/server-git",
    "icon": "🐙",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-git"
    ]
  },
  {
    "id": "brave-search",
    "name": "Brave Search",
    "category": "البحث",
    "description": "البحث الحي في الويب والحصول على نتائج محدثة عبر محرك Brave",
    "package": "@modelcontextprotocol/server-brave-search",
    "icon": "🔍",
    "requires_auth": true,
    "auth_env": "BRAVE_API_KEY",
    "auth_hint": "يتطلب مفتاح Brave Search API",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-brave-search"
    ]
  },
  {
    "id": "github",
    "name": "GitHub",
    "category": "أدوات التطوير السحابية",
    "description": "إدارة المستودعات وملفات الأكواد وطلبات السحب وفحص القضايا بالتوثيق",
    "package": "@modelcontextprotocol/server-github",
    "icon": "🐙",
    "requires_auth": true,
    "auth_env": "GITHUB_PERSONAL_ACCESS_TOKEN",
    "auth_hint": "يتطلب توكن GitHub Personal Access Token أو اعتماد Device Flow",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-github"
    ]
  },
  {
    "id": "puppeteer",
    "name": "Puppeteer",
    "category": "أتمتة المتصفح",
    "description": "أتمتة متصفح Chromium، التقاط لقطات شاشة، واستخراج البيانات",
    "package": "@modelcontextprotocol/server-puppeteer",
    "icon": "🎭",
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-puppeteer"
    ]
  }
];
  const terminal = new Set(['completed', 'cancelled', 'failed', 'interrupted']);
  const stateKey = 'companion-main-v1';
  let current = {};
  try { current = JSON.parse(global.sessionStorage.getItem(stateKey) || '{}'); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  let settingsDocument;
  let policyDocument;
  let settingsGeneration = 0;
  let settingsRefresh;
  let settingsWrites = Promise.resolve();
  const settingsBroadcast = !bundled && 'BroadcastChannel' in global ? new BroadcastChannel('agy_settings_sync') : null;
  const cloneSettings = snapshot => JSON.parse(JSON.stringify(snapshot));
  function settingsBaseline() {
    return {revision: settingsDocument?.revision, policyRevision: policyDocument?.revision,
      permissions: cloneSettings(policyDocument?.permissions || {})};
  }
  function invalidateSettings() { settingsGeneration++; settingsRefresh = null; }
  function validateSettingsDocument(snapshot) {
    if (!snapshot || !snapshot.settings || typeof snapshot.settings !== 'object' || Array.isArray(snapshot.settings) ||
        !['string', 'number'].includes(typeof snapshot.revision)) throw new Error('استجابة الإعدادات غير صالحة؛ لم تتأكد نتيجة الطلب.');
    return snapshot;
  }
  function validatePolicyDocument(snapshot) {
    if (!snapshot || !['string', 'number'].includes(typeof snapshot.revision) ||
        !['allow', 'deny', 'ask'].every(key => Array.isArray(snapshot.permissions?.[key]))) {
      throw new Error('استجابة الأذون غير صالحة؛ لم تتأكد نتيجة الطلب.');
    }
    return snapshot;
  }
  function settingsView() {
    const stored = settingsDocument.settings;
    return cloneSettings({...stored, permissions: policyDocument.permissions,
      allow_commands: policyDocument.permissions.allow.some(rule => ['command', 'command(*)'].includes(rule)),
      whitelist: policyDocument.permissions.allow,
      tones_enabled: stored.sound !== false, haptic_enabled: stored.haptics !== false});
  }
  let authRequestId;
  let connection;
  let sessionCreation;
  const historyReady = dashboard ? Promise.resolve() : companion.history.open();
  historyReady.catch(report);
  function persist() { global.sessionStorage.setItem(stateKey, JSON.stringify(current)); }
  function report(error) {
    const live = document.getElementById('sr-announcer') || document.getElementById('live-announcer') || document.getElementById('aria-announcer');
    if (live) live.textContent = error.message;
    else console.error(error.message);
    if (!error.status) { const status = document.getElementById('chat-connection-status-text'); if (status) status.textContent = 'تعذر الاتصال'; }
  }
  function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {status, headers: {'Content-Type': 'application/json'}});
  }
  function unsupported(message) { throw new companion.ApiError(message, 409, 'native_cli_required'); }
  function connect() {
    if (bundled) return Promise.reject(new Error('افتح المحادثة للاتصال بخادم Termux.'));
    if (!connection) connection = api.restoreSession().then(session => {
      const status = document.getElementById('chat-connection-status-text'); if (status) status.textContent = 'متصل';
      return session;
    }).catch(error => { connection = null; report(error); throw error; });
    return connection;
  }
  async function request(route, options) {
    await connect();
    try { return await api.request(route, options); }
    catch (error) { if (error.status === 401) connection = null; throw error; }
  }
  async function settings() {
    if (!settingsRefresh) {
      const generation = settingsGeneration;
      const pending = Promise.all([request('/settings'), request('/cli/policy')]).then(async documents => {
        if (generation === settingsGeneration) {
          const acceptedSettings = validateSettingsDocument(documents[0]);
          const acceptedPolicy = validatePolicyDocument(documents[1]);
          [settingsDocument, policyDocument] = [acceptedSettings, acceptedPolicy];
        } else {
          return settings();
        }
        return settingsView();
      }).finally(() => { if (settingsRefresh === pending) settingsRefresh = null; });
      settingsRefresh = pending;
    }
    return settingsRefresh;
  }
  function saveSettings(patch, baseline) {
    const submitted = cloneSettings(patch);
    const editingBaseline = baseline ? cloneSettings(baseline) : null;
    const pending = settingsWrites.then(() => applySettings(submitted, editingBaseline));
    settingsWrites = pending.catch(() => {});
    return pending;
  }
  async function applySettings(patch, baseline) {
    if (!settingsDocument || !policyDocument) await settings();
    baseline ||= settingsBaseline();
    const cliFields = ['autopilot', 'allow_write', 'allow_web', 'allow_subagent',
      'allow_schedule', 'safe_mode', 'allowNonWorkspaceAccess', 'speech_enabled', 'permissions'];
    if (cliFields.some(key => key in patch)) unsupported('غيّر أذون agy من طرفيته؛ لم يُحفظ هذا الطلب.');
    const adjusted = {...patch};
    const savedFields = [];
    invalidateSettings();
    try {
      if ('allow_commands' in adjusted) {
        const allow = (baseline.permissions || policyDocument.permissions).allow.filter(rule => !['command', 'command(*)'].includes(rule));
        if (adjusted.allow_commands) allow.push('command(*)');
        adjusted.whitelist = allow;
        delete adjusted.allow_commands;
      }
      if ('whitelist' in adjusted) {
        policyDocument = validatePolicyDocument(await request('/cli/policy', {method: 'PATCH', body: {
          permissions: {...(baseline.permissions || policyDocument.permissions), allow: adjusted.whitelist}, revision: baseline.policyRevision}}));
        invalidateSettings();
        savedFields.push(...['allow_commands', 'whitelist'].filter(key => key in patch));
        delete adjusted.whitelist;
      }
      for (const [legacy, actual] of [['tones_enabled', 'sound'], ['haptic_enabled', 'haptics']]) {
        if (legacy in adjusted) { adjusted[actual] = adjusted[legacy]; delete adjusted[legacy]; }
      }
      if (Object.keys(adjusted).length) {
        settingsDocument = validateSettingsDocument(await request('/settings', {method: 'PATCH',
          headers: {'If-Match': '"' + baseline.revision + '"'}, body: {settings: adjusted}}));
        invalidateSettings();
        savedFields.push(...Object.keys(patch).filter(key => !['allow_commands', 'whitelist'].includes(key)));
      }
      return {settings: settingsView(), baseline: settingsBaseline(), savedFields};
    } catch (error) {
      error.savedFields = savedFields;
      error.settings = settingsView();
      error.baseline = settingsBaseline();
      throw error;
    } finally {
      invalidateSettings();
      if (savedFields.length) settingsBroadcast?.postMessage({type: 'SETTINGS_UPDATED'});
    }
  }
  function cwd() { return settingsDocument?.settings.cwd || settingsDocument?.settings.workspace_roots?.[0] || settingsDocument?.settings.trustedWorkspaces?.[0]; }
  function context() { return cwd() ? {cwd: cwd()} : {}; }
  function scoped(route) { return route + (cwd() ? '?cwd=' + encode(cwd()) : ''); }
  async function closeCurrent() {
    if (current.pending || current.pendingQueue) unsupported('نتيجة بدء الطلب غير مؤكدة؛ أعد متابعة الطلب نفسه قبل الانتقال.');
    if (current.sessionId) await request('/sessions/' + encode(current.sessionId) + '/close', {method: 'POST', body: {}});
    current = {}; persist();
  }
  async function ensureSession(payload) {
    if (payload.force_new && !current.pending) await closeCurrent();
    if (payload.conversation_id && payload.conversation_id !== current.conversationId) {
      if (current.sessionId) await closeCurrent();
      const listed = await request('/sessions');
      const found = listed.sessions.find(session => session.conversation_id === payload.conversation_id || session.session_id === payload.conversation_id);
      if (found) { current.sessionId = found.session_id; current.conversationId = found.conversation_id; persist(); }
    }
    if (current.sessionId) return;
    if (!sessionCreation) sessionCreation = (async () => {
      const stored = await settings();
      const options = context();
      for (const key of ['model', 'agent', 'effort', 'mode', 'sandbox', 'project']) {
        if (stored[key] !== undefined && stored[key] !== '') options[key] = stored[key];
      }
      if (payload.conversation_id) options.conversation_id = payload.conversation_id;
      const session = await request('/sessions', {method: 'POST', body: options});
      current.sessionId = session.session_id;
      current.conversationId = session.conversation_id || session.session_id;
      persist();
    })().finally(() => { sessionCreation = null; });
    await sessionCreation;
  }
  function runMessages(session) {
    return (session.runs || []).flatMap(run => [
      {id: run.run_id + ':user', role: 'user', text: run.message || '', time: run.created_at ? new Date(run.created_at * 1000).toISOString() : ''},
      {id: run.run_id, role: 'agent', text: run.response || '', time: run.completed_at ? new Date(run.completed_at * 1000).toISOString() : '', state: run.state}
    ]);
  }
  async function saveHistory(sessionId) {
    const session = await request('/sessions/' + encode(sessionId));
    await historyReady;
    const messages = runMessages(session);
    await companion.history.save({id: session.session_id, conversation_id: session.conversation_id,
      title: messages[0]?.text.slice(0, 120) || 'محادثة', messages, read_only: false});
    return session;
  }
  async function conversation(id) {
    await historyReady;
    let sessions;
    try { sessions = (await request('/sessions')).sessions; }
    catch (error) {
      const local = (await companion.history.list()).find(record => record.id === id || record.conversation_id === id);
      if (local && !error.status) return {messages: local.messages, read_only: true};
      throw error;
    }
    const session = sessions.find(entry => entry.session_id === id || entry.conversation_id === id);
    if (session) return {messages: runMessages(await saveHistory(session.session_id))};
    const local = await companion.history.get(id);
    if (local) return {messages: local.messages.map(message => ({...message, role: message.role === 'user' ? 'user' : 'agent'})), read_only: local.read_only};
    const legacy = await request('/legacy/conversations/' + encode(id));
    if (legacy && Array.isArray(legacy.messages)) {
      return {
        id: legacy.id || id,
        messages: legacy.messages,
        artifacts: legacy.artifacts || [],
        total_tokens: legacy.total_tokens || 0
      };
    }
    const records = (legacy && legacy.records) || [];
    const messages = [];
    let currentAgent = null;
    records.forEach((record, index) => {
      const type = record.type;
      if (type === 'USER_INPUT') {
        if (currentAgent) { messages.push(currentAgent); currentAgent = null; }
        let c = record.content || '';
        if (c.includes('<USER_REQUEST>')) {
          c = c.split('<USER_REQUEST>')[1].split('</USER_REQUEST>')[0].trim();
        }
        if (c) {
          messages.push({
            id: String(index),
            role: 'user',
            text: c,
            time: record.created_at || ''
          });
        }
      } else if (type === 'PLANNER_RESPONSE' || type === 'AGENT_RESPONSE') {
        const c = record.content || '';
        const th = record.thinking || '';
        const toolCalls = record.tool_calls || [];
        if (!currentAgent) {
          currentAgent = {
            id: String(index),
            role: 'agent',
            text: c,
            thinking: th,
            tool_count: toolCalls.length,
            time: record.created_at || ''
          };
        } else {
          if (th) currentAgent.thinking = (currentAgent.thinking ? currentAgent.thinking + '\n\n' + th : th);
          if (c) currentAgent.text = (currentAgent.text ? currentAgent.text + '\n\n' + c : c);
          currentAgent.tool_count = (currentAgent.tool_count || 0) + toolCalls.length;
          currentAgent.time = record.created_at || currentAgent.time;
        }
      }
    });
    if (currentAgent) messages.push(currentAgent);
    messages.forEach(msg => {
      if (msg.role === 'agent' && !msg.text) {
        if (msg.tool_count > 0) msg.text = '*(نفّذ الوكيل ' + msg.tool_count + ' عملية/أداة بنجاح في هذه الخطوة)*';
        else if (msg.thinking) msg.text = '*(خطوات تفكير وتحليل فقط)*';
      }
    });
    return {
      id: id,
      messages: messages,
      artifacts: (legacy && legacy.artifacts) || [],
      total_tokens: (legacy && legacy.total_tokens) || 0
    };
  }
  async function conversations() {
    await historyReady;
    const local = await companion.history.list();
    let sessions, legacy;
    try {
      sessions = (await request('/sessions')).sessions;
      legacy = (await request('/legacy/conversations')).conversations;
    } catch (error) {
      if (error.status) throw error;
      return {conversations: local.map(record => ({id: record.id, title: record.title, date: '', read_only: true}))};
    }
    const rows = new Map(local.map(record => [record.id, {id: record.id, title: record.title, date: '', read_only: record.read_only}]));
    for (const session of sessions) rows.set(session.session_id, {id: session.conversation_id || session.session_id,
      title: local.find(record => record.id === session.session_id)?.title || session.conversation_id || 'محادثة', date: '', message_count: session.runs.length * 2});
    for (const record of legacy) if (![...rows.values()].some(row => row.id === (record.conversation_id || record.id))) {
      const cid = record.conversation_id || record.id;
      rows.set(cid, {
        id: cid,
        title: record.title,
        date: record.date || new Date((record.mtime || 0) * 1000).toLocaleString(),
        steps: record.steps || 0
      });
    }
    return {conversations: [...rows.values()]};
  }
  async function mentions(query) {
    if (!settingsDocument) await settings();
    const fragment = query.replace(/^"/, '').replace(/\\/g, '/');
    const slash = fragment.lastIndexOf('/');
    const parent = slash >= 0 ? fragment.slice(0, slash + 1) : '';
    const leaf = fragment.slice(slash + 1).toLowerCase();
    const directory = /^(?:\/|[A-Za-z]:\/)/.test(parent) ? parent : (cwd() ? cwd().replace(/[\\/]$/, '') + '/' + parent : parent);
    const listing = await request('/files' + (directory ? '?path=' + encode(directory) : ''));
    return listing.entries.filter(entry => entry.name.toLowerCase().includes(leaf)).slice(0, 100).map(entry => ({
      name: entry.name, path: entry.path, title: entry.path, desc: entry.is_dir ? 'مجلد' : 'ملف',
      type: entry.is_dir ? 'directory' : 'file', enabled: true, icon: '', command: ''
    }));
  }
  function convertEvent(event) {
    const payload = event.payload || {};
    if (event.event === 'state' && payload.conversation_id) return {type: 'init', conversation_id: payload.conversation_id};
    if (event.event === 'delta') return {type: 'chunk', text: payload.text_delta};
    if (event.event === 'thought') return {type: 'thought', text: payload.text || payload.thought || ''};
    if (event.event === 'artifact') return {type: 'artifact', name: payload.name, path: payload.path, summary: payload.summary, requestFeedback: payload.requestFeedback, userFacing: payload.userFacing};
    if (event.event === 'tool') {
      const toolInfo = payload.tool_info || payload;
      const toolName = payload.tool_name || payload.name || payload.tool || toolInfo.tool_name || toolInfo.name || toolInfo.tool || 'command';
      const params = toolInfo.parameters || payload.tool_input || payload.input || payload.params || {};
      const out = toolInfo.output || payload.output || '';
      const state = payload.tool_state || toolInfo.state || payload.status || (payload.state !== 'running' ? payload.state : null) || 'ACTIVE';
      return {
        type: 'tool_step',
        tool: toolName,
        params: params,
        state: state,
        output: out
      };
    }
    if (event.event === 'error' || event.event === 'replay_unavailable') return {type: 'error', message: payload.message || 'تعذر استعادة البث؛ افتح سجل المحادثة.'};
    if (event.event === 'result') return {type: 'final_result', response: payload.response || '', state: payload.state};
    return null;
  }
  async function stream(payload, signal) {
    if (current.pending && current.pending.message !== payload.prompt) unsupported('طلب سابق غير مؤكد؛ تابع النص السابق دون إنشاء طلب آخر.');
    await ensureSession(payload);
    current.pending = current.pending || {message: payload.prompt, requestId: uuid()}; persist();
    const started = await request('/sessions/' + encode(current.sessionId) + '/runs', {method: 'POST',
      body: {message: current.pending.message, client_request_id: current.pending.requestId}});
    current.runId = started.run_id; current.cursor = ''; current.pending = null; persist();
    const sessionId = current.sessionId;
    const runId = current.runId;
    const encoder = new TextEncoder();
    const controller = new AbortController();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', () => controller.abort(), {once: true});
    const body = new ReadableStream({
      start(output) {
        const emit = payload => output.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + '\n\n'));
        emit({type: 'init', conversation_id: current.conversationId});
        const onEvent = event => {
          if (event.id) { if (current.sessionId === sessionId) { current.cursor = event.id; persist(); } }
          if (event.payload.conversation_id && current.sessionId === sessionId) {
            current.conversationId = event.payload.conversation_id; persist();
            emit({type: 'init', conversation_id: current.conversationId});
          }
          const converted = convertEvent(event);
          if (converted) emit(converted);
        };
        (async () => {
          let streamFailure;
          try { await api.events(runId, {signal: controller.signal, cursor: current.cursor, onEvent}); }
          catch (error) {
            if (controller.signal.aborted) throw error;
            streamFailure = error;
          }
          const snapshot = await request('/runs/' + encode(runId), {signal: controller.signal});
          if (terminal.has(snapshot.state)) {
            if (snapshot.conversation_id) emit({type: 'init', conversation_id: snapshot.conversation_id});
            if (snapshot.error) emit({type: 'error', message: snapshot.error});
            emit({type: 'final_result', response: snapshot.response || '', state: snapshot.state});
            await saveHistory(sessionId);
            output.close(); return;
          }
          throw streamFailure || new Error('انقطع البث؛ الطلب ما زال قيد التنفيذ. افتح سجل المحادثة لمتابعته.');
        })().catch(error => output.error(error));
      },
      cancel() { controller.abort(); }
    });
    return new Response(body, {headers: {'Content-Type': 'text/event-stream'}});
  }
  async function handoff(route, body) {
    const outcome = await request(route, {method: 'POST', body: {...context(), ...body}});
    if (outcome.status !== 'native_launch') unsupported('افتح agy في Termux لإتمام المصادقة؛ لا تتوفر إحالة أصلية.');
    authRequestId = outcome.request_id;
    await companion.native.request(outcome.action, outcome.cwd ? {cwd: outcome.cwd} : {});
    return {status: 'pending', message: 'فُتحت طرفية agy؛ أتمّ الفعل فيها. فتحها لا يثبت نجاحه.'};
  }
  async function tasks() {
    const [owned, local] = await Promise.all([request('/tasks'), request('/local-tasks')]);
    const rows = [...owned.tasks, ...(local.tasks || []).map(task => ({...task, local: true}))].map(task => ({...task,
      id: task.task_id, status: terminal.has(task.state) ? task.state : 'active',
      description: task.message || task.kind || 'دور محادثة مملوك'}));
    return {tasks: rows, subagents: owned.subagents, active_count: rows.filter(row => row.status === 'active').length};
  }
  async function mcpMutation(path, body) {
    if (path === 'mcp/install') {
      const catalog = mcpCatalog.find(entry => entry.id === body.name);
      const command = catalog?.command || body.commandOrUrl || body.command || body.url;
      let args = catalog?.args || body.args || [];
      if (catalog?.id === 'fs') {
        if (!cwd()) unsupported('اختر مجلد عمل موثوقًا قبل تثبيت بروتوكول الملفات.');
        args = [...args, cwd()];
      }
      if (!catalog && body.type !== 'http' && /\s/.test(command)) unsupported('اكتب الملف التنفيذي وحده؛ مرّر وسائطه في قائمة args.');
      const env = Array.isArray(body.env) ? Object.fromEntries(body.env.map(entry => {
        const split = entry.indexOf('=');
        if (split < 1) throw new Error('اكتب قيم البيئة بصيغة KEY=value.');
        return [entry.slice(0, split), entry.slice(split + 1)];
      })) : body.env;
      await request('/mcp', {method: 'POST', body: {...body, ...context(), commandOrUrl: command, args, env: body.type === 'http' ? {} : env, headers: body.type === 'http' ? env : body.headers}});
    } else {
      const listing = await request(scoped('/mcp'));
      const selected = listing.servers.find(server => server.name === body.name);
      if (!selected) throw new Error('خادم MCP غير موجود.');
      await request('/mcp/' + encode(body.name) + (path === 'mcp/toggle' ? '/' + (body.enable ? 'enable' : 'disable') : ''),
        {method: path === 'mcp/toggle' ? 'POST' : 'DELETE', body: {...context(), revision: selected.revision}});
    }
    return {status: 'ok'};
  }
  async function dispatch(path, query, body, options) {
    switch (path) {
      case 'ai/settings': {
        if (options.method === 'POST') return saveSettings(body, options.settingsBaseline);
        await settings();
        return new Response(JSON.stringify(settingsView()), {headers: {'Content-Type': 'application/json',
          'X-Settings-Revision': String(settingsDocument.revision), 'X-Policy-Revision': String(policyDocument.revision)}});
      }
      case 'ai/models': return (await request('/models')).models;
      case 'ai/agents': if (!settingsDocument) await settings(); return request(scoped('/agents'));
      case 'ai/commands': return {commands: (await request(scoped('/commands'))).commands.map(command =>
        ({...command, cmd: command.id, desc: command.description || command.name}))};
      case 'ai/stream': return stream(body, options.signal);
      case 'ai/send': {
        if (!current.sessionId) unsupported('لا توجد جلسة لحفظ الرسالة التالية.');
        if (current.pendingQueue && current.pendingQueue.message !== body.prompt) unsupported('رسالة تالية مجهولة النتيجة؛ افحص المهام قبل حفظ أخرى.');
        current.pendingQueue ||= {message: body.prompt, requestId: uuid()}; persist();
        const task = await request('/local-tasks', {method: 'POST', body: {session_id: current.sessionId,
          message: body.prompt, request_id: current.pendingQueue.requestId, mode: 'queued'}});
        current.pendingQueue = null; persist();
        return {queued: true, task};
      }
      case 'ai/abort':
        if (current.runId) await request('/runs/' + encode(current.runId) + '/cancel', {method: 'POST', body: {}});
        return {status: 'ok'};
      case 'ai/chat/reset': await closeCurrent(); return {status: 'ok'};
      case 'ai/conversations': return conversations();
      case 'ai/conversation': return conversation(query.get('id'));
      case 'ai/permissions/whitelist/remove': {
        await settings();
        const saved = await saveSettings({whitelist: policyDocument.permissions.allow.filter(entry => entry !== (body.rule || body.command || body.pattern))});
        return {whitelist: saved.settings.whitelist};
      }
      case 'ai/permission': unsupported('أذون الدور من اختصاص agy؛ لا يقبل API حقن موافقة في الدور الجاري.'); break;
      case 'ai/quota': {
        const report = await request('/quota' + (query.get('refresh') === '1' ? '?refresh=1' : ''));
        return {...report, quotas: report.quotas.map(quota => ({...quota, pct: quota.remaining_percent + '%', pct_val: quota.remaining_percent}))};
      }
      case 'ai/artifacts': {
        const q = query.get('conversation_id');
        return request('/artifacts' + (q ? '?conversation_id=' + encode(q) : ''));
      }
      case 'ai/artifacts/content': {
        const params = [];
        if (query.get('name')) params.push('name=' + encode(query.get('name')));
        if (query.get('conversation_id')) params.push('conversation_id=' + encode(query.get('conversation_id')));
        if (query.get('path')) params.push('path=' + encode(query.get('path')));
        return request('/artifacts/content?' + params.join('&'));
      }
      case 'ai/tasks': return tasks();
      case 'ai/tasks/manage':
        if (body.action === 'delete') unsupported('سجل الأدوار محفوظ؛ لا يتيح API حذفه.');
        const inventory = await request('/local-tasks');
        return request((inventory.tasks.some(task => task.task_id === body.task_id) ? '/local-tasks/' : '/tasks/') + encode(body.task_id) + '/cancel', {method: 'POST', body: {}});
      case 'fs/list': {
        if (!settingsDocument) await settings();
        const path = query.get('path') || cwd();
        const listing = await request('/files' + (path ? '?path=' + encode(path) : ''));
        const parent = listing.path.replace(/[\\/][^\\/]+[\\/]?$/, '') || listing.path;
        return {current_dir: listing.path, parent_dir: parent, items: listing.entries};
      }
      case 'fs/select': await closeCurrent(); return saveSettings({cwd: body.path});
      case 'fs/read': return request('/file?path=' + encode(query.get('path')));
      case 'fs/mkdir': return request('/directories', {method: 'POST', body: {path: body.parent_dir.replace(/[\\/]$/, '') + '/' + body.name}});
      case 'skills/list': return request(scoped('/skills'));
      case 'plugins/list': return request(scoped('/plugins'));
      case 'skills/toggle': case 'plugins/toggle':
        await request('/' + path.split('/')[0] + '/' + encode(body.name || body.id) + '/' + ((body.enable ?? body.enabled) ? 'enable' : 'disable'),
          {method: 'POST', body: context()});
        return {status: 'ok'};
      case 'mcp/list': if (!settingsDocument) await settings(); return {installed: (await request(scoped('/mcp'))).servers, catalog: mcpCatalog};
      case 'mcp/install': case 'mcp/toggle': case 'mcp/remove': return mcpMutation(path, body);
      case 'mcp/oauth': {
        const name = body.name || query.get('name');
        return request('/mcp/' + encode(name) + '/oauth' + (options.method === 'PATCH' ? '' : (cwd() ? '?cwd=' + encode(cwd()) : '')),
          options.method === 'PATCH' ? {method: 'PATCH', body: {...context(), oauth: body.oauth, revision: body.revision}} : undefined);
      }
      case 'mcp/auth/test': return request('/mcp/' + encode(body.name) + '/test', {method: 'POST', body: context()});
      case 'mcp/auth/request_device': return handoff('/mcp/' + encode(body.name) + '/authenticate');
      case 'mcp/auth/pair': unsupported('أتمّ ربط MCP في طرفية agy؛ لا تُحفظ رموز الدخول في الواجهة.'); break;
      case 'auth/status': {
        const status = await request('/auth/status');
        return {auth: {...status, logged_in: null, is_valid: null}, wizard: {state: status.pending ? 'NATIVE' : 'IDLE', is_running: false, message: status.reason}};
      }
      case 'auth/start': return handoff('/auth/login');
      case 'auth/logout': return handoff('/auth/logout', {confirmed: true});
      case 'auth/cancel':
        if (authRequestId) return request('/auth/' + encode(authRequestId) + '/cancel', {method: 'POST', body: {}});
        return {status: 'idle'};
      case 'auth/open_browser': case 'auth/input': case 'auth/accept_terms':
        unsupported('أتمّ تسجيل الدخول في طرفية agy؛ لا تجمع الواجهة رموز الحساب.'); break;
      case 'system/version': return request('/system/cli-version');
      case 'system/update': {
        current.updateRequestId ||= uuid(); persist();
        const outcome = await request('/system/cli-update', {method: 'POST', body: {request_id: current.updateRequestId}});
        if (['completed', 'unchanged'].includes(outcome.status)) { current.updateRequestId = null; persist(); }
        return {...outcome, status: outcome.status === 'completed' ? 'ok' : outcome.status,
          message: outcome.status === 'outcome_unknown' ? 'لم تتأكد نتيجة الترقية؛ افحص النسخة قبل تكرارها.' : outcome.status};
      }
      case 'system/usage': {
        const usage = await request('/system/usage');
        const disk = usage.disk;
        return {...usage, disk: {...disk, pct: Math.round(disk.used_bytes / disk.total_bytes * 100),
          used: (disk.used_bytes / 1073741824).toFixed(1) + ' GiB', total: (disk.total_bytes / 1073741824).toFixed(1) + ' GiB'}};
      }
      case 'shutdown': return request('/system/shutdown', {method: 'POST', body: {}});
      case 'client/visibility': return request('/client/visibility', {method: 'POST', body: {client_id: clientId, visible: body.visible}});
      default: throw new companion.ApiError('المسار غير مدعوم: ' + path, 404, 'unknown_route');
    }
  }
  const clientId = uuid();
  global.mainV1Fetch = async function (route, options = {}) {
    try {
      const url = new URL(route, global.location.origin);
      if (url.origin !== global.location.origin || !url.pathname.startsWith('/api/')) throw new Error('المسار خارج API المحلي.');
      const body = options.body ? JSON.parse(options.body) : {};
      const result = await dispatch(url.pathname.slice(5), url.searchParams, body, options);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      report(error);
      return json({error: error.message, message: error.message, code: error.code || 'request_failed', savedFields: error.savedFields, settings: error.settings, baseline: error.baseline}, error.status || 503);
    }
  };
  // Startup stays usable offline; each action retries its own authenticated connection.
  global.mainV1 = {ready: dashboard ? Promise.resolve() : Promise.allSettled([connect(), historyReady]), healthy, mentions, invalidateSettings, settingsBroadcast, preferences: () => cloneSettings(settingsDocument?.settings || {}), currentConversation: () => current.conversationId};
  companion.ui = {dismissTopDialog() {
    const popup = document.getElementById('at-autocomplete-popup') || document.getElementById('slash-autocomplete-popup');
    if (popup) {
      document.getElementById('ai-prompt-input')?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
      if (!popup.isConnected) return true;
    }
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    if (dialogs.length) { dialogs[dialogs.length - 1].close(); return true; }
    const drawer = document.getElementById('antigravity-drawer');
    if (drawer?.getAttribute('aria-hidden') === 'false') { global.toggleAppDrawer?.(false); return true; }
    return false;
  }};
  async function healthy() {
    if (companion.native.available()) return global.AntigravityBridge.isTermuxServerReady();
    if (bundled) return false;
    try { return (await global.fetch('/health', {cache: 'no-store'})).ok; }
    catch (error) { return false; }
  }
  global.addEventListener('companion-native-progress', event => {
    global.onUpdateProgress?.(event.detail.percent);
  });
  if (typeof caches !== 'undefined' && 'keys' in caches) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        if (key.startsWith('antigravity-static-') && key !== 'antigravity-static-v1.3.8-gfm-artifacts') {
          caches.delete(key);
        }
      });
    }).catch(report);
  }
  if (!bundled && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=1.3.8').then(reg => {
      reg.update().catch(report);
    }).catch(report);
  }
})(window);
