/**
 * ota-updater.js - Modular In-App OTA Update Controller for Antigravity Companion
 * Handles checking GitHub releases, progress milestones, and installer launch with TalkBack announcements.
 */

(function (root, factory) {
  const exportsObj = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (window) {
  'use strict';

  function announce(txt) {
    if (typeof window.announce === 'function') {
      window.announce(txt);
      return;
    }
    const ann = document.getElementById('sr-announcer');
    if (ann) {
      ann.textContent = '';
      setTimeout(() => { ann.textContent = txt; }, 50);
    }
  }

  function initOtaUpdater() {
    const updateDialog = document.getElementById('update-dialog');
    const btnCheckUpdates = document.getElementById('btn-check-updates');
    const btnCloseUpdateDialog = document.getElementById('btn-close-update-dialog');
    const btnDismissUpdateDialog = document.getElementById('btn-dismiss-update-dialog');
    const btnUpdateCheck = document.getElementById('btn-update-check');
    const btnUpdateDownload = document.getElementById('btn-update-download');
    const btnOpenInstallPermission = document.getElementById('btn-open-install-permission');
    const updateCurrentVersion = document.getElementById('update-current-version');
    const updateLatestVersion = document.getElementById('update-latest-version');
    const updateStatusMessage = document.getElementById('update-status-message');
    const updateReleaseNotesContainer = document.getElementById('update-release-notes-container');
    const updateReleaseNotes = document.getElementById('update-release-notes');
    const updateProgressContainer = document.getElementById('update-progress-container');
    const updateProgressbar = document.getElementById('update-progressbar');
    const updateProgressPercent = document.getElementById('update-progress-percent');
    const updatePermissionBox = document.getElementById('update-permission-box');
    const drawerUpdateBadge = document.getElementById('drawer-update-badge');
    const drawerEl = document.getElementById('app-drawer');

    let currentUpdateAvailable = false;
    let currentUpdateDownloadUrl = '';
    let lastAnnouncedProgressMilestone = 0;

    async function openUpdateDialog() {
      if (!updateDialog) return;
      if (drawerEl && drawerEl.classList && drawerEl.classList.contains('open')) {
        if (typeof window.toggleAppDrawer === 'function') {
          window.toggleAppDrawer(false);
        }
      }
      if (typeof updateDialog.showModal === 'function') {
        updateDialog.showModal();
      }
      announce('تم فتح نافذة تحديث التطبيق');

      const currentVer = (window.AntigravityBridge && typeof window.AntigravityBridge.getAppVersion === 'function')
        ? await window.AntigravityBridge.getAppVersion()
        : 'غير متاح';
      if (updateCurrentVersion) {
        updateCurrentVersion.textContent = currentVer;
      }

      checkAndShowInstallPermissionWarning();
      triggerUpdateCheck();
    }
    window.openUpdateDialog = openUpdateDialog;

    async function checkAndShowInstallPermissionWarning() {
      if (!updatePermissionBox) return;
      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        const canInstall = await window.AntigravityBridge.canInstallUnknownApps();
        updatePermissionBox.style.display = canInstall ? 'none' : 'block';
      } else {
        updatePermissionBox.style.display = 'none';
      }
    }

    function triggerUpdateCheck() {
      if (btnUpdateCheck) btnUpdateCheck.disabled = true;
      if (btnUpdateDownload) btnUpdateDownload.style.display = 'none';
      if (updateProgressContainer) updateProgressContainer.style.display = 'none';
      if (updateReleaseNotesContainer) updateReleaseNotesContainer.style.display = 'none';
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'جاري البحث عن تحديثات جديدة...';
      }
      announce('جاري البحث عن تحديثات جديدة');

      if (window.AntigravityBridge && typeof window.AntigravityBridge.checkForUpdate === 'function') {
        window.AntigravityBridge.checkForUpdate();
      } else {
        window.onUpdateCheckError({error: 'فحص إصدار Android متاح داخل التطبيق فقط.'});
      }
    }

    window.onUpdateCheckResult = function(info) {
      if (btnUpdateCheck) btnUpdateCheck.disabled = false;
      if (!info) return;

      if (updateLatestVersion) {
        updateLatestVersion.textContent = info.latestVersion || '--';
      }

      if (info.hasUpdate) {
        if (drawerUpdateBadge) drawerUpdateBadge.style.display = 'inline-block';
        currentUpdateAvailable = info.hasUpdate === true;
        currentUpdateDownloadUrl = info.downloadUrl || '';

        if (updateStatusMessage) {
          updateStatusMessage.textContent = 'يوجد تحديث جديد متاح: الإصدار ' + (info.latestVersion || '');
        }

        if (info.releaseNotes && updateReleaseNotes && updateReleaseNotesContainer) {
          updateReleaseNotes.textContent = info.releaseNotes;
          updateReleaseNotesContainer.style.display = 'block';
        }

        if (btnUpdateDownload) {
          btnUpdateDownload.style.display = 'inline-block';
        }

        announce('تحديث جديد متاح. الإصدار ' + info.latestVersion + '. اضغط زر التنزيل والتثبيت للمتابعة.');
      } else {
        if (updateStatusMessage) {
          updateStatusMessage.textContent = 'أنت تستخدم أحدث إصدار بالفعل (' + (info.currentVersion || '') + '). لا توجد تحديثات جديدة.';
        }
        announce('أنت تستخدم أحدث إصدار بالفعل. لا توجد تحديثات جديدة.');
      }
    };

    window.onUpdateCheckError = function(err) {
      if (btnUpdateCheck) btnUpdateCheck.disabled = false;
      const msg = (err && err.error) ? err.error : 'فشل التحقق من التحديثات';
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'تعذر فحص التحديثات: ' + msg;
      }
      announce('تعذر فحص التحديثات. ' + msg);
    };

    async function startDownloadingUpdate() {
      if (!currentUpdateAvailable) {
        announce('لم يُتحقق من وجود حزمة ترقية.');
        return;
      }

      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        if (!await window.AntigravityBridge.canInstallUnknownApps()) {
          checkAndShowInstallPermissionWarning();
          announce('يرجى السماح بتثبيت التطبيقات من الإعدادات قبل التثبيت');
          return;
        }
      }

      if (btnUpdateDownload) btnUpdateDownload.style.display = 'none';
      if (btnUpdateCheck) btnUpdateCheck.disabled = true;

      if (updateProgressContainer) {
        updateProgressContainer.style.display = 'flex';
      }
      if (updateProgressbar) {
        updateProgressbar.setAttribute('aria-valuenow', '0');
        updateProgressbar.style.width = '0%';
      }
      if (updateProgressPercent) {
        updateProgressPercent.textContent = '0%';
      }
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'جاري تنزيل ملف التحديث...';
      }
      lastAnnouncedProgressMilestone = 0;
      announce('بدء تنزيل حزمة التحديث');

      if (window.AntigravityBridge && typeof window.AntigravityBridge.startUpdateDownload === 'function') {
        try {
          if (currentUpdateDownloadUrl) {
            window.AntigravityBridge.startUpdateDownload(currentUpdateDownloadUrl);
          } else {
            window.AntigravityBridge.startUpdateDownload();
          }
        } catch (callErr) {
          try { window.AntigravityBridge.startUpdateDownload(); } catch (ignored) {}
        }
      } else {
        window.onUpdateCheckError({error: 'تنزيل حزمة Android متاح داخل التطبيق فقط.'});
        if (updateProgressContainer) updateProgressContainer.style.display = 'none';
      }
    }

    window.onUpdateProgress = function(percent, bytesDownloaded, totalBytes) {
      const p = Math.max(0, Math.min(100, percent));
      if (updateProgressbar) {
        updateProgressbar.setAttribute('aria-valuenow', p.toString());
        updateProgressbar.style.width = p + '%';
      }
      if (updateProgressPercent) {
        updateProgressPercent.textContent = p + '%';
      }

      if (p >= 75 && lastAnnouncedProgressMilestone < 75) {
        lastAnnouncedProgressMilestone = 75;
        announce('اكتمل تنزيل 75 في المائة من التحديث');
      } else if (p >= 50 && lastAnnouncedProgressMilestone < 50) {
        lastAnnouncedProgressMilestone = 50;
        announce('اكتمل تنزيل 50 في المائة من التحديث');
      } else if (p >= 25 && lastAnnouncedProgressMilestone < 25) {
        lastAnnouncedProgressMilestone = 25;
        announce('اكتمل تنزيل 25 في المائة من التحديث');
      }
    };

    window.onUpdateDownloadComplete = function() {
      if (updateProgressbar) {
        updateProgressbar.setAttribute('aria-valuenow', '100');
        updateProgressbar.style.width = '100%';
      }
      if (updateProgressPercent) {
        updateProgressPercent.textContent = '100%';
      }
      if (btnUpdateCheck) btnUpdateCheck.disabled = false;
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'اكتمل تنزيل التحديث بنسبة 100%. جاري تشغيل مثبت الحزم...';
      }
      announce('اكتمل تنزيل التحديث بنسبة 100 في المائة. جاري فتح مثبت الحزم لتثبيت الإصدار الجديد.');
    };

    window.onUpdateDownloadError = function(err) {
      if (btnUpdateCheck) btnUpdateCheck.disabled = false;
      if (btnUpdateDownload) btnUpdateDownload.style.display = 'inline-block';
      const msg = (err && err.error) ? err.error : 'خطأ أثناء تنزيل التحديث';
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'فشل تنزيل التحديث: ' + msg;
      }
      announce('فشل تنزيل التحديث. ' + msg);
    };

    if (btnCheckUpdates) {
      btnCheckUpdates.addEventListener('click', openUpdateDialog);
    }
    if (btnCloseUpdateDialog && updateDialog) {
      btnCloseUpdateDialog.addEventListener('click', () => updateDialog.close());
    }
    if (btnDismissUpdateDialog && updateDialog) {
      btnDismissUpdateDialog.addEventListener('click', () => updateDialog.close());
    }
    if (btnUpdateCheck) {
      btnUpdateCheck.addEventListener('click', triggerUpdateCheck);
    }
    if (btnUpdateDownload) {
      btnUpdateDownload.addEventListener('click', startDownloadingUpdate);
    }
    if (btnOpenInstallPermission) {
      btnOpenInstallPermission.addEventListener('click', () => {
        if (window.AntigravityBridge && typeof window.AntigravityBridge.openInstallPermissionSettings === 'function') {
          window.AntigravityBridge.openInstallPermissionSettings().catch(error => announce(error.message));
          announce('فتح إعدادات تثبيت التطبيقات');
        }
      });
    }
  }

  // Auto-init on DOM readiness
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initOtaUpdater);
    } else {
      initOtaUpdater();
    }
  }

  return {
    initOtaUpdater,
    openUpdateDialog: window.openUpdateDialog,
    onUpdateCheckResult: window.onUpdateCheckResult,
    onUpdateCheckError: window.onUpdateCheckError,
    onUpdateProgress: window.onUpdateProgress,
    onUpdateDownloadComplete: window.onUpdateDownloadComplete,
    onUpdateDownloadError: window.onUpdateDownloadError
  };
}));
