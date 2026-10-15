(function (global) {
  'use strict';
  if (global !== global.top || global.AntigravityBridge || !global.Companion?.native.available()) return;
  let probing;
  let diagnostics = {status: 'pending'};
  let installed = false;
  const snapshot = () => global.CompanionLegacyState || {};
  function report(error) {
    const announcer = document.getElementById('live-announcer') || document.getElementById('sr-announcer');
    if (announcer) announcer.textContent = error.message;
    else console.error(error.message);
  }
  function command(action) {
    global.Companion.native.request(action).catch(report);
  }
  function refreshServer() {
    if (probing) return;
    probing = global.Companion.native.request('probe_server').then(status => {
      global.CompanionLegacyState = {...snapshot(), server_available: status.server_available === true};
    }).catch(report).finally(() => { probing = null; });
  }
  function runDiagnostics() {
    global.Companion.native.request('run_diagnostics').then(outcome => {
      diagnostics = outcome;
      if (global.onDiagnosticsResult) global.onDiagnosticsResult(outcome);
      else {
        const output = document.getElementById('diag-output');
        if (output) { output.style.display = 'block'; output.textContent = JSON.stringify(outcome, null, 2); }
      }
    }).catch(report);
    return JSON.stringify(diagnostics);
  }
  function checkForUpdate() {
    global.Companion.native.request('check_update').then(outcome => {
      global.onUpdateCheckResult?.({...outcome, isUpdateAvailable: outcome.isUpdateAvailable === true || outcome.hasUpdate === true});
    }).catch(error => {
      if (global.onUpdateCheckError) global.onUpdateCheckError({error: error.message});
      else report(error);
    });
  }
  function startUpdateDownload() {
    // Android chooses the verified release; legacy URL arguments never select an APK.
    global.Companion.native.request('download_update').then(outcome => {
      installed = outcome.installed === true;
      global.onUpdateDownloadComplete?.(outcome);
    }).catch(error => {
      if (global.onUpdateDownloadError) global.onUpdateDownloadError({error: error.message});
      else report(error);
    });
  }
  global.AntigravityBridge = {
    getAppVersion: () => String(snapshot().version || ''),
    canInstallUnknownApps: () => snapshot().can_install === true,
    isAccessibilityActive: () => snapshot().accessibility_active === true,
    isAutomationServerReady: () => snapshot().automation_ready === true,
    isTermuxServerReady: () => { const ready = snapshot().server_available === true; refreshServer(); return ready; },
    startServer: () => command('start_server'),
    triggerServerWakeup: () => command('start_server'),
    stopServer: () => command('stop_server'),
    loadChatUrl: () => command('open_chat'),
    loadDashboardUrl: () => command('open_dashboard'),
    openSettings: () => command('open_settings'),
    openAccessibilitySettings: () => command('open_settings'),
    openTermuxApp: () => command('open_termux_app'),
    copySetupCommand: () => command('copy_setup_command'),
    openInstallPermissionSettings: () => command('open_install_permission'),
    runDiagnostics,
    checkForUpdate, checkForUpdates: checkForUpdate,
    startUpdateDownload, downloadUpdate: startUpdateDownload, installUpdate: startUpdateDownload,
    installDownloadedUpdate: () => { startUpdateDownload(); return installed; }
  };
  global.addEventListener('companion-native-progress', event => {
    global.onUpdateProgress?.(event.detail.percent);
  });
})(window);
