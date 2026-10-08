(function (global) {
  'use strict';
  const companion = global.Companion;
  const ui = companion.ui;
  const state = companion.state;
  const titles = {engine:'المحرك المستقل والمزودون', models:'النموذج والتفكير', agents:'فريق الوكلاء', settings:'الإعدادات والأمان', auth:'حساب agy', mcp:'بروتوكولات MCP', files:'ملفات المشروع', quota:'استهلاك النماذج', plugins:'الإضافات', skills:'المهارات', tasks:'المهام والمؤقتات', device:'التحكم بالهاتف', history:'المحادثات السابقة', updates:'إصدار التطبيق'};
  function unsupported(id) {
    const capability = companion.capability(id);
    return capability?.reason || (state.connected ? 'هذه الوظيفة غير متاحة في عقد الخادم الحالي.' : 'تحتاج هذه الوظيفة اتصالاً بالخادم.');
  }
  function selectField(parent, label, entries, selected) {
    const field = ui.input(parent, label, {tag:'select'});
    for (const entry of entries) {
      const option = ui.element('option', entry.name || entry.id);
      option.value = entry.id;
      field.append(option);
    }
    field.value = selected || entries[0]?.id || '';
    return field;
  }
  async function modelsPanel(parent) {
    const reply = await companion.api.request('/models');
    state.models = reply.models;
    const model = selectField(parent, 'النموذج', state.models, companion.app.sessionOptions.model ?? state.settings.model);
    const cwd = ui.input(parent, 'مجلد العمل', {value:companion.app.sessionOptions.cwd ?? state.settings.cwd ?? '.'});
    const effort = selectField(parent, 'درجة التفكير', [], '');
    const explanation = ui.element('p');
    parent.append(explanation);
    function updateEffort() {
      effort.replaceChildren();
      const choices = state.models.find(entry => entry.id === model.value)?.efforts || [];
      for (const id of choices) { const option = ui.element('option', id); option.value = id; effort.append(option); }
      const selectedEffort = companion.app.sessionOptions.effort ?? state.settings.effort;
      if (choices.includes(selectedEffort)) effort.value = selectedEffort;
      effort.disabled = !choices.length;
      explanation.textContent = choices.length ? 'يبدأ تغيير النموذج أو المجلد محادثة جديدة.' : 'لم يثبت الخادم درجات التفكير لهذا النموذج؛ يتولى agy اختيار درجته.';
    }
    model.addEventListener('change', updateEffort);
    updateEffort();
    parent.append(ui.button('اعتماد الاختيار لمحادثة جديدة', async () => {
      await companion.app.newChat();
      companion.app.sessionOptions = {...companion.app.sessionOptions, model:model.value, cwd:cwd.value.trim(), effort:effort.disabled ? undefined : effort.value};
      ui.byId('active-model').textContent = model.options[model.selectedIndex]?.text || 'النموذج';
      ui.closeDialog(ui.byId('panel-dialog'));
    }, 'primary'));
  }
  async function agentsPanel(parent) {
    const reply = await companion.api.request('/agents');
    state.agents = reply.agents;
    if (!state.agents.length) { parent.append(ui.element('p', 'لم يعلن CLI وكلاء متاحين.')); return; }
    const agent = selectField(parent, 'الوكيل', state.agents, companion.app.sessionOptions.agent ?? state.settings.agent);
    parent.append(ui.button('اختيار الوكيل لمحادثة جديدة', async () => {
      await companion.app.newChat();
      companion.app.sessionOptions = {...companion.app.sessionOptions, agent:agent.value};
      ui.closeDialog(ui.byId('panel-dialog'));
    }, 'primary'));
  }
  async function settingsPanel(parent) {
    const reply = await companion.api.request('/settings');
    state.settings = reply.settings;
    state.revision = reply.revision;
    parent.append(ui.element('p', 'مسودة محلية حتى الحفظ. الإغلاق يلغي المسودة؛ لا تستبدل القيم السرية المحجوبة. تبقى المفاتيح المجهولة.'));
    parent.append(ui.element('p', 'أذونات agy وإعدادات أمانه تُدار في Termux؛ هذه الصفحة تحفظ إعدادات Companion فقط وترفض تغيير مفاتيح سياسة CLI.'));
    const editor = ui.input(parent, 'الإعدادات JSON', {tag:'textarea', value:JSON.stringify(reply.settings,null,2), className:'json-editor'});
    const actions = ui.element('div', undefined, 'panel-actions');
    actions.append(ui.button('حفظ الإعدادات', async () => {
      const draft = JSON.parse(editor.value);
      if (!draft || Array.isArray(draft) || typeof draft !== 'object') throw new Error('يلزم كائن JSON للإعدادات.');
      const saved = await companion.api.request('/settings', {method:'PATCH', headers:{'If-Match':String(state.revision)}, body:{settings:draft,revision:state.revision}});
      state.settings = saved.settings;
      state.revision = saved.revision;
      ui.announce('حُفظت الإعدادات.');
      ui.closeDialog(ui.byId('panel-dialog'));
    }, 'primary'), ui.button('إلغاء المسودة', () => ui.closeDialog(ui.byId('panel-dialog'))));
    parent.append(actions);
  }
  async function authPanel(parent) {
    const status = await companion.api.request('/auth/status');
    parent.append(ui.element('p', status.reason || 'يتولى agy المصادقة في Termux.'));
    if (status.authenticated !== null && status.authenticated !== undefined) parent.append(ui.element('p', status.authenticated ? 'الحساب مسجل الدخول.' : 'الحساب غير مسجل الدخول.'));
    parent.append(ui.element('p', 'نفّذ agy auth في Termux عند الحاجة؛ لا تجمع هذه الصفحة رمز حساب Google أو تستحدث جلسة PTY.'));
  }
  async function filesPanel(parent) {
    const path = ui.input(parent, 'مسار الملف أو المجلد داخل مجلد المشروع', {value:companion.app.sessionOptions.cwd || state.settings.cwd || '.'});
    const listing = ui.element('div');
    parent.append(ui.button('فتح المجلد', () => listFiles(path.value, listing)), listing);
    await listFiles(path.value, listing);
  }
  async function listFiles(path, parent) {
    const reply = await companion.api.request('/files?path=' + encodeURIComponent(path));
    parent.replaceChildren(ui.element('p', reply.path));
    for (const entry of reply.entries) {
      const row = ui.element('div', undefined, 'panel-row');
      row.append(ui.button((entry.is_dir ? 'مجلد: ' : 'ملف: ') + entry.name, () => entry.is_dir ? listFiles(entry.path,parent) : viewFile(entry.path,parent)));
      parent.append(row);
    }
    if (!reply.entries.length) parent.append(ui.element('p','المجلد خالٍ.'));
    const directory = ui.input(parent, 'مسار مجلد جديد');
    parent.append(ui.button('إنشاء المجلد', async () => {
      await companion.api.request('/directories', {method:'POST',body:{path:directory.value.trim()}});
      await listFiles(path,parent);
    }));
  }
  async function viewFile(path, parent) {
    const reply = await companion.api.request('/file?path=' + encodeURIComponent(path));
    const preview = ui.element('pre',reply.content,'file-preview');
    preview.tabIndex = 0;
    preview.setAttribute('aria-label','محتوى الملف ' + reply.path);
    parent.replaceChildren(ui.element('h3',reply.path),preview,ui.button('إدراج مسار الملف في الرسالة',()=>ui.insertPrompt('@' + reply.path + ' ')));
  }
  function jsonObject(field, label) {
    const parsed = JSON.parse(field.value || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(label + ': يلزم كائن JSON.');
    return parsed;
  }
  async function mcpPanel(parent) {
    const reply = await companion.api.request('/mcp');
    for (const server of reply.servers) {
      const row = ui.element('section', undefined, 'panel-row');
      row.append(ui.element('h3',server.name),ui.element('p',server.enabled === false ? 'معطّل' : 'مفعّل'));
      row.append(ui.button(server.enabled === false ? 'تمكين ' + server.name : 'تعطيل ' + server.name, async () => {
        await companion.api.request('/mcp/' + encodeURIComponent(server.name) + (server.enabled === false ? '/enable' : '/disable'), {method:'POST',body:{}});
        await companion.app.refreshSuggestions();
        await open('mcp');
      }));
      row.append(ui.button('حذف ' + server.name, async () => {
        if (!global.confirm('حذف خادم MCP ' + server.name + '؟')) return;
        await companion.api.request('/mcp/' + encodeURIComponent(server.name), {method:'DELETE'});
        await companion.app.refreshSuggestions();
        await open('mcp');
      }, 'danger'));
      parent.append(row);
    }
    if (!reply.servers.length) parent.append(ui.element('p','لم يعلن CLI خوادم MCP.'));
    parent.append(ui.element('p','مصادقة MCP واختبار اتصاله غير متاحين في عقد هذه الصفحة؛ لا تُجمع رموز OAuth هنا.'));
    await mcpForm(parent);
  }
  async function mcpForm(parent) {
    parent.append(ui.element('h3','إضافة MCP'));
    const name = ui.input(parent,'اسم الخادم');
    const type = selectField(parent,'نوع النقل',[{id:'stdio'},{id:'http'}],'stdio');
    const address = ui.input(parent,'الأمر أو رابط الخادم');
    const args = ui.input(parent,'وسائط الأمر JSON array',{value:'[]'});
    const env = ui.input(parent,'قيم البيئة JSON object',{tag:'textarea',value:'{}',secret:true});
    const headers = ui.input(parent,'رؤوس HTTP JSON object',{tag:'textarea',value:'{}',secret:true});
    parent.append(ui.button('إضافة الخادم', async () => {
      const argumentsList = JSON.parse(args.value);
      if (!Array.isArray(argumentsList) || argumentsList.some(argument=>typeof argument !== 'string')) throw new Error('الوسائط قائمة JSON من النصوص.');
      await companion.api.request('/mcp', {method:'POST',body:{name:name.value.trim(),type:type.value,commandOrUrl:address.value.trim(),args:argumentsList,env:jsonObject(env,'البيئة'),headers:jsonObject(headers,'الرؤوس')}});
      await companion.app.refreshSuggestions();
      await open('mcp');
    },'primary'));
  }
  async function historyPanel(parent) {
    parent.append(ui.element('p', 'النسخ المحلية للقراءة فقط. لا تُحذف بيانات localStorage القديمة.'));
    if (state.storageReady) {
      for (const record of await companion.history.list()) {
        parent.append(ui.button('قراءة: ' + record.title, async () => {
          await companion.app.readRecord(record);
          ui.closeDialog(ui.byId('panel-dialog'));
        }));
      }
    }
    if (!companion.allowed('chat')) return;
    await legacyHistoryPanel(parent);
    const reply = await companion.api.request('/sessions');
    parent.append(ui.element('h3','جلسات الخادم'));
    for (const session of reply.sessions) parent.append(ui.button('استئناف: ' + (session.title || session.cwd || session.session_id), async () => {
      await companion.app.resume(session.session_id);
      ui.closeDialog(ui.byId('panel-dialog'));
    }));
  }
  function archiveMessages(records) {
    return records.map(record=> record && record.type === 'USER_INPUT' && typeof record.content === 'string'
      ? {role:'user',text:record.content,tools:[]}
      : {role:'archive',text:JSON.stringify(record,null,2),tools:[]});
  }
  async function legacyHistoryPanel(parent) {
    const reply = await companion.api.request('/legacy/conversations');
    parent.append(ui.element('h3','التاريخ الأصلي لدى الخادم'),ui.element('p','قراءة التاريخ تحفظ نسخة محلية دون مسح الأصل. استئناف المعرف اختيار مستقل؛ لا يُعاد إرسال سجل قديم.'));
    for (const conversation of reply.conversations) {
      const title = conversation.title || conversation.conversation_id;
      const row = ui.element('section',undefined,'panel-row');
      row.append(ui.button('قراءة وحفظ نسخة: ' + title,()=>readLegacy(conversation)));
      row.append(ui.button('استئناف المعرف: ' + title,async()=>{
        await companion.app.resumeLegacy(conversation.conversation_id);
        ui.closeDialog(ui.byId('panel-dialog'));
      }));
      parent.append(row);
    }
    if (!reply.conversations.length) parent.append(ui.element('p','لا سجل تاريخياً لدى الخادم.'));
  }
  async function readLegacy(conversation) {
    if (companion.runActive()) throw new Error('أوقف الرد الجاري قبل تبديل العرض.');
    const reply = await companion.api.request('/legacy/conversations/' + encodeURIComponent(conversation.conversation_id));
    if (!Array.isArray(reply.records)) throw new Error('صيغة السجل التاريخي غير صالحة.');
    const record = {id:'legacy-server:' + reply.conversation_id,title:conversation.title || reply.conversation_id,conversation_id:reply.conversation_id,records:reply.records,truncated:reply.truncated === true,invalid_records:Number.isInteger(reply.invalid_records) ? reply.invalid_records : 0,messages:archiveMessages(reply.records),read_only:true};
    if (state.storageReady) await companion.history.save(record);
    await companion.app.readRecord(record);
    ui.closeDialog(ui.byId('panel-dialog'));
    if (!state.storageReady) ui.notice('قُرئ السجل؛ تعذر حفظ نسخة محلية لغياب IndexedDB.');
  }
  async function updatesPanel(parent) {
    if (!companion.native.available()) { parent.append(ui.element('p','فحص APK وتثبيته متاحان في تطبيق Android.')); return; }
    const version = await companion.native.request('get_app_version');
    parent.append(ui.element('p', 'الإصدار المركب: ' + (version.version_name || version.version || JSON.stringify(version))));
    const status = ui.element('p');
    const progress = ui.element('progress');
    progress.id = 'update-progress';
    progress.max = 100;
    progress.hidden = true;
    progress.setAttribute('aria-label','تقدم تنزيل التطبيق');
    parent.append(progress, ui.button('إلغاء التنزيل',()=>companion.native.request('download_update',{cancel:true})), status,ui.button('فحص إصدار أحدث', async () => {
      const reply = await companion.native.request('check_update');
      status.textContent = JSON.stringify(reply,null,2);
      const available = reply.hasUpdate === true;
      if (available) parent.append(ui.button('تنزيل الإصدار المفحوص', async () => {
        const download = await companion.native.request('download_update');
        status.textContent = JSON.stringify(download,null,2);
      }));
    }),ui.button('فتح إذن تثبيت الحزم',()=>companion.native.request('open_install_permission')));
  }
  async function quotaPanel(parent) {
    parent.append(ui.element('p', companion.capability('quota')?.reason || 'حصص حساب agy غير متاحة؛ القياسات أدناه تخص الخادم المحلي.'));
    const sources = [];
    if (companion.allowed('quota')) await accountQuota(parent);
    if (companion.allowed('cli-update')) await cliUpdate(parent);
    if (state.connected && state.paired) {
      sources.push({title:'استهلاك الخادم المحلي',read:()=>companion.api.request('/system/usage')});
      sources.push({title:'Doctor للخادم: التهيئة فقط، دون إثبات تسجيل الحساب',read:()=>companion.api.request('/doctor')});
    } else parent.append(ui.element('p','قياسات الخادم وDoctor تحتاج اتصالاً مقترناً.'));
    if (companion.native.available()) sources.push({title:'Doctor Android',read:async()=>{
      const version = await companion.native.request('get_app_version');
      if (!version.native_status || typeof version.native_status !== 'object') throw new Error('لم يرد تقرير Doctor من Android.');
      return version.native_status;
    }});
    for (const source of sources) {
      parent.append(ui.element('h3',source.title));
      try {
        const report = ui.element('pre',JSON.stringify(await source.read(),null,2),'file-preview');
        report.tabIndex = 0;
        report.setAttribute('aria-label',source.title);
        parent.append(report);
      } catch (error) { parent.append(ui.element('p','تعذر ' + source.title + ': ' + error.message)); }
    }
  }
  async function accountQuota(parent) {
    const output = ui.element('section');
    output.setAttribute('aria-label','حصة حساب agy');
    output.setAttribute('aria-live','polite');
    const refresh = ui.button('جلب حصة الحساب',async()=>{
      refresh.disabled = true;
      try { renderQuota(output,await companion.api.request('/quota?refresh=1')); }
      finally { refresh.disabled = false; }
    });
    parent.append(ui.element('h3','حصة الحساب'),refresh,output);
    renderQuota(output,await companion.api.request('/quota'));
  }
  function renderQuota(parent,report) {
    parent.replaceChildren(ui.element('p',report.stale ? 'الحصة المحفوظة قديمة أو لم تجلب بعد.' : 'حصة مجلوبة من agy.'));
    if (report.fetched_at) parent.append(ui.element('p','وقت الجلب: ' + new Date(report.fetched_at*1000).toLocaleString()));
    if (report.error) parent.append(ui.element('p','تعذر إثبات حصة جديدة؛ آخر نتيجة صحيحة باقية.'));
    for (const quota of report.quotas) parent.append(ui.element('h4',quota.group),ui.element('p',quota.limit_type),ui.element('p',String(quota.remaining_percent)+'%'),ui.element('p','تجدد الحصة: '+quota.reset_time));
  }
  async function cliUpdate(parent) {
    const current = await companion.api.request('/system/cli-version');
    const status = ui.element('p',current.version ? 'نسخة agy: '+current.version : 'نسخة agy غير مثبتة؛ الترقية محجوبة.');
    status.setAttribute('role','status');
    const update = ui.button('ترقية agy بأمر صريح',async()=>{
      update.disabled = true;
      companion.app.cliUpdateRequestId ||= global.crypto.randomUUID();
      try {
        const reply = await companion.api.request('/system/cli-update',{method:'POST',body:{request_id:companion.app.cliUpdateRequestId}});
        const labels = {completed:'اكتملت ترقية agy؛ النسخة: '+reply.version_after,unchanged:'بقيت نسخة agy: '+reply.version_after,outcome_unknown:'نتيجة الترقية غير معلومة؛ لا تعاد تلقائيًا.',running:'الترقية جارية.'};
        if (!labels[reply.status]) throw new Error('حال الترقية غير معروفة.');
        status.textContent = labels[reply.status];
        if (['completed','unchanged'].includes(reply.status)) companion.app.cliUpdateRequestId = undefined;
      } catch (error) { update.disabled = false; throw error; }
    });
    update.disabled = !current.version;
    parent.append(ui.element('h3','ترقية CLI'),ui.element('p','أغلق جلسات agy قبل الترقية؛ هذا الفعل يبدل CLI وحده.'),status,update);
  }
  async function catalogPanel(id, parent) {
    const cwd = companion.app.sessionOptions.cwd ?? state.settings.cwd ?? '.';
    const reply = await companion.api.request('/' + id + (id === 'skills' ? '?cwd='+encodeURIComponent(cwd) : ''));
    const entries = reply[id] || [];
    if (!entries.length) parent.append(ui.element('p','لا عناصر معلنة.'));
    const actions = companion.capability(id)?.actions || [];
    if (!actions.length) parent.append(ui.element('p', companion.capability(id)?.reason || 'هذه القائمة للقراءة؛ لم يعلن CLI عقد تمكين أو تعطيل متاحاً.'));
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.id || entry.name;
      const row = ui.element('section', undefined, 'panel-row');
      row.append(ui.element('h3', typeof entry === 'string' ? entry : entry.name || entry.id || JSON.stringify(entry)));
      if (typeof entry.enabled === 'boolean') row.append(ui.element('p', entry.enabled ? 'مفعّل' : 'معطّل'));
      for (const action of ['enable','disable'].filter(action=>actions.includes(action) && (id !== 'skills' || entry.mutable === true))) {
        if (typeof name !== 'string' || !name) continue;
        row.append(ui.button((action === 'enable' ? 'تمكين ' : 'تعطيل ') + name, async()=>{
          await companion.api.request('/' + id + '/' + encodeURIComponent(name) + '/' + action,{method:'POST',body:id === 'skills' ? {cwd} : {}});
          await companion.app.refreshSuggestions();
          await open(id);
        }));
      }
      parent.append(row);
    }
  }
  async function tasksPanel(parent) {
    parent.append(ui.element('p', state.settings.allow_schedule === false ? 'المؤقتات ممنوعة بإعداد allow_schedule.' : 'لا يعلن عقد الخادم الحالي جدولة مهام؛ لا يُعرض عداد أو تقدم مفترض.'));
  }
  async function devicePanel(parent) {
    parent.append(ui.element('p','أفعال الهاتف لا تُعاد عند الانقطاع. استخرج tree حديثاً قبل select أو click أو text أو scroll؛ تبطل معرفات العناصر عند تغير النافذة. فتح التطبيق يثبت إرسال Intent، لا ظهوره في المقدمة.'));
    const examples = {tree:{},select:{query:''},click:{snapshot_id:'',element_id:''},text:{snapshot_id:'',element_id:'',text:''},scroll:{snapshot_id:'',element_id:'',direction:'forward'},back:{},home:{},recents:{},notifications:{},launch_app:{target:''},screenshot:{}};
    const action = selectField(parent,'فعل الهاتف',Object.keys(examples).map(id=>({id})),'tree');
    const argumentsField = ui.input(parent,'وسائط الفعل JSON',{tag:'textarea',value:'{}'});
    action.addEventListener('change',()=>{argumentsField.value=JSON.stringify(examples[action.value],null,2);});
    const output = ui.element('div');
    const execute = ui.button('تنفيذ الفعل مرة واحدة',async()=>{
      execute.disabled = true;
      try {
        const chosen = action.value;
        const args = jsonObject(argumentsField,'وسائط الفعل');
        let actionId = global.crypto.randomUUID();
        if (['click','text','scroll','back','home','recents','notifications','launch_app'].includes(chosen)) {
          const journal = await companion.api.request('/device/epoch');
          if (typeof journal.epoch !== 'string' || !/^[0-9a-f]{32}$/.test(journal.epoch)) throw new Error('تعذر إثبات سجل أفعال الهاتف؛ لم يُرسل الفعل.');
          actionId = journal.epoch + ':' + actionId;
        }
        const reply = await companion.api.request('/device/actions',{method:'POST',body:{action_id:actionId,action:chosen,args}});
        deviceReply(output,reply);
      } finally { execute.disabled = false; }
    });
    parent.append(execute,output);
  }
  function deviceReply(parent,reply) {
    const picture = reply.result?.image_base64;
    if (typeof picture !== 'string') { parent.replaceChildren(ui.element('pre',JSON.stringify(reply,null,2),'file-preview')); return; }
    if (reply.result.mime_type !== 'image/jpeg' || picture.length > 32*1024*1024) throw new Error('صيغة الصورة أو حجمها غير مقبول.');
    const bytes = Uint8Array.from(global.atob(picture),character=>character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
    const download = ui.element('a','تنزيل صورة شاشة الهاتف JPEG');
    download.href = url;
    download.download = 'companion-screenshot.jpg';
    download.addEventListener('click',()=>global.setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});
    parent.replaceChildren(ui.element('p','وردت صورة الشاشة من Android.'),download);
  }
  const loaders = {models:modelsPanel,agents:agentsPanel,settings:settingsPanel,auth:authPanel,mcp:mcpPanel,files:filesPanel,history:historyPanel,updates:updatesPanel,tasks:tasksPanel,device:devicePanel,quota:quotaPanel,plugins:parent=>catalogPanel('plugins',parent),skills:parent=>catalogPanel('skills',parent)};
  async function open(id) {
    const container = ui.panel(titles[id],'');
    const parent = ui.element('div');
    container.append(parent);
    if (id === 'engine') { parent.append(ui.element('p','لا يدعم عقد الخادم الحالي تشغيل المحرك المستقل أو مزود متوافق مباشرة؛ تبقى قيم المزودين محفوظة في الإعدادات.')); return; }
    if (!['history','updates','tasks','quota'].includes(id) && !companion.allowed(id)) { parent.append(ui.element('p',unsupported(id))); return; }
    try { await loaders[id](parent); } catch (error) { if (parent.isConnected) ui.notice(error.message); }
  }
  companion.panels = {open};
})(window);
