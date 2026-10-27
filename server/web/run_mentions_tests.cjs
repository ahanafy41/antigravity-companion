'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.CODEX_PLAYWRIGHT_MODULE || path.join(process.env.CODEX_NODE_MODULES, 'playwright'));
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.COMPANION_BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:640},serviceWorkers:'block'});
    page.setDefaultTimeout(5000);
    const root = __dirname;
    await page.route('http://localhost/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/health') return route.fulfill({json:{service:'antigravity-companion',api_versions:[1]}});
      const endpoint = url.pathname.replace('/api/v1/', '');
      if (endpoint === 'auth/session') return route.fulfill({json:{csrf_token:'fixture'}});
      if (endpoint === 'capabilities') return route.fulfill({json:{capabilities:['chat','files','mcp','commands','skills','settings'].map(id=>({id,available:true}))}});
      if (endpoint === 'settings') return route.fulfill({json:{settings:{cwd:'/workspace'},revision:1}});
      if (['commands','skills'].includes(endpoint)) {
        const cwd=url.searchParams.get('cwd');
        if (cwd?.startsWith('/slow-catalog')) await new Promise(resolve=>setTimeout(resolve,150));
        if (cwd==='/slow-catalog-fail') return route.fulfill({status:503,json:{message:'old catalog failure'}});
        const entries=endpoint==='commands' ? (cwd==='/new-root' ? [{id:'/new-command',name:'New cwd command'}] : cwd==='/slow-catalog' ? [{id:'/old-command',name:'Old cwd command'}] : [{id:'/real-skill',name:'Skill expansion'}]) : [{id:'hidden-slash',name:'Hidden slash',disable_slash_command:true,enabled:true},{id:'folder-alias',name:'Folder alias',enabled:true}];
        return route.fulfill({json:{[endpoint]:entries}});
      }
      if (endpoint === 'mcp') return route.fulfill({json:{servers:[{name:'real-mcp',enabled:true}]}});
      if (endpoint === 'client/visibility') return route.fulfill({json:{}});
      if (endpoint === 'files') {
        const directory = url.searchParams.get('path');
        if (directory.includes('slow')) await new Promise(resolve=>setTimeout(resolve,150));
        if (directory.includes('broken')) return route.fulfill({status:403,json:{message:'directory blocked'}});
        const names = directory.includes('new-root') ? ['new.txt'] : directory.includes('folder name') ? ['nested.txt'] : ['read me.txt','folder name','old.txt','mail@host.txt','old.txt'];
        return route.fulfill({json:{path:directory,entries:names.map(name=>({name,path:directory+'/'+name,is_dir:name==='folder name'}))}});
      }
      const filename = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      try {return route.fulfill({body:fs.readFileSync(filename),contentType:filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html'});}
      catch {return route.fulfill({status:404,body:''});}
    });
    const failures=[];
    page.on('pageerror',error=>{failures.push(error.message);console.error(error.message);});
    await page.goto('http://localhost/');
    await page.waitForFunction(()=>!document.getElementById('prompt').disabled,{},{timeout:5000});
    await page.locator('#prompt').fill('/');
    await page.getByRole('button',{name:'Skill expansion',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Hidden slash',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Folder alias',exact:true}).count(),0);
    await page.getByRole('button',{name:'Skill expansion',exact:true}).click();
    assert.equal(await page.locator('#prompt').inputValue(),'/real-skill ');
    await page.locator('#prompt').fill('@read');
    await page.getByRole('button',{name:'ملف: read me.txt',exact:true}).click({timeout:1800});
    assert.equal(await page.locator('#prompt').inputValue(),'@"read me.txt" ');
    await page.locator('#prompt').fill('check @mail@h');
    await page.getByRole('button',{name:'ملف: mail@host.txt',exact:true}).click();
    assert.equal(await page.locator('#prompt').inputValue(),'check @mail@host.txt ');
    await page.locator('#prompt').fill('@old');
    await page.getByRole('button',{name:'ملف: old.txt',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'ملف: old.txt',exact:true}).count(),1);
    await page.locator('#prompt').fill('@folder');
    await page.getByRole('button',{name:'مجلد: folder name',exact:true}).click();
    await page.getByRole('button',{name:'ملف: folder name/nested.txt',exact:true}).click();
    assert.equal(await page.locator('#prompt').inputValue(),'@"folder name/nested.txt" ');
    await page.locator('#prompt').fill('@slow/');
    await page.locator('#prompt').fill('@broken/');
    await page.getByText('تعذر جلب الملفات: directory blocked',{exact:true}).waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole('button',{name:'ملف: slow/old.txt',exact:true}).count(),0);
    await page.locator('#prompt').fill('@slow/');
    await page.evaluate(()=>{window.Companion.app.sessionOptions.cwd='/new-root';});
    await page.locator('#prompt').fill('@');
    await page.getByRole('button',{name:'ملف: new.txt',exact:true}).waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole('button',{name:'ملف: slow/old.txt',exact:true}).count(),0);
    for (const previousCwd of ['/slow-catalog','/slow-catalog-fail']) {
      await page.evaluate(async previousCwd=>{
        const app=window.Companion.app;
        app.sessionOptions.cwd=previousCwd;
        const pending=app.refreshSuggestions();
        app.sessionOptions.cwd='/new-root';
        await app.refreshSuggestions();
        await pending;
      },previousCwd);
      await page.locator('#prompt').fill('/');
      await page.getByRole('button',{name:'New cwd command',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Old cwd command',exact:true}).count(),0);
      assert.equal(await page.getByText('تعذر جلب commands: old catalog failure',{exact:true}).count(),0);
    }
    await page.locator('#prompt').fill('@');
    await page.getByRole('button',{name:'ملف: new.txt',exact:true}).waitFor();
    await page.locator('#prompt').press('ArrowDown');
    assert.equal(await page.locator('#suggestions button:focus').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#prompt:focus').count(),1);
    await page.locator('#prompt').fill('@');
    await page.getByRole('button',{name:'ملف: new.txt',exact:true}).waitFor();
    for (const viewport of [{width:390,height:640},{width:390,height:300},{width:1000,height:700}]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const box=await page.locator('#suggestions').boundingBox();
      assert.ok(box.y>=0 && box.x>=0 && box.y+box.height<=viewport.height+1 && box.x+box.width<=viewport.width+1,JSON.stringify({viewport,box}));
    }
    await page.locator('#prompt').press('Escape');
    await page.locator('#menu-open').click();
    assert.equal(await page.locator('#menu-title:focus').count(),1);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'إغلاق القائمة',exact:true}).evaluate(button=>button===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'النموذج والتفكير',exact:true}).evaluate(button=>button===document.activeElement),true);
    await page.evaluate(()=>window.Companion.ui.showDialog(document.getElementById('menu-dialog')));
    assert.equal(await page.getByRole('button',{name:'النموذج والتفكير',exact:true}).evaluate(button=>button===document.activeElement),true);
    await page.getByRole('button',{name:'إغلاق القائمة',exact:true}).click();
    assert.equal(await page.locator('#menu-open:focus').count(),1);
    await page.evaluate(()=>{
      const ui=window.Companion.ui;
      const panel=ui.panel('فحص التركيز','');
      const input=ui.input(panel,'حقل الفحص');
      input.focus();
    });
    await page.waitForTimeout(150);
    assert.equal(await page.getByLabel('حقل الفحص',{exact:true}).evaluate(input=>input===document.activeElement),true);
    await page.getByRole('button',{name:'إغلاق النافذة',exact:true}).click();
    assert.equal(await page.locator('#menu-open:focus').count(),1);
    assert.deepEqual(failures,[]);
    console.log('PASS: file/folder mentions, spaces, stale response and cwd guards, failures, keyboard, viewport bounds and dialog focus');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
