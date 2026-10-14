const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag, text) { this.tag = tag; this.textContent = text; this.children = []; this.value = ''; this.isConnected = true; }
  append(...items) { this.children.push(...items); }
  setAttribute() {}
  addEventListener() {}
  replaceChildren(...items) { this.children = items; }
}
(async () => {
  let panel;
  const calls = [];
  let failNextLocalSubmission=false;
  const ui = {
    element:(tag,text)=>new Element(tag,text),
    panel:()=>{panel=new Element('section');return panel;},
    input:(parent,label,options={})=>{const e=new Element(options.tag||'input',label);e.value=options.value||'';e.inputOptions=options;parent.append(e);return e;},
    button:(label,handler)=>{const e=new Element('button',label);e.click=handler;return e;},
    announce:()=>{}, closeDialog:()=>{}, byId:()=>new Element('dialog'), notice:message=>{throw new Error(message);}
  };
  function elements(root) { return [root,...root.children.flatMap(elements)]; }
  const companion = {ui,state:{settings:{cwd:'.'}}, app:{sessionOptions:{cwd:'.'},refreshSuggestions:async()=>{},ensureSession:async()=>{companion.state.sessionId='chosen-session';},resume:async id=>calls.push({resume:id})},
    allowed:()=>true,capability:()=>({actions:[]}),native:{available:()=>true,request:async action=>{calls.push({native:action});return {}; }},
    api:{request:async(route,options={})=>{
      calls.push({route,...options});
      if(route==='/auth/status')return {authenticated:null,reason:'native'};
      if(route==='/auth/logout')return {status:'native_launch',action:'logout_cli',interactive_command:'/logout',request_id:'logout'};
      if(route==='/auth/login')return {status:'native_launch',action:'login_cli',request_id:'login'};
      if(route==='/settings')return {settings:{},revision:0};
      if(route==='/cli/policy')return {permissions:{allow:[],deny:[],ask:[]},revision:'rev'};
      if(route.startsWith('/mcp?'))return {servers:[{name:'server',enabled:true,scope:'workspace',revision:'owner-rev'}]};
      if(route.startsWith('/mcp/server/oauth?'))return {revision:'mcp-rev'};
      if(route==='/voice/runs')return {runs:[]};
      if(route==='/tasks')return {tasks:[{task_id:'run',state:'running',cancellable:true}],subagents:[]};
      if(route==='/tasks/run/cancel')return {state:'cancelled'};
      if(route==='/local-tasks'&&options.method==='POST'){
        if(failNextLocalSubmission){failNextLocalSubmission=false;throw new Error('Network reply lost');}
        return {task_id:'local-one',state:'pending'};
      }
      if(route==='/local-tasks')return {tasks:[{task_id:'local-one',session_id:'chosen-session',state:'running',run_id:'actual-run',cancellable:true}]};
      if(route==='/local-tasks/local-one/cancel')return {state:'cancelled'};
      return {};
    }} };
  let confirmedLogout=false;
  const context={confirm:()=>confirmedLogout,window:null,console,Companion:companion,crypto:require('node:crypto').webcrypto};context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'panels.js'),'utf8'),context);
  await companion.panels.open('auth');
  let button=elements(panel).find(e=>e.tag==='button'&&e.textContent.includes('بدء دخول'));
  assert.ok(button,'native auth handoff control missing');await button.click();
  assert.ok(calls.some(c=>c.route==='/auth/login'));assert.ok(calls.some(c=>c.native==='login_cli'));
  let logoutButton=elements(panel).find(e=>e.tag==='button'&&e.textContent==='خروج الحساب في agy');
  assert.ok(logoutButton);await logoutButton.click();
  assert.ok(!calls.some(c=>c.route==='/auth/logout'),'cancelled confirmation must not launch logout');
  confirmedLogout=true;companion.native.available=()=>false;
  await logoutButton.click();
  assert.equal(calls.find(c=>c.route==='/auth/logout').body.confirmed,true);
  assert.ok(elements(panel).some(e=>e.textContent?.includes('ثم /logout')),'desktop handoff must show native logout command');
  companion.native.available=()=>true;
  await companion.panels.open('settings');
  button=elements(panel).find(e=>e.tag==='button'&&e.textContent.includes('حفظ أذون agy'));
  assert.ok(button,'real CLI policy editor missing');await button.click();
  assert.ok(calls.some(c=>c.route==='/cli/policy'&&c.method==='PATCH'&&c.body.revision==='rev'));
  await companion.panels.open('tasks');
  button=elements(panel).find(e=>e.tag==='button'&&e.textContent.includes('إلغاء العمل'));
  assert.ok(button,'owned task cancellation control missing');await button.click();
  assert.ok(calls.some(c=>c.route==='/tasks/run/cancel'));
  await companion.panels.open('tasks');
  let localMessage=elements(panel).find(e=>e.textContent==='رسالة الدور المؤجل أو الموعد');
  assert.ok(localMessage,'local scheduling message control missing');
  localMessage.value='follow up after running turn';
  let queued=elements(panel).find(e=>e.tag==='button'&&e.textContent==='إرسال بعد انتهاء الدور الجاري');
  assert.ok(queued,'explicit deferred message action missing');await queued.click();
  const queueCall=calls.find(c=>c.route==='/local-tasks'&&c.method==='POST'&&c.body.mode==='queued');
  assert.equal(queueCall.body.session_id,'chosen-session');
  assert.equal(queueCall.body.message,'follow up after running turn');
  assert.match(queueCall.body.request_id,/^[0-9a-f-]{36}$/);
  localMessage=elements(panel).find(e=>e.textContent==='رسالة الدور المؤجل أو الموعد');localMessage.value='at chosen UTC minute';
  const due=elements(panel).find(e=>e.textContent==='موعد التنفيذ مرة واحدة بتوقيت UTC');
  assert.equal(due.inputOptions.type,'datetime-local');due.value='2099-11-05T10:30';
  const policy=elements(panel).find(e=>e.textContent==='إذا فات الموعد والخادم مغلق');
  policy.value='run_once';
  const schedule=elements(panel).find(e=>e.tag==='button'&&e.textContent==='حفظ موعد واحد');
  await schedule.click();
  const scheduleCall=calls.find(c=>c.route==='/local-tasks'&&c.method==='POST'&&c.body.mode==='scheduled');
  assert.equal(scheduleCall.body.scheduled_at,'2099-11-05T10:30:00.000Z');
  assert.equal(scheduleCall.body.missed_policy,'run_once');
  localMessage=elements(panel).find(e=>e.textContent==='رسالة الدور المؤجل أو الموعد');localMessage.value='retry only this deferred message';
  queued=elements(panel).find(e=>e.tag==='button'&&e.textContent==='إرسال بعد انتهاء الدور الجاري');
  failNextLocalSubmission=true;
  await assert.rejects(()=>queued.click(),/Network reply lost/);
  const failedPost=calls.filter(c=>c.route==='/local-tasks'&&c.method==='POST').at(-1);
  await queued.click();
  const retriedPost=calls.filter(c=>c.route==='/local-tasks'&&c.method==='POST').at(-1);
  assert.equal(retriedPost.body.request_id,failedPost.body.request_id,'lost replies must preserve local task identity');
  localMessage=elements(panel).find(e=>e.textContent==='رسالة الدور المؤجل أو الموعد');localMessage.value='invalid schedule';
  const invalidDue=elements(panel).find(e=>e.textContent==='موعد التنفيذ مرة واحدة بتوقيت UTC');invalidDue.value='2099-02-30T10:30';
  const invalidSchedule=elements(panel).find(e=>e.tag==='button'&&e.textContent==='حفظ موعد واحد');
  const beforeInvalid=calls.filter(c=>c.route==='/local-tasks'&&c.method==='POST').length;
  await assert.rejects(()=>invalidSchedule.click(),/الموعد غير صحيح/);
  assert.equal(calls.filter(c=>c.route==='/local-tasks'&&c.method==='POST').length,beforeInvalid,'invalid UTC dates cannot schedule');
  button=elements(panel).find(e=>e.tag==='button'&&e.textContent==='فتح محادثة المؤجل local-one');
  await button.click();assert.ok(calls.some(c=>c.resume==='chosen-session'),'actual runs must use normal session resume');
  button=elements(panel).find(e=>e.tag==='button'&&e.textContent==='إلغاء المؤجل local-one');
  assert.ok(button,'local task cancellation control missing');await button.click();
  assert.ok(calls.some(c=>c.route==='/local-tasks/local-one/cancel'));
  await companion.panels.open('mcp');
  let toggle=elements(panel).find(e=>e.tag==='button'&&e.textContent==='تعطيل server');await toggle.click();
  const scopedToggle=calls.find(c=>c.route==='/mcp/server/disable');
  assert.equal(scopedToggle.body.cwd,'.');assert.equal(scopedToggle.body.revision,'owner-rev');
  await companion.panels.open('mcp');
  const secretField = elements(panel).find(e=>e.textContent?.startsWith('Client Secret الجديد'));
  assert.equal(secretField.inputOptions.type,'password','OAuth secret must be masked');
  assert.ok(calls.some(c=>c.route?.startsWith('/mcp?cwd=')),'MCP inventory must follow selected workspace');
  await companion.panels.open('voice');
  const capture=elements(panel).find(e=>e.tag==='button'&&e.textContent.includes('التقاط أمر'));
  const cancelCapture=elements(panel).find(e=>e.tag==='button'&&e.textContent.includes('إلغاء الأمر'));
  let resolveCapture;
  companion.native.request=async action=>{
    calls.push({native:action});
    if(action==='start_voice')return new Promise(resolve=>{resolveCapture=resolve;});
    return {};
  };
  const awaitingCapture=capture.click();
  await cancelCapture.click();
  resolveCapture({text:'must not execute',task_id:'late-capture'});
  await awaitingCapture;
  assert.ok(calls.some(c=>c.native==='cancel_voice'));
  assert.ok(!calls.some(c=>c.route==='/voice/runs'&&c.method==='POST'),'late cancelled speech must not execute');
  vm.runInContext(fs.readFileSync(path.join(__dirname,'state.js'),'utf8'),context);
  const seen = new Set();
  assert.equal(companion.feedbackPolicy('r','completed',true,{sound:true},seen).sound,false);
  assert.equal(companion.feedbackPolicy('r','completed',false,{sound:true},seen).sound,false);
  assert.equal(companion.feedbackPolicy('fresh','completed',false,{sound:true},seen).sound,true);
  assert.equal(companion.feedbackPolicy('fresh','completed',false,{sound:true},seen).sound,false);
  assert.equal(companion.feedbackPolicy('other','running',false,{sound:true},seen).sound,false);
  const sessionCreates=[];
  let finishSession;
  const actualAppCompanion={state:{settings:{cwd:'.'},sessionId:''},ui,
    api:{request:(route,options)=>{sessionCreates.push({route,...options});return new Promise(resolve=>{finishSession=resolve;});}}};
  const actualAppContext={window:null,console,Companion:actualAppCompanion,crypto:require('node:crypto').webcrypto,
    document:{addEventListener:()=>{}},addEventListener:()=>{}};
  actualAppContext.window=actualAppContext;vm.createContext(actualAppContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),actualAppContext);
  const firstCreation=actualAppCompanion.app.ensureSession();
  const concurrentCreation=actualAppCompanion.app.ensureSession();
  assert.equal(sessionCreates.length,1,'chat and local-task actions must share pending session creation');
  finishSession({session_id:'only-created-session'});
  await Promise.all([firstCreation,concurrentCreation]);
  assert.equal(actualAppCompanion.state.sessionId,'only-created-session');
  await actualAppCompanion.app.ensureSession();
  assert.equal(sessionCreates.length,1,'existing session must be reused');
  const suggestionCalls=[];
  actualAppCompanion.app.sessionOptions.cwd='/selected-project';
  actualAppCompanion.allowed=id=>id==='mcp';actualAppCompanion.capability=()=>({});
  actualAppCompanion.ui.byId=()=>({hidden:true});
  actualAppCompanion.api.request=async route=>{suggestionCalls.push(route);return {servers:[]};};
  await actualAppCompanion.app.refreshSuggestions();
  assert.ok(suggestionCalls.includes('/mcp?cwd=%2Fselected-project'),'suggestions must use the selected project');
  console.log('PASS: native auth, CLI policy, owned tasks, OAuth mask/scope, voice cancellation, visibility/dedup, local UTC scheduling/queue/cancel/retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
