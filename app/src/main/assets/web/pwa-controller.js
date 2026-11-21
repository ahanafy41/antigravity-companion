/**
 * Antigravity Companion App - PWA Installation & LifeCycle Controller
 * Clean Architecture Modular Engine
 *
 * Manages Progressive Web App (PWA) installation prompts, screen visibility telemetry,
 * background periodic polling, sound tones preferences, and cold-start session auto-hydration.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PwaController = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function createPwaController(options) {
    const opts = options || {};
    let doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const announce = opts.announce || function (msg) {
      if (typeof console !== 'undefined') console.log('[Announce]', msg);
    };
    const playStartChime = opts.playStartChime || function () {};
    const fetchApi = opts.fetchApi || (typeof window !== 'undefined' && window.mainV1Fetch ? window.mainV1Fetch : (typeof fetch !== 'undefined' ? fetch : null));
    const resumeConversation = opts.resumeConversation || async function () {};
    const syncActiveConversationMessages = opts.syncActiveConversationMessages || async function () {};
    const getCurrentConversationId = opts.getCurrentConversationId || function () { return ''; };
    const getIsAiGenerating = opts.getIsAiGenerating || function () { return false; };
    const getForceNewSession = opts.getForceNewSession || function () { return false; };
    const updateSystemUsage = opts.updateSystemUsage || function () {};

    let deferredInstallPrompt = null;
    let isAppExplicitlyMinimized = false;
    let pollInterval = null;
    let usageInterval = null;
    let pollCycleCounter = 0;

    // DOM Elements
    let btnInstallApp = null;
    let tonesButton = null;
    let valTasksCountDrawer = null;
    let tasksMonitorDialog = null;

    function bindDom(customDoc) {
      if (customDoc) doc = customDoc;
      if (!doc) return;

      btnInstallApp = doc.getElementById('btn-install-app');
      tonesButton = doc.getElementById('btn-toggle-tones');
      valTasksCountDrawer = doc.getElementById('val-tasks-count-drawer');
      tasksMonitorDialog = doc.getElementById('tasks-monitor-dialog');

      if (typeof window !== 'undefined') {
        window.addEventListener('beforeinstallprompt', (e) => {
          if (e.preventDefault) e.preventDefault();
          deferredInstallPrompt = e;
          if (btnInstallApp) {
            btnInstallApp.style.display = 'inline-flex';
            announce('يتوفر خيار تثبيت تطبيق Antigravity على هاتفك');
          }
        });

        window.addEventListener('companion-native-visibility', event => {
          setAppVisibility(event.detail?.visible === true);
        });

        window.setAppVisibility = setAppVisibility;

        window.addEventListener('focus', () => {
          if (isAppExplicitlyMinimized) return;
          reportVisibility(true);
        });
        window.addEventListener('blur', () => {
          if (isAppExplicitlyMinimized) return;
          reportVisibility(false);
        });
      }

      if (btnInstallApp) {
        btnInstallApp.addEventListener('click', async () => {
          if (!deferredInstallPrompt) {
            announce('يمكنك تثبيت التطبيق من قائمة خيارات المتصفح (إضافة إلى الشاشة الرئيسية)');
            return;
          }
          if (typeof deferredInstallPrompt.prompt === 'function') {
            deferredInstallPrompt.prompt();
          }
          try {
            const choice = await deferredInstallPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
              announce('تم بدء تثبيت التطبيق بنجاح');
              btnInstallApp.style.display = 'none';
            }
          } catch (_) {}
          deferredInstallPrompt = null;
        });
      }

      if (tonesButton) {
        tonesButton.addEventListener('click', async () => {
          const prefs = (typeof window !== 'undefined' && window.mainV1 && typeof window.mainV1.preferences === 'function') ? window.mainV1.preferences() : {};
          const currentlyEnabled = (prefs.tones_enabled !== false && prefs.sound !== false);
          const newEnabled = !currentlyEnabled;
          try {
            const response = await fetchApi('/api/ai/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tones_enabled: newEnabled, sound: newEnabled })
            });
            if (response.ok) {
              tonesButton.setAttribute('aria-pressed', String(newEnabled));
              announce(newEnabled ? 'النغمات مفعلة.' : 'النغمات معطلة.');
              if (newEnabled) playStartChime();
            }
          } catch (_) {}
        });
      }

      if (doc.addEventListener) {
        doc.addEventListener('visibilitychange', () => {
          if (isAppExplicitlyMinimized) return;
          reportVisibility(doc.visibilityState === 'visible');
        });
      }
    }

    function reportVisibility(vis) {
      try {
        fetchApi('/api/client/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visible: !!vis })
        }).catch(() => {});
      } catch (e) {}
    }

    function setAppVisibility(vis) {
      isAppExplicitlyMinimized = !vis;
      reportVisibility(vis);
    }

    function startBackgroundPolling(intervalMs = 3500) {
      if (pollInterval) clearInterval(pollInterval);
      if (usageInterval) clearInterval(usageInterval);

      updateSystemUsage();
      usageInterval = setInterval(updateSystemUsage, 25000);

      pollInterval = setInterval(async () => {
        if (isAppExplicitlyMinimized) return;
        if (doc && (doc.hidden || doc.visibilityState !== 'visible')) return;

        reportVisibility(true);
        pollCycleCounter++;

        const isTasksOpen = Boolean(tasksMonitorDialog && tasksMonitorDialog.open);
        if (isTasksOpen || pollCycleCounter % 2 === 0) {
          try {
            const res = await fetchApi('/api/ai/tasks');
            if (res.ok) {
              const data = await res.json();
              const activeCount = typeof data.active_count === 'number' ? data.active_count : (data.tasks || []).filter(t => t.status === 'active').length;
              if (valTasksCountDrawer) {
                valTasksCountDrawer.textContent = activeCount;
              }
            }
          } catch (e) {}
        }

        const activeConvId = getCurrentConversationId();
        if (activeConvId && !getIsAiGenerating() && (pollCycleCounter % 2 === 0)) {
          try {
            await syncActiveConversationMessages();
          } catch (e) {}
        }
      }, intervalMs);
    }

    async function hydrateColdStart() {
      reportVisibility(doc ? doc.visibilityState === 'visible' : true);
      try {
        let activeConvId = null;
        let activeConvTitle = 'المهمة الجارية الحالية';
        try {
          const actRes = await fetchApi('/api/ai/runs/active');
          if (actRes.ok) {
            const actData = await actRes.json();
            if (actData.active_run && actData.active_run.conversation_id && actData.active_run.state === 'running') {
              activeConvId = actData.active_run.conversation_id;
            }
          }
        } catch (e) {}

        let savedConversation = (typeof window !== 'undefined' && window.mainV1 && typeof window.mainV1.currentConversation === 'function') ? window.mainV1.currentConversation() : null;
        if (!savedConversation) {
          try {
            if (typeof localStorage !== 'undefined') {
              savedConversation = localStorage.getItem('antigravity_last_active_conv');
            }
          } catch (e) {}
        }

        if (activeConvId) {
          await resumeConversation(activeConvId, activeConvTitle);
        } else if (savedConversation) {
          await resumeConversation(savedConversation, 'المحادثة المحفوظة');
        } else {
          // Cold-start auto-hydration: automatically open and render the most recent conversation
          const res = await fetchApi('/api/ai/conversations');
          if (res.ok) {
            const data = await res.json();
            const first = (data.conversations || [])[0];
            if (first && !getForceNewSession()) {
              await resumeConversation(first.id, first.title);
              announce('تم فتح آخر محادثة: ' + first.title);
            }
          }
        }
      } catch (e) {
        console.error('Cold start auto-hydration error:', e);
      }
    }

    function destroy() {
      if (pollInterval) clearInterval(pollInterval);
      if (usageInterval) clearInterval(usageInterval);
    }

    if (doc) {
      bindDom(doc);
    }

    return {
      bindDom: bindDom,
      reportVisibility: reportVisibility,
      setAppVisibility: setAppVisibility,
      startBackgroundPolling: startBackgroundPolling,
      hydrateColdStart: hydrateColdStart,
      destroy: destroy
    };
  }

  return {
    createPwaController: createPwaController
  };
});
