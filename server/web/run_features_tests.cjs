const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(initial = {sessionId:'chosen-session',conversationId:'chosen-conversation'}) {
  const calls = [];
  const nativeCalls = [];
  const storage = new Map([['companion-main-v1',JSON.stringify(initial)]]);
  const settings = {cwd:'/selected-project',sound:true,haptics:true};
  let policy = {permissions:{allow:['command(git)'],deny:['secret(*)'],ask:['write(*)']},revision:'policy-one'};
  let failQueue = false;
  let sessionGate;
  class ApiError extends Error {
    constructor(message,status,code) { super(message);this.status=status;this.code=code; }
  }
  const companion = {ApiError,
    native:{available:()=>true,request:async(action,args)=>{nativeCalls.push({action,args});return {}; }},
    history:{open:async()=>{},save:async()=>{},list:async()=>[],get:async()=>null},
    api:{restoreSession:async()=>({}),events:async()=>{},request:async(route,options={})=>{
      calls.push({route,...options});
      if(route==='/settings')return {settings,revision:7};
      if(route==='/cli/policy'){
        if(options.method==='PATCH')policy={permissions:options.body.permissions,revision:'policy-two'};
        return policy;
      }
      if(route==='/auth/login')return {status:'native_launch',action:'login_cli',request_id:'login',cwd:settings.cwd};
      if(route==='/auth/logout')return {status:'native_launch',action:'logout_cli',request_id:'logout',cwd:settings.cwd};
      if(route==='/tasks')return {tasks:[{task_id:'owned',state:'running'}],subagents:[]};
      if(route==='/local-tasks'&&options.method==='POST'){
        if(failQueue){failQueue=false;throw new Error('Network reply lost');}
        return {task_id:'local-one',state:'pending'};
      }
      if(route==='/local-tasks')return {tasks:[{task_id:'local-one',session_id:'chosen-session',state:'running',run_id:'actual-run'}]};
      if(route.endsWith('/cancel'))return {state:'cancelled'};
      if(route.startsWith('/mcp?'))return {servers:[{name:'server',enabled:true,scope:'workspace',revision:'owner-rev'}]};
      if(route.startsWith('/mcp/server/oauth'))return {revision:'oauth-rev',scope:'workspace',has_client_secret:true};
      if(route==='/mcp/server/disable')return {status:'ok'};
      if(route==='/sessions'&&options.method==='POST'){
        if(sessionGate)await sessionGate;
        return {session_id:'created-session',conversation_id:'created-conversation'};
      }
      if(route.endsWith('/runs')&&options.method==='POST')return {run_id:'run-one'};
      if(route==='/runs/run-one')return {state:'completed',response:'reply'};
      if(route==='/sessions/created-session')return {session_id:'created-session',runs:[]};
      throw new Error('Unexpected fixture request: '+route);
    }}};
  const live = {textContent:''};
  const context = {window:null,console,Companion:companion,
    crypto:require('node:crypto').webcrypto,URL,Response,ReadableStream,TextEncoder,AbortController,
    location:{origin:'http://localhost'},navigator:{},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    document:{getElementById:id=>id==='sr-announcer'?live:null},addEventListener:()=>{}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'main-v1-adapter.js'),'utf8'),context);
  const fetch = (route,body,method='POST')=>context.mainV1Fetch('/api/'+route,
    body===undefined?{}:{method,body:JSON.stringify(body)});
  return {context,companion,calls,nativeCalls,fetch,storage,
    failQueue:()=>{failQueue=true;},holdSession:promise=>{sessionGate=promise;}};
}

(async () => {
  const app=fixture();
  await app.context.mainV1.ready;
  assert.equal((await app.fetch('auth/start',{})).status,200);
  assert.equal((await app.fetch('auth/logout',{})).status,200);
  assert.deepEqual(app.nativeCalls.map(call=>call.action),['login_cli','logout_cli']);
  assert.equal(app.calls.find(call=>call.route==='/auth/logout').body.confirmed,true);
  assert.equal(app.nativeCalls[0].args.cwd,'/selected-project');

  await app.fetch('ai/settings');
  const saved=await app.fetch('ai/settings',{whitelist:['command(git)','read(project/*)']});
  assert.equal(saved.status,200);
  const policyWrite=app.calls.find(call=>call.route==='/cli/policy'&&call.method==='PATCH');
  assert.equal(policyWrite.body.revision,'policy-one');
  assert.deepEqual(JSON.parse(JSON.stringify(policyWrite.body.permissions)),{
    allow:['command(git)','read(project/*)'],deny:['secret(*)'],ask:['write(*)']});
  const writesBefore=app.calls.filter(call=>['POST','PATCH','DELETE'].includes(call.method)).length;
  const obsoleteSpeech=await app.fetch('ai/settings',{speech_enabled:true});
  assert.equal(obsoleteSpeech.status,409);
  assert.equal((await obsoleteSpeech.json()).code,'native_cli_required');
  assert.equal(app.calls.filter(call=>['POST','PATCH','DELETE'].includes(call.method)).length,writesBefore);
  assert.ok(!app.nativeCalls.some(call=>/voice|speech/.test(call.action)));

  const tasks=await(await app.fetch('ai/tasks')).json();
  assert.equal(tasks.active_count,2);
  assert.equal(tasks.tasks.find(task=>task.id==='local-one').local,true);
  await app.fetch('ai/tasks/manage',{task_id:'owned',action:'kill'});
  await app.fetch('ai/tasks/manage',{task_id:'local-one',action:'kill'});
  assert.ok(app.calls.some(call=>call.route==='/tasks/owned/cancel'&&call.method==='POST'));
  assert.ok(app.calls.some(call=>call.route==='/local-tasks/local-one/cancel'&&call.method==='POST'));
  app.failQueue();
  assert.equal((await app.fetch('ai/send',{prompt:'follow up'})).status,503);
  const failed=app.calls.filter(call=>call.route==='/local-tasks'&&call.method==='POST').at(-1);
  assert.equal(failed.body.session_id,'chosen-session');
  assert.equal(failed.body.mode,'queued');
  assert.match(failed.body.request_id,/^[0-9a-f-]{36}$/);
  assert.equal((await app.fetch('ai/send',{prompt:'different message'})).status,409);
  assert.equal(app.calls.filter(call=>call.route==='/local-tasks'&&call.method==='POST').length,1);
  assert.equal((await app.fetch('ai/send',{prompt:'follow up'})).status,200);
  const retried=app.calls.filter(call=>call.route==='/local-tasks'&&call.method==='POST').at(-1);
  assert.equal(retried.body.request_id,failed.body.request_id);
  assert.equal(JSON.parse(app.storage.get('companion-main-v1')).pendingQueue,null);

  const listing=await(await app.fetch('mcp/list')).json();
  assert.equal(listing.installed[0].scope,'workspace');
  await app.fetch('mcp/toggle',{name:'server',enable:false});
  const toggle=app.calls.find(call=>call.route==='/mcp/server/disable');
  assert.equal(toggle.body.cwd,'/selected-project');
  assert.equal(toggle.body.revision,'owner-rev');
  const oauth=await(await app.fetch('mcp/oauth?name=server')).json();
  assert.equal(oauth.has_client_secret,true);
  assert.equal(oauth.client_secret,undefined);
  await app.fetch('mcp/oauth',{name:'server',revision:oauth.revision,oauth:{client_id:'public'}},'PATCH');
  const oauthWrite=app.calls.find(call=>call.route==='/mcp/server/oauth'&&call.method==='PATCH');
  assert.equal(oauthWrite.body.revision,'oauth-rev');
  assert.equal(oauthWrite.body.cwd,'/selected-project');
  assert.ok(app.calls.some(call=>call.route==='/mcp?cwd=%2Fselected-project'));

  const fresh=fixture({});
  let releaseSession;
  fresh.holdSession(new Promise(resolve=>{releaseSession=resolve;}));
  const first=fresh.fetch('ai/stream',{prompt:'same request'});
  const concurrent=fresh.fetch('ai/stream',{prompt:'same request'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fresh.calls.filter(call=>call.route==='/sessions'&&call.method==='POST').length,1);
  releaseSession();
  const streams=await Promise.all([first,concurrent]);
  assert.ok(streams.every(response=>response.ok));
  await Promise.all(streams.map(response=>response.text()));
  assert.equal(JSON.parse(fresh.storage.get('companion-main-v1')).sessionId,'created-session');
  const reused=await fresh.fetch('ai/stream',{prompt:'next request'});await reused.text();
  assert.equal(fresh.calls.filter(call=>call.route==='/sessions'&&call.method==='POST').length,1);
  assert.equal(fresh.calls.find(call=>call.route==='/sessions'&&call.method==='POST').body.cwd,'/selected-project');

  vm.runInContext(fs.readFileSync(path.join(__dirname,'state.js'),'utf8'),app.context);
  const seen=new Set();
  assert.equal(app.companion.feedbackPolicy('r','completed',true,{sound:true},seen).sound,false);
  assert.equal(app.companion.feedbackPolicy('r','completed',false,{sound:true},seen).sound,false);
  assert.equal(app.companion.feedbackPolicy('fresh','completed',false,{sound:true},seen).sound,true);
  assert.equal(app.companion.feedbackPolicy('fresh','completed',false,{sound:true},seen).sound,false);
  assert.equal(app.companion.feedbackPolicy('other','running',false,{sound:true},seen).sound,false);
  console.log('PASS: active adapter auth, policy revisions, owned/local tasks, queue retry identity, MCP scope/OAuth, session reuse, speech-setting rejection and feedback dedup');
})().catch(error=>{console.error(error);process.exitCode=1;});
