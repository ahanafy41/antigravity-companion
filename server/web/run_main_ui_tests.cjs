'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.CODEX_PLAYWRIGHT_MODULE || path.join(process.env.CODEX_NODE_MODULES, 'playwright'));
const requests = [];
const settings = {model:'first',agent:'',effort:'medium',mode:'accept-edits',trustedWorkspaces:['.'],tones_enabled:false,haptic_enabled:false};
let revision = 4;
let oauth = {revision:'mcp-one',scope:'project',has_client_id:false,has_client_secret:true};
let uncertain = false;
let resumeStream = false;
let policy = {permissions:{allow:['command(*)','read_file(*)'],deny:['secret(*)'],ask:['write(*)']},revision:'policy-one'};
let session = {session_id:'session-one',conversation_id:'conversation-one',runs:[]};
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'";
function json(response,payload,status=200){response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(payload));}
const server = http.createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  requests.push({route:request.url,method:request.method,cursor:request.headers['last-event-id'],body:raw?JSON.parse(raw):null});
  if(request.url==='/api/v1/auth/session')return json(response,{csrf_token:'test-csrf'});
  if(request.url==='/api/v1/models')return json(response,{models:[{id:'first',name:'First model'},{id:'second',name:'Second model'}]});
  if(request.url.startsWith('/api/v1/agents'))return json(response,{agents:[{id:'reviewer',name:'Reviewer'}]});
  if(request.url==='/api/v1/settings'){
    if(raw){assert.equal(request.headers['x-csrf-token'],'test-csrf');if(request.headers['if-match']!=='"'+revision+'"')return json(response,{message:'Revision conflict'},409);Object.assign(settings,JSON.parse(raw).settings);revision++;}
    return json(response,{settings,revision});
  }
  if(request.url==='/api/v1/cli/policy'){if(raw){const patch=JSON.parse(raw);assert.equal(patch.revision,policy.revision);policy={permissions:patch.permissions,revision:'policy-two'};}return json(response,policy);}
  if(request.url.startsWith('/api/v1/commands'))return json(response,{commands:[{id:'/real',name:'Actual command'}]});
  if(request.url==='/api/v1/tasks')return json(response,{tasks:[],subagents:[]});
  if(request.url==='/api/v1/local-tasks')return json(response,{tasks:[]});
  if(request.url.startsWith('/api/v1/mcp/test-server/oauth')){
    if(raw){const patch=JSON.parse(raw);assert.equal(patch.revision,oauth.revision);assert.equal(patch.oauth.client_id,'public-client');assert.equal(patch.oauth.client_secret,undefined);oauth={...oauth,has_client_id:true,revision:'mcp-two'};}
    return json(response,oauth);
  }
  if(request.url.startsWith('/api/v1/mcp'))return json(response,{servers:[{name:'test-server',type:'http',url:'https://example.invalid/mcp',enabled:true,revision:'mcp-one'}]});
  if(request.url==='/api/v1/legacy/conversations')return json(response,{conversations:[]});
  if(request.url==='/api/v1/sessions')return json(response,request.method==='POST'?session:{sessions:[session]});
  if(request.url==='/api/v1/sessions/session-one')return json(response,session);
  if(request.url==='/api/v1/runs/run-one')return json(response,{...session.runs[0],conversation_id:'conversation-one'});
  if(request.url==='/api/v1/sessions/session-one/runs'){
    const payload=JSON.parse(raw);assert.ok(payload.client_request_id);assert.ok(['Show a tool step','uncertain request'].includes(payload.message));
    if(uncertain){uncertain=false;return json(response,{message:'Uncertain transport'},503);}
    session.runs=[{run_id:'run-one',message:payload.message,response:'Verified reply',state:'completed'}];
    return json(response,{run_id:'run-one'},202);
  }
  if(request.url==='/api/v1/auth/status')return json(response,{authenticated:null,pending:false,reason:'agy owns account state'});
  if(request.url.startsWith('/api/v1/files'))return json(response,{path:'/workspace',entries:[{name:'file name.txt',path:'/workspace/file name.txt',is_dir:false,size:3},{name:'folder one',path:'/workspace/folder one',is_dir:true,size:0}]});
  if(request.url==='/health')return json(response,{status:'ok'});
  if(request.url==='/api/v1/runs/run-one/events'){
    response.writeHead(200,{'Content-Type':'text/event-stream'});
    if(resumeStream && !request.headers['last-event-id']){
      session.runs[0].state='running';
      response.write('event: tool\nid: 2\ndata: '+JSON.stringify({tool_name:'run_command',tool_info:{parameters:{CommandLine:'resume step'}},state:'running'})+'\n\n');
      return response.end();
    }
    if(resumeStream){assert.equal(request.headers['last-event-id'],'2');session.runs[0].state='completed';resumeStream=false;}
    const events=[['state',{conversation_id:'conversation-one',state:'running'}],
      ['tool',{tool_name:'run_command',tool_info:{parameters:{CommandLine:'printf <unsafe>'}},state:'running'}],
      ['delta',{text_delta:'**Verified reply** <img src=x onerror="window.uiXss=true">'}],
      ['result',{response:'Verified reply',state:'completed',conversation_id:'conversation-one'}]];
    events.forEach(([name,payload],index)=>response.write('event: '+name+'\nid: '+(index+1)+'\ndata: '+JSON.stringify(payload)+'\n\n'));
    return response.end();
  }
  if(request.url.startsWith('/api/'))return json(response,{});
  const relative = request.url==='/'?'index.html':request.url==='/start'?'start.html':request.url.split('?')[0].slice(1);
  const file=path.resolve(__dirname,relative);
  if(!file.startsWith(__dirname+path.sep)){response.writeHead(404);return response.end();}
  try{
    const content=fs.readFileSync(file);
    response.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':csp});
    response.end(content);
  }catch(error){response.writeHead(404);response.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.COMPANION_BROWSER_EXECUTABLE});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.CompanionNative={postMessage(raw){const request=JSON.parse(raw);const outcomes={
      get_app_version:{version:'2.0.0',can_install:true},is_accessibility_active:{active:false},get_connection_status:{server_authenticated:true,automation_ready:true},
      run_diagnostics:{status:'ok'},check_update:{hasUpdate:true,latestVersion:'2.1.0'}};
      setTimeout(()=>window.dispatchEvent(new CustomEvent('companion-native-result',{detail:{request_id:request.request_id,success:true,result:outcomes[request.action]||{}}})),0);
    }};window.cspFailures=[];document.addEventListener('securitypolicyviolation',event=>window.cspFailures.push(event.violatedDirective));});
    const origin='http://127.0.0.1:'+server.address().port;
    await page.goto(origin);
    await page.locator('#btn-toggle-drawer').click();
    assert.equal(await page.evaluate(()=>window.Companion.ui.dismissTopDialog()),true);
    assert.equal(await page.locator('#antigravity-drawer').getAttribute('aria-hidden'),'true');
    await page.locator('#btn-toggle-drawer').click();
    await page.locator('#btn-open-settings').click();
    await page.locator('#field-model').waitFor();
    assert.equal(await page.locator('#field-model').inputValue(),'first');
    assert.equal(await page.locator('#field-autopilot').isDisabled(),true);
    assert.equal(await page.locator('#field-perm-web-access').isDisabled(),true);
    await page.locator('#field-agent').selectOption('reviewer');
    await page.waitForFunction(()=>document.getElementById('settings-sync-badge').textContent.includes('Applied'));
    const write=requests.find(entry=>entry.route==='/api/v1/settings'&&entry.method==='PATCH');
    assert.deepEqual(write.body,{settings:{agent:'reviewer'}});
    await page.locator('#field-effort').selectOption('xhigh');
    await page.locator('#btn-save-settings').click();
    await page.locator('#settings-dialog').waitFor({state:'hidden'});
    assert.equal(settings.effort,'xhigh');
    await page.locator('#ai-prompt-input').fill('@file');
    await page.locator('#at-autocomplete-popup [role=option]').filter({hasText:'file name.txt'}).click();
    assert.equal(await page.locator('#ai-prompt-input').inputValue(),'@"/workspace/file name.txt" ');
    await page.locator('#ai-prompt-input').fill('/rea');
    await page.locator('#slash-autocomplete-popup [role=option]').filter({hasText:'/real'}).click();
    assert.equal(await page.locator('#ai-prompt-input').inputValue(),'/real ');
    await page.locator('#ai-prompt-input').fill('Show a tool step');
    await page.locator('#btn-ai-send').click();
    await page.locator('.step-item').first().waitFor();
    assert.match(await page.locator('.step-item').first().innerText(),/printf <unsafe>/);
    assert.match(await page.locator('#ai-chat-feed').innerText(),/Verified reply/);
    assert.equal(await page.locator('#ai-chat-feed img').count(),0);
    assert.equal(await page.evaluate(()=>window.uiXss),undefined);
    assert.deepEqual(await page.evaluate(()=>window.cspFailures),[]);
    assert.deepEqual(errors,[]);
    await page.locator('#btn-toggle-drawer').click();
    await page.locator('#btn-open-mcp').click();
    await page.getByRole('button',{name:'توثيق ومصادقة بروتوكول test-server',exact:true}).click();
    await page.getByRole('button',{name:'حفظ إعداد OAuth',exact:true}).waitFor();
    assert.equal(await page.locator('#oauth-client_secret').inputValue(),'');
    await page.locator('#oauth-client_id').fill('public-client');
    await page.getByRole('button',{name:'حفظ إعداد OAuth',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('mcp-auth-status').textContent.includes('حُفظ'));
    assert.equal(oauth.has_client_secret,true);
    await page.evaluate(()=>{window.Companion.ui.dismissTopDialog();window.Companion.ui.dismissTopDialog();});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('companion-voice-input',{detail:{mode:'dictation',text:'draft only'}})));
    assert.match(await page.locator('#ai-prompt-input').inputValue(),/draft only/);
    const previousRuns=requests.filter(entry=>entry.route.endsWith('/runs')).length;
    assert.equal(previousRuns,1);
    await page.reload();
    await page.getByRole('article',{name:'رد الذكاء الاصطناعي السابق',exact:true}).waitFor();
    assert.match(await page.locator('#ai-chat-feed').innerText(),/Verified reply/);
    const removed=await page.evaluate(async()=>{
      const response=await window.mainV1Fetch('/api/ai/permissions/whitelist/remove',{method:'POST',body:JSON.stringify({rule:'command(*)'})});
      return {status:response.status,body:await response.json()};
    });
    assert.equal(removed.status,200);assert.deepEqual(removed.body.whitelist,['read_file(*)']);
    assert.deepEqual(policy.permissions.deny,['secret(*)']);assert.deepEqual(policy.permissions.ask,['write(*)']);
    revision++;
    const conflict=await page.evaluate(async()=> (await window.mainV1Fetch('/api/ai/settings',{method:'POST',body:JSON.stringify({agent:'other'})})).status);
    assert.equal(conflict,409);assert.equal(settings.agent,'reviewer');
    uncertain=true;
    const submit=message=>page.evaluate(async message=>{
      const response=await window.mainV1Fetch('/api/ai/stream',{method:'POST',body:JSON.stringify({prompt:message,continue:true})});
      return {status:response.status,text:await response.text()};
    },message);
    assert.equal((await submit('uncertain request')).status,503);
    assert.equal((await submit('different request')).status,409);
    resumeStream=true;
    const replay=await submit('uncertain request');assert.equal(replay.status,200);assert.match(replay.text,/tool_step/);
    assert.ok(requests.some(entry=>entry.route.endsWith('/events')&&entry.cursor==='2'));
    const runCalls=requests.filter(entry=>entry.route.endsWith('/runs'));
    assert.equal(runCalls.length,3);assert.equal(runCalls[1].body.client_request_id,runCalls[2].body.client_request_id);
    assert.equal(requests.filter(entry=>entry.route==='/api/v1/sessions'&&entry.method==='POST').length,1);
    await context.setOffline(true);
    const offline=await page.evaluate(async()=>{
      const list=await(await window.mainV1Fetch('/api/ai/conversations')).json();
      const record=await(await window.mainV1Fetch('/api/ai/conversation?id=session-one')).json();
      return {list,record};
    });
    assert.ok(offline.list.conversations.length);assert.ok(offline.record.messages.some(message=>message.text==='Verified reply'));
    await context.setOffline(false);
    assert.deepEqual(errors,[]);
    await page.goto(origin+'/start');
    await page.waitForFunction(()=>document.getElementById('badge-a11y')?.textContent==='معطلة');
    assert.equal(await page.locator('#badge-ws').textContent(),'متصل');
    assert.match(await page.locator('#app-version-label').textContent(),/2\.0\.0/);
    assert.equal(await page.locator('[onclick],[style]').count(),0);
    await page.locator('#btn-run-diag').click();
    await page.waitForFunction(()=>document.getElementById('diag-output').textContent.includes('ok'));
    await page.locator('#btn-check-update').click();
    await page.getByRole('button',{name:'تثبيت التحديث الآن',exact:true}).waitFor();
    assert.equal(await page.locator('[onclick]').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.cspFailures),[]);
    assert.deepEqual(errors,[]);
    console.log('PASS main UI + actual v1 adapter: CSP, settings/revision/policy, tool safety, request retry identity, history/offline, native dictation, async dashboard');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
