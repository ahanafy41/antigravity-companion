(function (global) {
  'use strict';
  const companion = global.Companion;
  const state = companion.state;
  const ui = companion.ui;
  const app = {sessionOptions:{}};
  let streamController;
  let activeMessage;
  let activeNodes;
  let historyTimer;
  let historyWrites = Promise.resolve();
  let connecting = false;
  let pendingSubmission;
  let sessionCreation;
  let suggestionRequest = 0;
  let catalogRequest = 0;
  const suggestionSources = new Map();
  const updateMilestones = new Map();
  const feedbackSeen = new Set();
  const visibilityClientId = global.crypto.randomUUID();
  let nativeVisible = true;
  const terminalStates = ['completed','cancelled','failed','interrupted'];
  function connectionLabel() { return state.connected ? (state.paired ? 'متصل ومقترن' : 'تعذر إنشاء الجلسة المحلية') : 'غير متصل'; }
  function refreshConnection() {
    if (global.Alpine) global.Alpine.$data(document.body).connectionLabel = connectionLabel();
    ui.byId('connection-section').hidden = state.connected && state.paired;
    ui.byId('start-server').hidden = !companion.native.available() || state.connected;
    ui.busyControls();
  }
  async function connectedResources() {
    const reply = await companion.api.request('/capabilities');
    state.capabilities = reply.capabilities;
    if (companion.allowed('settings')) {
      const settings = await companion.api.request('/settings');
      state.settings = settings.settings;
      state.revision = settings.revision;
    }
    void reportVisibility();
    ui.byId('active-model').textContent = state.settings.model || 'النموذج';
    ui.byId('connection-message').textContent = 'الخادم متصل ومقترن.';
    ui.notice('');
    await refreshSuggestions();
  }
  async function connect() {
    if (connecting) return;
    connecting = true;
    try {
      const response = await global.fetch('/health',{cache:'no-store',credentials:'same-origin'});
      const health = await response.json();
      if (!response.ok || health.service !== 'antigravity-companion' || !health.api_versions?.includes(1)) throw new Error('الخادم غير متوافق مع عقد الواجهة.');
      state.connected = true;
      try { await companion.api.restoreSession(); state.paired = true; }
      catch (error) { if (error.status !== 401 && error.status !== 403) throw error; state.paired = false; }
      if (state.paired) await connectedResources();
      else ui.byId('connection-message').textContent = 'تعذر إنشاء الجلسة المحلية؛ أعد الاتصال بالخادم.';
    } catch (error) {
      state.connected = false;
      state.paired = false;
      ui.byId('connection-message').textContent = 'تعذر الاتصال: ' + error.message;
    } finally { connecting = false; refreshConnection(); }
  }
  function record() {
    return {id:state.savedRecordId || state.sessionId,session_id:state.sessionId,title:state.messages.find(message=>message.role==='user')?.text.slice(0,80) || 'محادثة',messages:state.messages,run_id:state.runId,read_only:true,updated_at:new Date().toISOString()};
  }
  function saveHistory() {
    if (!state.storageReady || !state.sessionId) return Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(record()));
    historyWrites = historyWrites.then(()=>companion.history.save(snapshot)).catch(error=>ui.notice('تعذر حفظ النسخة المحلية: ' + error.message));
    return historyWrites;
  }
  function scheduleHistory() {
    global.clearTimeout(historyTimer);
    historyTimer = global.setTimeout(saveHistory,500);
  }
  async function closeCurrentSession() {
    if (!state.sessionId || !state.connected || !state.paired) return;
    try {
      await companion.api.request('/sessions/' + encodeURIComponent(state.sessionId) + '/close',{method:'POST'});
    } catch (failure) {
      if (!(failure instanceof TypeError)) throw failure;
      state.connected = false;
      refreshConnection();
      ui.notice('انقطع الاتصال؛ تعذر تأكيد غلق الجلسة السابقة. النسخة المحلية متاحة للقراءة.');
    }
  }
  async function newChat() {
    if (companion.runActive()) throw new Error('أوقف الرد الجاري قبل فتح محادثة أخرى.');
    await saveHistory();
    await closeCurrentSession();
    state.sessionId = '';
    pendingSubmission = undefined;
    state.runId = '';
    state.cursor = '';
    state.savedRecordId = '';
    state.messages = [];
    state.offlineRecord = false;
    state.runState = 'idle';
    ui.renderHistory([]);
    ui.byId('run-status').textContent = 'محادثة جديدة.';
    ui.byId('recover-run').hidden = true;
    ui.busyControls();
    ui.byId('prompt').focus();
  }
  async function readRecord(record) {
    await newChat();
    state.messages = record.messages;
    state.offlineRecord = true;
    ui.renderHistory(record.messages);
    const description = record.truncated ? 'سجل تاريخي مقتطع؛ الأصل محفوظ لدى الخادم.' : 'سجل محفوظ للقراءة فقط.';
    ui.byId('run-status').textContent = description + (record.invalid_records > 0 ? ' أسطر غير صالحة لم تُعرض: ' + record.invalid_records + '.' : '');
    ui.busyControls();
    ui.announce('سجل للقراءة فقط؛ لا تُرسل منه طلبات.');
  }
  async function resumeLegacy(conversationId) {
    await newChat();
    const defaults = state.settings;
    const options = {cwd:defaults.cwd || '.',model:defaults.model,agent:defaults.agent,effort:defaults.effort,mode:defaults.mode,sandbox:defaults.sandbox,project:defaults.project,...app.sessionOptions,conversation_id:conversationId};
    state.runState = 'starting';
    ui.busyControls();
    try {
      const session = await companion.api.request('/sessions',{method:'POST',body:options});
      state.sessionId = session.session_id;
      state.savedRecordId = session.session_id;
    } finally { state.runState = 'idle'; ui.busyControls(); }
    ui.byId('run-status').textContent = 'استؤنف المعرف التاريخي؛ اكتب رسالة جديدة لإرسالها.';
    ui.busyControls();
    ui.announce('استؤنف المعرف؛ لم تُعد إرسال الرسائل التاريخية.');
  }
  async function ensureSession() {
    if (state.sessionId) return;
    if (!sessionCreation) {
      const defaults = state.settings;
      const options = {cwd:defaults.cwd || '.', model:defaults.model, agent:defaults.agent, effort:defaults.effort, mode:defaults.mode, sandbox:defaults.sandbox, project:defaults.project, ...app.sessionOptions};
      sessionCreation = companion.api.request('/sessions',{method:'POST',body:options}).then(session=>{
        state.sessionId = session.session_id;
        state.savedRecordId = session.session_id;
      }).finally(()=>{sessionCreation = undefined;});
    }
    await sessionCreation;
  }
  function startAssistant() {
    activeMessage = {role:'assistant',text:'',tools:[]};
    state.messages.push(activeMessage);
    activeNodes = ui.messageNode(activeMessage);
  }
  async function send() {
    const prompt = ui.byId('prompt');
    const message = prompt.value.trim();
    if (!message || ui.byId('send').disabled) return;
    state.runState = 'starting';
    ui.busyControls();
    try {
      await ensureSession();
      if (!pendingSubmission || pendingSubmission.message !== message) pendingSubmission = {message,client_request_id:global.crypto.randomUUID()};
      const accepted = await companion.api.request('/sessions/' + encodeURIComponent(state.sessionId) + '/runs',{method:'POST',body:pendingSubmission});
      pendingSubmission = undefined;
      state.runId = accepted.run_id;
      state.cursor = '';
      const userMessage = {role:'user',text:message,tools:[]};
      state.messages.push(userMessage);
      ui.messageNode(userMessage);
      prompt.value = '';
      startAssistant();
      state.runState = 'running';
      ui.byId('run-status').textContent = 'الرد جارٍ.';
      ui.busyControls();
      await saveHistory();
      await followRun();
    } catch (error) {
      if (state.runState === 'starting') state.runState = 'idle';
      ui.notice(error.message + (state.runId ? ' استعد حالة الرد قبل إرسال طلب آخر.' : ' بقي نصك في الحقل؛ افحص حالة الخادم قبل إعادة الإرسال.'));
      ui.byId('recover-run').hidden = !state.runId;
      ui.busyControls();
    }
  }
  function streamEvent(event) {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object' || payload.run_id && payload.run_id !== state.runId) throw new Error('وصل حدث بث لا يطابق الدور.');
    if (event.id) state.cursor = event.id;
    if (event.event === 'delta') {
      if (typeof payload.text_delta !== 'string') throw new Error('جزء الرد ليس نصاً.');
      activeMessage.text += payload.text_delta;
      activeNodes.content.textContent = activeMessage.text;
      scheduleHistory();
    }
    if (event.event === 'tool') toolEvent(payload);
    if (event.event === 'state') {
      state.runState = payload.state;
      ui.byId('run-status').textContent = 'حالة الرد: ' + payload.state;
      ui.busyControls();
    }
    if (event.event === 'error') ui.notice(String(payload.message || payload.error || 'تعذر تنفيذ الدور.'));
    if (event.event === 'result') finishRun(payload);
    if (event.event === 'replay_unavailable') {
      ui.byId('recover-run').hidden = false;
      ui.notice('لم يعد كامل البث محفوظاً؛ استعد حالة الرد لقراءة نتيجته.');
    }
  }
  function toolEvent(payload) {
    const description = 'أداة: ' + String(payload.name || payload.tool_name || payload.tool || 'غير مسماة') + (payload.state ? ' — ' + payload.state : '');
    activeMessage.tools.push(description);
    activeNodes.tools.textContent = activeMessage.tools.join('\n');
    activeNodes.tools.hidden = false;
    scheduleHistory();
  }
  function finishRun(payload) {
    state.runState = payload.state || 'completed';
    if (typeof payload.response === 'string') activeMessage.text = payload.response;
    ui.markdown(activeNodes.content,activeMessage.text);
    ui.byId('run-status').textContent = 'حالة الرد: ' + state.runState;
    ui.byId('recover-run').hidden = true;
    ui.busyControls();
    ui.announce(state.runState === 'completed' ? 'اكتمل رد المساعد؛ النص في المحادثة.' : 'انتهى الرد: ' + state.runState);
    completionFeedback();
    void saveHistory();
  }
  async function reportVisibility() {
    if (!state.paired || !state.connected) return;
    try { await companion.api.request('/client/visibility',{method:'POST',body:{client_id:visibilityClientId,visible:!document.hidden && nativeVisible}}); }
    catch { /* The next visibility change or reconnection retries this state only. */ }
  }
  function completionFeedback() {
    const feedback = companion.feedbackPolicy(state.runId,state.runState,!document.hidden && nativeVisible,state.settings,feedbackSeen);
    if (feedback.vibration && global.navigator.vibrate) global.navigator.vibrate(40);
    if (!feedback.sound) return;
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.025;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
    oscillator.onended = () => { void context.close(); };
  }
  async function followRun() {
    if (streamController) streamController.abort();
    streamController = new AbortController();
    await companion.api.events(state.runId,{signal:streamController.signal,cursor:state.cursor,onEvent:streamEvent});
    if (!terminalStates.includes(state.runState)) {
      ui.byId('recover-run').hidden = false;
      ui.notice('انقطع البث؛ لا يعاد إرسال الرسالة. استعد حالة الرد.');
    }
  }
  async function recover() {
    const snapshot = await companion.api.request('/runs/' + encodeURIComponent(state.runId));
    state.runState = snapshot.state;
    if (terminalStates.includes(snapshot.state)) { finishRun(snapshot); return; }
    ui.byId('run-status').textContent = 'حالة الرد: ' + snapshot.state;
    ui.busyControls();
    await followRun();
  }
  async function cancel() {
    const cancelled = await companion.api.request('/runs/' + encodeURIComponent(state.runId) + '/cancel',{method:'POST',body:{}});
    state.runState = cancelled.state || 'cancelling';
    ui.byId('run-status').textContent = 'طلب الإيقاف؛ حالة الرد: ' + state.runState;
    ui.busyControls();
    if (terminalStates.includes(state.runState)) finishRun(cancelled);
  }
  async function resume(sessionId) {
    if (companion.runActive()) throw new Error('أوقف الرد الجاري قبل الاستئناف.');
    const session = await companion.api.request('/sessions/' + encodeURIComponent(sessionId));
    state.sessionId = session.session_id;
    state.savedRecordId = session.session_id;
    state.offlineRecord = false;
    state.messages = [];
    for (const run of session.runs) {
      state.messages.push({role:'user',text:run.message,tools:[]});
      state.messages.push({role:'assistant',text:run.response || '',tools:[]});
    }
    const last = session.runs.at(-1);
    state.runId = last?.run_id || '';
    state.runState = last?.state || 'idle';
    ui.renderHistory(state.messages);
    activeMessage = state.messages.at(-1);
    const lastArticle = ui.byId('messages').lastElementChild;
    if (lastArticle) activeNodes = {article:lastArticle,content:lastArticle.querySelector('.message-content'),tools:lastArticle.querySelector('.message-tools')};
    if (!terminalStates.includes(state.runState) && state.runId) {
      activeMessage.text = '';
      activeNodes.content.textContent = '';
      activeNodes.content.classList.remove('rendered');
      state.cursor = '';
      void followRun().catch(error=>ui.notice(error.message));
    }
    ui.busyControls();
    await saveHistory();
  }
  function exportChat() {
    const download = ui.element('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(record(),null,2)],{type:'application/json;charset=utf-8'}));
    download.href = url;
    download.download = 'antigravity-conversation.json';
    download.click();
    global.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function suggestionCwd() { return app.sessionOptions.cwd || state.settings.cwd || '.'; }
  async function refreshSuggestions() {
    const requestId = ++catalogRequest;
    const cwd = suggestionCwd();
    const current = () => requestId === catalogRequest && cwd === suggestionCwd();
    await Promise.all(['commands','skills','mcp'].map(async id => {
      if (!companion.allowed(id)) {
        suggestionSources.set(id,{entries:[],reason:companion.capability(id)?.reason || 'مصدر غير متاح دون اتصال مقترن.'});
        return;
      }
      try {
        suggestionSources.set(id,{entries:[],reason:'القائمة قيد الجلب.'});
        const reply = await companion.api.request('/' + id + '?cwd=' + encodeURIComponent(cwd));
        if (!current()) return;
        const rows = reply[id === 'mcp' ? 'servers' : id];
        if (!Array.isArray(rows)) throw new Error('قائمة CLI غير صالحة.');
        const entries = rows.filter(row=>row && row.enabled !== false).map(row=>{
          const name = row.cmd || row.id || row.name;
          if (typeof name !== 'string' || !name.trim() || /\s/.test(name)) return null;
          const prefix = id === 'mcp' ? '@' : '/';
          return {id:prefix + name.replace(/^[/@]/,''),name:row.name || row.description || row.desc || name};
        }).filter(Boolean);
        suggestionSources.set(id,{entries,reason:''});
      } catch (error) { if (current()) suggestionSources.set(id,{entries:[],reason:error.message}); }
    }));
    if (current() && !ui.byId('suggestions').hidden) void suggestions();
  }
  function suggestionContext() {
    const prompt = ui.byId('prompt');
    const before = prompt.value.slice(0,prompt.selectionStart);
    const match = /(?:^|\s)([/@])(?:"([^"\n]*)"?|([^\s"]*))$/.exec(before);
    if (!match) return undefined;
    const token = match[2] ?? match[3];
    return {prefix:match[1],token,cwd:suggestionCwd(),start:match.index + match[0].indexOf(match[1]),end:prompt.selectionStart};
  }
  function positionSuggestions() {
    const popup = ui.byId('suggestions');
    if (popup.hidden) return;
    const prompt = ui.byId('prompt').getBoundingClientRect();
    const viewport = global.visualViewport;
    const top = viewport?.offsetTop || 0;
    const bottom = top + (viewport?.height || global.innerHeight);
    const width = viewport?.width || global.innerWidth;
    const left = viewport?.offsetLeft || 0;
    const above = Math.max(0,prompt.top - top - 8);
    const below = Math.max(0,bottom - prompt.bottom - 8);
    const upwards = above >= below;
    const height = Math.min(280,upwards ? above : below);
    popup.style.maxHeight = height + 'px';
    popup.style.width = Math.min(prompt.width,Math.max(0,width - 16)) + 'px';
    popup.style.left = Math.max(left + 8,Math.min(prompt.left,left + width - popup.offsetWidth - 8)) + 'px';
    popup.style.top = (upwards ? Math.max(top + 8,prompt.top - popup.offsetHeight - 4) : prompt.bottom + 4) + 'px';
  }
  function insertSuggestion(entry, context) {
    const prompt = ui.byId('prompt');
    const current = suggestionContext();
    if (!current || current.cwd !== context.cwd || current.start !== context.start || current.token !== context.token || current.prefix !== context.prefix) return;
    prompt.setRangeText(entry.action ? '' : entry.id + (entry.directory ? '' : ' '),context.start,context.end,'end');
    ui.byId('suggestions').hidden = true;
    suggestionRequest++;
    if (entry.action) return entry.action();
    prompt.focus();
    if (entry.directory) void suggestions();
  }
  function appendSuggestions(entries, context) {
    const popup = ui.byId('suggestions');
    const seen = new Set([...popup.querySelectorAll('button[data-suggestion]')].map(button=>button.dataset.suggestion));
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const button = ui.button(entry.name,()=>insertSuggestion(entry,context));
      button.dataset.suggestion = entry.id;
      popup.append(button);
    }
  }
  async function fileSuggestions(context, requestId) {
    const popup = ui.byId('suggestions');
    if (!companion.allowed('files')) {
      popup.append(ui.element('p',companion.capability('files')?.reason || 'الملفات غير متاحة دون اتصال مقترن.'));
      return;
    }
    const normalized = context.token.replace(/\\/g,'/');
    const slash = normalized.lastIndexOf('/');
    const directory = normalized.slice(0,slash + 1);
    const query = normalized.slice(slash + 1).toLowerCase();
    const loading = ui.element('p','جلب ملفات مجلد العمل…');
    popup.append(loading);
    try {
      const route = '/files?path=' + encodeURIComponent(context.cwd.replace(/[\\/]$/,'') + '/' + directory);
      const reply = await companion.api.request(route);
      if (!Array.isArray(reply.entries)) throw new Error('قائمة الملفات غير صالحة.');
      if (!currentSuggestionRequest(context,requestId)) return;
      loading.remove();
      const entries = reply.entries.filter(entry=>typeof entry?.name === 'string' && !/["\n\r]/.test(entry.name) && entry.name.toLowerCase().includes(query)).map(entry=>{
        const path = directory + entry.name + (entry.is_dir ? '/' : '');
        const quoted = /\s/.test(path);
        return {id:'@' + (quoted ? '"' + path + (entry.is_dir ? '' : '"') : path),name:(entry.is_dir ? 'مجلد: ' : 'ملف: ') + directory + entry.name,directory:entry.is_dir};
      });
      appendSuggestions(entries,context);
      if (!entries.length) popup.append(ui.element('p','لا ملفات مطابقة في هذا المجلد.'));
    } catch (error) {
      if (!currentSuggestionRequest(context,requestId)) return;
      loading.textContent = 'تعذر جلب الملفات: ' + error.message;
    }
    positionSuggestions();
  }
  function currentSuggestionRequest(context, requestId) {
    const current = suggestionContext();
    return requestId === suggestionRequest && !ui.byId('suggestions').hidden && current?.cwd === context.cwd && current?.token === context.token && current?.start === context.start;
  }
  async function suggestions() {
    const context = suggestionContext();
    const requestId = ++suggestionRequest;
    const popup = ui.byId('suggestions');
    const wasHidden = popup.hidden;
    popup.replaceChildren();
    popup.hidden = !context;
    if (!context) return;
    if (wasHidden) ui.announce('ظهرت قائمة اقتراحات الكتابة؛ السهم الأسفل للدخول، وEscape للإغلاق.');
    const commands = [{id:'/new',name:'محادثة جديدة',action:newChat},{id:'/files',name:'ملفات',action:()=>companion.panels.open('files')},{id:'/settings',name:'الإعدادات',action:()=>companion.panels.open('settings')}];
    const sources = context.prefix === '/' ? ['commands'] : ['mcp'];
    const entries = context.prefix === '/' ? [...commands] : [];
    for (const id of sources) {
      const source = suggestionSources.get(id);
      if (!companion.allowed(id)) popup.append(ui.element('p', companion.capability(id)?.reason || 'مصدر ' + id + ' غير متاح دون اتصال مقترن.'));
      else if (!source || source.reason) popup.append(ui.element('p', 'تعذر جلب ' + id + ': ' + (source?.reason || 'القائمة لم تُحمّل بعد.')));
      else entries.push(...source.entries);
    }
    appendSuggestions(entries.filter(entry=>entry.id.toLowerCase().includes(context.token.toLowerCase())),context);
    popup.append(ui.button('إغلاق الاقتراحات',()=>{suggestionRequest++;popup.hidden=true;ui.byId('prompt').focus();}));
    positionSuggestions();
    if (context.prefix === '@') await fileSuggestions(context,requestId);
  }
  function keyboard(event) {
    if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); ui.byId('chat-form').requestSubmit(); }
    if (event.key === 'Escape') ui.byId('suggestions').hidden = true;
    if (event.key === 'ArrowDown' && !ui.byId('suggestions').hidden) { event.preventDefault(); ui.byId('suggestions').querySelector('button')?.focus(); }
  }
  async function startVoiceAgent(text, requestId) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('أمر الهاتف فارغ.');
    const voiceRequestId = requestId || global.crypto.randomUUID();
    app.pendingVoiceRequestId = voiceRequestId;
    await ensureSession();
    const reply = await companion.api.request('/voice/runs',{method:'POST',body:{session_id:state.sessionId,text,request_id:voiceRequestId}});
    app.voiceRunId = reply.voice_id; app.voiceText = text; app.pendingVoiceRequestId = undefined; return reply;
  }
  async function voice() {
    ui.byId('voice-start').disabled = true;
    ui.byId('voice-cancel').hidden = false;
    try {
      const reply = await companion.native.request('start_voice');
      if (typeof reply.text === 'string') { ui.insertPrompt(reply.text); ui.announce('أضيف النص المملى إلى الرسالة؛ لم يُرسل.'); }
    } finally { ui.byId('voice-start').disabled = false; ui.byId('voice-cancel').hidden = true; }
  }
  function bindAction(id, action) { ui.byId(id).addEventListener('click',()=>Promise.resolve().then(action).catch(error=>ui.notice(error.message))); }
  function bind() {
    ui.setupDialogs();
    bindAction('menu-open',()=>ui.showDialog(ui.byId('menu-dialog')));
    bindAction('reconnect',connect);
    bindAction('start-server',async()=>{await companion.native.request('start_server');await connect();});
    bindAction('new-chat',newChat);
    bindAction('cancel-run',cancel);
    bindAction('recover-run',recover);
    bindAction('export-chat',exportChat);
    bindAction('clear-chat',async()=>{await newChat();ui.closeDialog(ui.byId('menu-dialog'));});
    bindAction('voice-start',voice);
    bindAction('voice-cancel',()=>companion.native.request('cancel_voice'));
    ui.byId('voice-start').disabled = !companion.native.available();
    ui.byId('voice-start').title = companion.native.available() ? 'إملاء الرسالة دون إرسال' : 'الإملاء يحتاج تطبيق Android';
    for (const control of document.querySelectorAll('[data-panel]')) control.addEventListener('click',()=>void companion.panels.open(control.dataset.panel));
    document.addEventListener('visibilitychange',()=>void reportVisibility());
    global.addEventListener('companion-native-visibility',event=>{
      if (typeof event.detail?.visible === 'boolean') {nativeVisible=event.detail.visible;void reportVisibility();}
    });
    ui.byId('chat-form').addEventListener('submit',event=>{event.preventDefault();void send();});
    ui.byId('prompt').addEventListener('keydown',keyboard);
    ui.byId('prompt').addEventListener('input',()=>void suggestions());
    global.addEventListener('resize',positionSuggestions);
    document.addEventListener('scroll',positionSuggestions,true);
    global.visualViewport?.addEventListener('resize',positionSuggestions);
    global.visualViewport?.addEventListener('scroll',positionSuggestions);
    ui.byId('suggestions').addEventListener('keydown',event=>{
      const controls = [...event.currentTarget.querySelectorAll('button')];
      const index = controls.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.currentTarget.hidden=true;ui.byId('prompt').focus(); }
      if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault();controls[(index + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length]?.focus(); }
    });

  }
  async function initialize() {
    bind();
    try { await companion.history.open(); state.storageReady=true; }
    catch (error) { ui.notice('التخزين المحلي غير متاح: ' + error.message); }
    await connect();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error=>ui.notice('تعذر تهيئة القراءة دون اتصال: ' + error.message));
  }
  document.addEventListener('alpine:init',()=>{
    global.Alpine.data('companion',()=>({connectionLabel:connectionLabel(),init(){void initialize();}}));
  });
  global.addEventListener('companion-voice-input',event=>{
    if (typeof event.detail?.text !== 'string') return;
    if (event.detail.mode === 'agent') {
      void startVoiceAgent(event.detail.text,event.detail.task_id).then(()=>companion.panels.open('voice')).catch(error=>ui.notice(error.message));
    } else {ui.insertPrompt(event.detail.text);ui.announce('أضيف النص المملى؛ لم يُرسل.');}
  });
  global.addEventListener('companion-native-progress',event=>{
    const progress = ui.byId('update-progress');
    const detail = event.detail;
    if (!progress || typeof detail?.percent !== 'number') return;
    progress.hidden = false;
    if (detail.percent < 0) { progress.removeAttribute('value'); return; }
    progress.value = Math.max(0,Math.min(100,detail.percent));
    const milestone = Math.floor(progress.value / 25) * 25;
    if (milestone > (updateMilestones.get(detail.request_id) || 0)) {
      updateMilestones.set(detail.request_id,milestone);
      ui.announce('بلغ تنزيل التطبيق ' + milestone + ' بالمئة.');
    }
  });
  app.ensureSession = ensureSession;
  app.startVoiceAgent = startVoiceAgent;
  app.refreshSuggestions = refreshSuggestions;
  app.newChat = newChat;
  app.resume = resume;
  app.readRecord = readRecord;
  app.resumeLegacy = resumeLegacy;
  companion.app = app;
})(window);
