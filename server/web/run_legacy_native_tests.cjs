'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.CODEX_PLAYWRIGHT_MODULE || path.join(process.env.CODEX_NODE_MODULES, 'playwright'));
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.COMPANION_BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage();
    const network = [];
    const errors = [];
    page.on('request', request => network.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:7681/',route=>route.fulfill({contentType:'text/html',body:'<main><pre id="diag-output"></pre><p id="live-announcer"></p></main>'}));
    await page.goto('http://127.0.0.1:7681/');
    await page.evaluate(() => {
      window.CompanionLegacyState = {server_available:false,accessibility_active:false,automation_ready:true,version:'2.0.0',can_install:false};
      window.nativeCalls = [];
      window.CompanionNative = {postMessage(raw) {
        const request = JSON.parse(raw);
        window.nativeCalls.push(request);
        const outcomes = {probe_server:{server_available:true,server_authenticated:false,legacy:true},
          run_diagnostics:{status:'ok'},check_update:{hasUpdate:true,latestVersion:'2.1.0'},download_update:{status:'completed'}};
        setTimeout(() => window.dispatchEvent(new CustomEvent('companion-native-result', {detail:{request_id:request.request_id,success:true,result:outcomes[request.action] || {}}})), 0);
      }};
      window.onUpdateCheckResult = result => {window.updateResult = result;};
      window.onUpdateDownloadComplete = result => {window.downloadResult = result;};
    });
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'native.js'),'utf8')});
    const shim = fs.readFileSync(path.join(__dirname,'legacy-native.js'),'utf8');
    await page.addScriptTag({content:shim});
    const initial = await page.evaluate(() => {
      const bridge = window.AntigravityBridge;
      return {ready:bridge.isTermuxServerReady(),a11y:bridge.isAccessibilityActive(),automation:bridge.isAutomationServerReady(),
        version:bridge.getAppVersion(),canInstall:bridge.canInstallUnknownApps(),diagnostics:JSON.parse(bridge.runDiagnostics())};
    });
    assert.deepEqual(initial,{ready:false,a11y:false,automation:true,version:'2.0.0',canInstall:false,diagnostics:{status:'pending'}});
    await page.waitForFunction(() => window.AntigravityBridge.isTermuxServerReady() === true);
    await page.waitForFunction(() => document.getElementById('diag-output').textContent.includes('ok'));
    await page.evaluate(() => {
      const bridge=window.AntigravityBridge;
      bridge.startServer();bridge.triggerServerWakeup();bridge.stopServer();bridge.loadChatUrl();bridge.loadDashboardUrl();
      bridge.openSettings();bridge.openAccessibilitySettings();bridge.openTermuxApp();bridge.copySetupCommand();
      bridge.openInstallPermissionSettings();bridge.checkForUpdates();bridge.downloadUpdate('https://untrusted.invalid/app.apk');
      window.originalBridge=bridge;
    });
    await page.waitForFunction(() => window.updateResult && window.downloadResult);
    assert.equal(await page.evaluate(() => window.updateResult.isUpdateAvailable),true);
    assert.equal(await page.evaluate(() => {
      window.CompanionLegacyState={server_available:false,accessibility_active:true,automation_ready:false,version:'2.1.0',can_install:true};
      const bridge=window.AntigravityBridge;
      return bridge.getAppVersion()==='2.1.0' && bridge.isAccessibilityActive()===true && bridge.isAutomationServerReady()===false && bridge.canInstallUnknownApps()===true;
    }),true);
    assert.equal(await page.evaluate(() => window.AntigravityBridge.installDownloadedUpdate()),false);
    const calls=await page.evaluate(() => window.nativeCalls);
    for(const action of ['start_server','stop_server','open_chat','open_dashboard','open_settings','open_termux_app','copy_setup_command','open_install_permission','check_update','download_update']) {
      assert.ok(calls.some(request=>request.action===action),action);
    }
    assert.deepEqual(calls.find(request=>request.action==='download_update').args,{});
    await page.addScriptTag({content:shim});
    assert.equal(await page.evaluate(() => window.originalBridge === window.AntigravityBridge),true);
    await page.evaluate(() => {const frame=document.createElement('iframe');frame.srcdoc='<p>Child</p>';document.body.append(frame);});
    const frame=page.frames()[1];
    await frame.waitForLoadState();
    await frame.addScriptTag({content:shim});
    assert.equal(await frame.evaluate(() => typeof window.AntigravityBridge),'undefined');
    assert.deepEqual(network,['http://127.0.0.1:7681/']);
    assert.deepEqual(errors,[]);
    console.log('PASS legacy native facade: synchronous cached getters, refresh, lifecycle/settings/update aliases, diagnostics callback, no network, main-frame and duplicate guards');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
