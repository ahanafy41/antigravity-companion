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
  let suggestionRange;
  const suggestionSources = new Map();
  const updateMilestones = new Map();
  const feedbackSeen = new Set();
  const visibilityClientId = global.crypto.randomUUID();
  let nativeVisible = true;
  const terminalStates = ['completed','cancelled','failed','interrupted'];
  function connectionLabel() { return state.connected ? (state.paired ? 'متصل ومقترن' : 'يلزم الاقتران') : 'غير متصل'; }
  function refreshConnection() {
    if (global.Alpine) global.Alpine.$data(document.body).connectionLabel = connectionLabel();
    ui.byId('connection-section').hidden = state.connected && state.paired;
    ui.byId('pair-form').hidden = !state.connected || state.paired;
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
      else ui.byId('connection-message').textContent = 'أدخل رمز الاقتران الذي يعرضه الخادم.';
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
  async function refreshSuggestions() {
    await Promise.all(['commands','skills','mcp'].map(async id => {
      if (!companion.allowed(id)) {
        suggestionSources.set(id,{entries:[],reason:companion.capability(id)?.reason || 'مصدر غير متاح دون اتصال مقترن.'});
        return;
      }
      try {
        const cwd = app.sessionOptions.cwd || state.settings.cwd || '.';
        const reply = await companion.api.request('/' + id + '?cwd=' + encodeURIComponent(cwd));
        const rows = reply[id === 'mcp' ? 'servers' : id];
        if (!Array.isArray(rows)) throw new Error('قائمة CLI غير صالحة.');
        const entries = rows.filter(row=>row && row.enabled !== false).map(row=>{
          const name = row.cmd || row.id || row.name;
          if (typeof name !== 'string' || !name.trim() || /\s/.test(name)) return null;
          const prefix = id === 'mcp' ? '@' : '/';
          return {id:prefix + name.replace(/^[/@]/,''),name:row.name || row.description || row.desc || name};
        }).filter(Boolean);
        suggestionSources.set(id,{entries,reason:''});
      } catch (error) { suggestionSources.set(id,{entries:[],reason:error.message}); }
    }));
    if (!ui.byId('suggestions').hidden) suggestions();
  }
  function suggestions() {
    const prompt = ui.byId('prompt');
    const match = /(?:^|\s)([/@])([^\s]*)$/.exec(prompt.value.slice(0,prompt.selectionStart));
    const popup = ui.byId('suggestions');
    const wasHidden = popup.hidden;
    popup.replaceChildren();
    popup.hidden = !match;
    if (!match) return;
    if (wasHidden) ui.announce('ظهرت قائمة اقتراحات الكتابة؛ السهم الأسفل للدخول، وEscape للإغلاق.');
    suggestionRange = {start:prompt.selectionStart - match[2].length - 1,end:prompt.selectionStart};
    const commands = [{id:'/new',name:'محادثة جديدة',action:newChat},{id:'/files',name:'ملفات',action:()=>companion.panels.open('files')},{id:'/settings',name:'الإعدادات',action:()=>companion.panels.open('settings')}];
    const sources = match[1] === '/' ? ['commands','skills'] : ['mcp'];
    const entries = match[1] === '/' ? [...commands] : [];
    for (const id of sources) {
      const source = suggestionSources.get(id);
      if (!companion.allowed(id)) popup.append(ui.element('p', companion.capability(id)?.reason || 'مصدر ' + id + ' غير متاح دون اتصال مقترن.'));
      else if (!source || source.reason) popup.append(ui.element('p', 'تعذر جلب ' + id + ': ' + (source?.reason || 'القائمة لم تُحمّل بعد.')));
      else entries.push(...source.entries);
    }
    const seen = new Set();
    for (const entry of entries.filter(entry=>{if (!entry.id.toLowerCase().includes(match[2].toLowerCase()) || seen.has(entry.id)) return false; seen.add(entry.id); return true;})) popup.append(ui.button(entry.name,async()=>{
      prompt.setRangeText(entry.action ? '' : entry.id + ' ',suggestionRange.start,suggestionRange.end,'end');
      popup.hidden = true;
      if (entry.action) await entry.action();
      else prompt.focus();
    }));
    popup.append(ui.button('إغلاق الاقتراحات',()=>{popup.hidden=true;prompt.focus();}));
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
    ui.byId('prompt').addEventListener('input',suggestions);
    ui.byId('suggestions').addEventListener('keydown',event=>{
      const controls = [...event.currentTarget.querySelectorAll('button')];
      const index = controls.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.currentTarget.hidden=true;ui.byId('prompt').focus(); }
      if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault();controls[(index + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length]?.focus(); }
    });
    ui.byId('pair-form').addEventListener('submit',event=>{
      event.preventDefault();
      void companion.api.pair(ui.byId('pair-code').value.trim()).then(()=>{ui.byId('pair-code').value='';return connect();}).catch(error=>ui.notice(error.message));
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
