(function (global) {
  'use strict';
  if (global !== global.top || global.AntigravityBridge || !global.Companion?.native.available()) return;
  let probeRevision = 0;
  let installed = false;
  const snapshot = () => global.CompanionLegacyState || {};
  function report(error) {
    const announcer = document.getElementById('live-announcer') || document.getElementById('sr-announcer');
    if (announcer) announcer.textContent = error.message;
    else console.error(error.message);
  }
  function command(action) {
    return global.Companion.native.request(action);
  }
  async function refreshServer() {
    const revision = ++probeRevision;
    const status = await global.Companion.native.request('probe_server');
    const ready = status.server_available === true;
    if (revision === probeRevision) global.CompanionLegacyState = {...snapshot(), server_available: ready};
    return ready;
  }
  async function runDiagnostics() {
    const outcome = await global.Companion.native.request('run_diagnostics');
    global.onDiagnosticsResult?.(outcome);
    return outcome;
  }
  function checkForUpdate() {
    return global.Companion.native.request('check_update').then(outcome => {
      global.onUpdateCheckResult?.({...outcome, isUpdateAvailable: outcome.isUpdateAvailable === true || outcome.hasUpdate === true});
    }).catch(error => {
      if (global.onUpdateCheckError) global.onUpdateCheckError({error: error.message});
      else report(error);
    });
  }
  function startUpdateDownload() {
    // Android chooses the verified release; legacy URL arguments never select an APK.
    return global.Companion.native.request('download_update').then(outcome => {
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
    isTermuxServerReady: refreshServer,
    startServer: () => command('start_server'),
    triggerServerWakeup: () => command('start_server'),
    stopServer: () => command('stop_server'),
    syncServer: () => command('sync_server'),
    loadChatUrl: () => command('open_chat'),
    loadDashboardUrl: () => command('open_dashboard'),
    openSettings: () => command('open_settings'),
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
