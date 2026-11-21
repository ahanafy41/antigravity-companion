/**
 * Antigravity Companion App - Unified Native Controller: Drawer, Model Picker & Tasks Monitor
 * Clean Architecture Modular Engine
 *
 * Manages the slide-out navigation drawer, live model selection modal, reasoning effort toggles,
 * background scheduled tasks monitoring & cancellation, and live background turn polling sync.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NativeDrawerManager = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function defaultEscapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createNativeDrawerManager(options) {
    const opts = options || {};
    let doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const escapeHtml = opts.escapeHtml || defaultEscapeHtml;
    const announce = opts.announce || function (msg) {
      if (typeof console !== 'undefined') console.log('[Announce]', msg);
    };
    const playBeep = opts.playBeep || function () {};
    const playSuccessChime = opts.playSuccessChime || function () {};
    const fetchApi = opts.fetchApi || (typeof window !== 'undefined' && window.mainV1Fetch ? window.mainV1Fetch : (typeof fetch !== 'undefined' ? fetch : null));
    const renderMarkdown = opts.renderMarkdown || function (s) { return s; };
    const getCurrentConversationId = opts.getCurrentConversationId || function () { return ''; };
    const getIsAiGenerating = opts.getIsAiGenerating || function () { return false; };
    const getForceNewSession = opts.getForceNewSession || function () { return false; };
    const knownArtifacts = opts.knownArtifacts || new Map();
    const updateArtifactsUI = opts.updateArtifactsUI || function () {};
    const createArtifactCard = opts.createArtifactCard || function () { return (doc || document).createElement('div'); };

    let isSyncingConversation = false;
    let lastSyncedMessageCount = -1;

    // DOM references
    let drawerEl = null;
    let drawerBackdrop = null;
    let btnToggleDrawer = null;
    let btnCloseDrawer = null;
    let btnHeaderModel = null;
    let btnDrawerChangeModel = null;
    let valTasksCountDrawer = null;
    let valSubagentsCountDrawer = null;

    let modelPickerDialog = null;
    let modelPickerList = null;
    let btnCloseModelPicker = null;
    let btnCancelModelPicker = null;

    let tasksMonitorDialog = null;
    let tasksMonitorList = null;
    let btnCloseTasksMonitor = null;
    let btnDismissTasksMonitor = null;
    let btnRefreshTasksMonitor = null;
    let btnOpenTasks = null;

    let btnDrawerNewChat = null;
    let btnSaveChat = null;
    let btnClearChat = null;
    let btnHeaderDashboard = null;
    let btnOpenDashboard = null;
    let btnStopServer = null;
    let btnNewAiChat = null;
    let aiChatFeed = null;

    function bindDom(customDoc) {
      if (customDoc) doc = customDoc;
      if (!doc) return;

      drawerEl = doc.getElementById('antigravity-drawer');
      drawerBackdrop = doc.getElementById('drawer-backdrop');
      btnToggleDrawer = doc.getElementById('btn-toggle-drawer');
      btnCloseDrawer = doc.getElementById('btn-close-drawer');
      btnHeaderModel = doc.getElementById('btn-header-model');
      btnDrawerChangeModel = doc.getElementById('btn-drawer-change-model');
      valTasksCountDrawer = doc.getElementById('val-tasks-count-drawer');
      valSubagentsCountDrawer = doc.getElementById('val-subagents-count-drawer');

      modelPickerDialog = doc.getElementById('model-picker-dialog');
      modelPickerList = doc.getElementById('model-picker-list');
      btnCloseModelPicker = doc.getElementById('btn-close-model-picker');
      btnCancelModelPicker = doc.getElementById('btn-cancel-model-picker');

      tasksMonitorDialog = doc.getElementById('tasks-monitor-dialog');
      tasksMonitorList = doc.getElementById('tasks-monitor-list');
      btnCloseTasksMonitor = doc.getElementById('btn-close-tasks-monitor');
      btnDismissTasksMonitor = doc.getElementById('btn-dismiss-tasks-monitor');
      btnRefreshTasksMonitor = doc.getElementById('btn-refresh-tasks-monitor');
      btnOpenTasks = doc.getElementById('btn-open-tasks');

      btnDrawerNewChat = doc.getElementById('btn-drawer-new-chat');
      btnSaveChat = doc.getElementById('btn-save-chat');
      btnClearChat = doc.getElementById('btn-clear-chat');
      btnHeaderDashboard = doc.getElementById('btn-header-dashboard');
      btnOpenDashboard = doc.getElementById('btn-open-dashboard');
      btnStopServer = doc.getElementById('btn-stop-server');
      btnNewAiChat = doc.getElementById('btn-new-ai-chat');
      aiChatFeed = doc.getElementById('ai-chat-feed');

      if (btnToggleDrawer) {
        btnToggleDrawer.addEventListener('click', () => toggleAppDrawer());
      }
      if (btnCloseDrawer) {
        btnCloseDrawer.addEventListener('click', () => toggleAppDrawer(false));
      }
      if (drawerBackdrop) {
        drawerBackdrop.addEventListener('click', () => toggleAppDrawer(false));
      }

      if (btnHeaderModel) {
        btnHeaderModel.addEventListener('click', () => openModelPicker());
      }
      if (btnDrawerChangeModel) {
        btnDrawerChangeModel.addEventListener('click', () => openModelPicker());
      }
      if (btnCloseModelPicker && modelPickerDialog) {
        btnCloseModelPicker.addEventListener('click', () => {
          if (typeof modelPickerDialog.close === 'function') modelPickerDialog.close();
        });
      }
      if (btnCancelModelPicker && modelPickerDialog) {
        btnCancelModelPicker.addEventListener('click', () => {
          if (typeof modelPickerDialog.close === 'function') modelPickerDialog.close();
        });
      }

      if (btnOpenTasks) {
        btnOpenTasks.addEventListener('click', () => openTasksMonitor());
      }
      if (btnCloseTasksMonitor && tasksMonitorDialog) {
        btnCloseTasksMonitor.addEventListener('click', () => {
          if (typeof tasksMonitorDialog.close === 'function') tasksMonitorDialog.close();
        });
      }
      if (btnDismissTasksMonitor && tasksMonitorDialog) {
        btnDismissTasksMonitor.addEventListener('click', () => {
          if (typeof tasksMonitorDialog.close === 'function') tasksMonitorDialog.close();
        });
      }
      if (btnRefreshTasksMonitor) {
        btnRefreshTasksMonitor.addEventListener('click', () => refreshTasksMonitor());
      }

      // Reasoning Effort Buttons
      const drawerEffortButtons = doc.querySelectorAll ? doc.querySelectorAll('.btn-effort') : [];
      drawerEffortButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const effort = btn.getAttribute('data-effort');
          if (!effort) return;
          try {
            announce(`جارٍ ضبط مستوى التفكير على ${effort}...`);
            const res = await fetchApi('/api/ai/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ effort: effort })
            });
            if (res.ok) {
              const data = await res.json();
              syncReasoningEffortDisplay(effort);
              if (data?.settings?.model) {
                syncActiveModelDisplay(data.settings.model);
              }
              playBeep(880, 0.08);
              announce(`تم ضبط مستوى التفكير على ${effort} بنجاح`);
            }
          } catch (e) {
            announce('تعذر حفظ مستوى التفكير');
          }
        });
      });

      if (btnDrawerNewChat && btnNewAiChat) {
        btnDrawerNewChat.addEventListener('click', () => {
          toggleAppDrawer(false);
          btnNewAiChat.click();
        });
      }

      if (btnClearChat && btnNewAiChat) {
        btnClearChat.addEventListener('click', () => {
          toggleAppDrawer(false);
          btnNewAiChat.click();
        });
      }

      if (btnSaveChat) {
        btnSaveChat.addEventListener('click', () => {
          toggleAppDrawer(false);
          if (!aiChatFeed) return;
          const text = aiChatFeed.innerText || '';
          if (!text.trim()) {
            announce('المحادثة فارغة، لا يوجد ما يمكن تصديره');
            return;
          }
          const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = (doc || document).createElement('a');
          const d = new Date();
          const dateStr = d.toISOString().slice(0, 10);
          a.href = url;
          a.download = `antigravity-session-${dateStr}.md`;
          (doc || document).body.appendChild(a);
          a.click();
          (doc || document).body.removeChild(a);
          URL.revokeObjectURL(url);
          announce('تم تصدير وتنزيل المحادثة بنجاح');
        });
      }

      if (btnHeaderDashboard) {
        btnHeaderDashboard.addEventListener('click', () => {
          if (typeof window !== 'undefined' && window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
            window.AntigravityBridge.loadDashboardUrl();
          } else if (typeof window !== 'undefined') {
            window.location.href = '/start';
          }
        });
      }

      if (btnOpenDashboard) {
        btnOpenDashboard.addEventListener('click', () => {
          toggleAppDrawer(false);
          if (typeof window !== 'undefined' && window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
            window.AntigravityBridge.loadDashboardUrl();
          } else if (typeof window !== 'undefined') {
            window.location.href = '/start';
          }
        });
      }

      if (btnStopServer) {
        btnStopServer.addEventListener('click', async () => {
          toggleAppDrawer(false);
          announce('جاري إيقاف خادم تيرمكس نهائياً...');
          try {
            if (typeof window !== 'undefined' && window.AntigravityBridge && typeof window.AntigravityBridge.stopServer === 'function') {
              try { await window.AntigravityBridge.stopServer(); } catch (bridgeErr) { console.warn('Bridge stopServer error:', bridgeErr); }
            }
            try { await fetchApi('/api/shutdown', { method: 'POST' }); } catch (fetchErr) {}
          } catch (err) {
            announce('تعذر إيقاف الخادم: ' + (err?.message || err));
            return;
          }
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
              window.AntigravityBridge.loadDashboardUrl();
            } else if (typeof window !== 'undefined') {
              window.location.href = '/start';
            }
          }, 750);
        });
      }

      if (drawerEl && drawerEl.querySelectorAll) {
        drawerEl.querySelectorAll('button').forEach(btn => {
          if (btn.id !== 'btn-close-drawer' && !btn.classList.contains('btn-effort')) {
            btn.addEventListener('click', () => {
              setTimeout(() => {
                if (drawerEl.classList.contains('open')) {
                  toggleAppDrawer(false);
                }
              }, 80);
            });
          }
        });
      }

      if (doc.addEventListener) {
        doc.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            if (drawerEl && drawerEl.classList.contains('open')) {
              if (e.preventDefault) e.preventDefault();
              toggleAppDrawer(false);
            }
          }
        });
      }
    }

    function syncActiveModelDisplay(modelName) {
      if (!modelName) return;
      if (typeof window !== 'undefined') window._currentActiveModel = modelName;
      let displayName = modelName;
      if (typeof window !== 'undefined' && Array.isArray(window._cachedModels)) {
        const found = window._cachedModels.find(m => m.id === modelName || m.name === modelName);
        if (found && found.name) displayName = found.name;
      }
      if (doc) {
        const hModel = doc.getElementById('header-active-model-name');
        const dModel = doc.getElementById('drawer-active-model-name');
        const btnHModel = doc.getElementById('btn-header-model');
        if (hModel) hModel.textContent = displayName;
        if (dModel) dModel.textContent = displayName;
        if (btnHModel) {
          btnHModel.setAttribute('aria-label', `النموذج النشط حالياً: ${displayName}. اضغط لتغيير النموذج`);
        }
      }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('antigravity_active_model', displayName);
          localStorage.setItem('antigravity_active_model_id', modelName);
        }
      } catch (e) {}
    }

    function syncReasoningEffortDisplay(effort) {
      if (!effort || !doc) return;
      const buttons = doc.querySelectorAll ? doc.querySelectorAll('.btn-effort') : [];
      buttons.forEach(b => {
        const isActive = b.getAttribute('data-effort') === effort;
        if (b.classList && typeof b.classList.toggle === 'function') {
          b.classList.toggle('active', isActive);
        }
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    function toggleAppDrawer(forceOpen) {
      if (!drawerEl) return;
      const isOpen = drawerEl.classList.contains('open');
      const shouldOpen = (forceOpen !== undefined) ? forceOpen : !isOpen;

      if (shouldOpen) {
        drawerEl.classList.add('open');
        drawerEl.setAttribute('aria-hidden', 'false');
        drawerEl.removeAttribute('inert');
        if (drawerBackdrop) {
          drawerBackdrop.classList.add('open');
          drawerBackdrop.setAttribute('aria-hidden', 'false');
        }
        if (btnToggleDrawer) {
          btnToggleDrawer.setAttribute('aria-expanded', 'true');
        }
        updateDrawerStats();
        if (btnCloseDrawer) {
          setTimeout(() => { if (typeof btnCloseDrawer.focus === 'function') btnCloseDrawer.focus(); }, 60);
        }
        announce('تم فتح درج التطبيقات والقوائم الرئيسية');
        playBeep(620, 0.08);
      } else {
        drawerEl.classList.remove('open');
        drawerEl.setAttribute('aria-hidden', 'true');
        drawerEl.setAttribute('inert', '');
        if (drawerBackdrop) {
          drawerBackdrop.classList.remove('open');
          drawerBackdrop.setAttribute('aria-hidden', 'true');
        }
        if (btnToggleDrawer) {
          btnToggleDrawer.setAttribute('aria-expanded', 'false');
          if (typeof btnToggleDrawer.focus === 'function') btnToggleDrawer.focus();
        }
        announce('تم إغلاق درج التطبيقات');
        playBeep(420, 0.06);
      }
    }

    async function updateDrawerStats() {
      if (valSubagentsCountDrawer) {
        const count = (typeof window !== 'undefined' && Array.isArray(window.subagentRegistry)) ? window.subagentRegistry.length : 0;
        valSubagentsCountDrawer.textContent = count;
      }
      try {
        const res = await fetchApi('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = (data.tasks || []).length;
          }
        }
      } catch (e) {}
    }

    async function openModelPicker() {
      if (!modelPickerDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      if (typeof modelPickerDialog.showModal === 'function') modelPickerDialog.showModal();
      announce('تم فتح قائمة اختيار نماذج الذكاء الاصطناعي');

      let currentActive = 'gemini-3.8-flash-medium';
      try {
        if (typeof window !== 'undefined' && window._currentActiveModel) currentActive = window._currentActiveModel;
        else if (typeof localStorage !== 'undefined') currentActive = localStorage.getItem('antigravity_active_model_id') || currentActive;
      } catch (_) {}

      if (typeof window !== 'undefined' && Array.isArray(window._cachedModels) && window._cachedModels.length > 0) {
        renderModelPickerItems(window._cachedModels, currentActive);
      } else if (modelPickerList) {
        modelPickerList.innerHTML = '<div class="main-style-234">⏳ جارٍ جلب النماذج المتاحة...</div>';
      }

      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetchApi('/api/ai/models'),
          fetchApi('/api/ai/settings')
        ]);
        const models = modelsRes.ok ? await modelsRes.json() : ((typeof window !== 'undefined' && window._cachedModels) || []);
        if (Array.isArray(models) && models.length > 0 && typeof window !== 'undefined') window._cachedModels = models;
        const currentSettings = settingsRes.ok ? await settingsRes.json() : {};
        const activeModel = currentSettings.model || currentActive;
        renderModelPickerItems((typeof window !== 'undefined' && window._cachedModels) || models, activeModel);
      } catch (err) {
        if (typeof window === 'undefined' || !window._cachedModels || window._cachedModels.length === 0) {
          if (modelPickerList) {
            modelPickerList.innerHTML = '<div class="main-style-235">تعذر جلب النماذج الحية. تأكد من اتصال السيرفر.</div>';
          }
          announce('تعذر تحميل النماذج من السيرفر');
        }
      }
    }

    function renderModelPickerItems(models, activeModel) {
      if (!modelPickerList) return;
      if (!Array.isArray(models) || models.length === 0) {
        modelPickerList.innerHTML = '<p class="main-style-236">لم يتم العثور على نماذج متاحة حالياً.</p>';
        return;
      }
      const activeEl = doc ? doc.activeElement : null;
      const focusedModelId = activeEl ? activeEl.getAttribute('data-model-id') : null;
      const isInitialOpen = (modelPickerList.children.length === 0);

      modelPickerList.innerHTML = '';
      models.forEach((m) => {
        const isCurrent = (m.id === activeModel || m.name === activeModel);
        const card = (doc || document).createElement('button');
        card.type = 'button';
        card.setAttribute('data-model-id', m.id || m.name);
        card.className = 'model-picker-item' + (isCurrent ? ' selected' : '');
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
        card.setAttribute('aria-label', `${m.name}${isCurrent ? ' (مفعل حالياً)' : ''}`);
        card.style.cssText = `
          display:flex; flex-direction:column; width:100%; padding:10px 14px;
          border-radius:8px; border:1px solid ${isCurrent ? 'var(--accent-cyan)' : 'var(--border-main)'};
          background:${isCurrent ? 'rgba(88, 166, 255, 0.12)' : 'var(--bg-card)'};
          color:var(--text-main); cursor:pointer; text-align:right; font-family:inherit;
          transition:all 0.15s ease;
        `;
        card.innerHTML = `
          <div class="main-style-237">
            <strong class="${(isCurrent) ? "main-style-238" : "main-style-239"}">${escapeHtml(m.name)}</strong>
            <span class="badge ${(isCurrent) ? "main-style-240" : "main-style-243"}">
              ${isCurrent ? '✓ مفعل' : 'تفعيل'}
            </span>
          </div>
          <div class="main-style-244">${escapeHtml(m.id)}</div>
        `;
        card.addEventListener('click', async () => {
          await switchActiveModelDirectly(m.id || m.name, m.name);
        });
        modelPickerList.appendChild(card);
      });

      if (isInitialOpen) {
        const first = modelPickerList.querySelector('.model-picker-item');
        if (first && typeof first.focus === 'function') setTimeout(() => first.focus(), 50);
      } else if (focusedModelId) {
        const target = modelPickerList.querySelector(`[data-model-id="${focusedModelId}"]`);
        if (target && typeof target.focus === 'function') target.focus();
      }
    }

    async function switchActiveModelDirectly(modelId, modelName) {
      try {
        const label = modelName || modelId;
        announce(`جارٍ تفعيل نموذج ${label}...`);
        const res = await fetchApi('/api/ai/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId })
        });
        if (res.ok) {
          const resData = await res.json();
          const updatedEffort = resData?.settings?.effort;
          if (updatedEffort) {
            syncReasoningEffortDisplay(updatedEffort);
          }
          syncActiveModelDisplay(label);
          if (modelPickerDialog && typeof modelPickerDialog.close === 'function') modelPickerDialog.close();
          playBeep(880, 0.1);
          announce(`تم تفعيل نموذج ${label} بنجاح`);
        } else {
          announce('تعذر حفظ إعداد النموذج');
        }
      } catch (e) {
        announce('حدث خطأ أثناء تفعيل النموذج');
      }
    }

    async function openTasksMonitor() {
      if (!tasksMonitorDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      if (typeof tasksMonitorDialog.showModal === 'function') tasksMonitorDialog.showModal();
      announce('تم فتح نافذة متابعة المهام والمؤقتات المجدولة');
      await refreshTasksMonitor();
    }

    async function refreshTasksMonitor() {
      if (!tasksMonitorList) return;
      tasksMonitorList.innerHTML = '<div class="main-style-234">⏳ جارٍ فحص المهام والمؤقتات النشطة...</div>';
      try {
        const res = await fetchApi('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          const tasks = data.tasks || [];
          const activeCount = typeof data.active_count === 'number' ? data.active_count : tasks.filter(t => t.status === 'active').length;
          renderTasksList(tasks);
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = activeCount;
          }
        } else {
          tasksMonitorList.innerHTML = '<p class="main-style-245">تعذر جلب المهام من السيرفر</p>';
        }
      } catch (err) {
        tasksMonitorList.innerHTML = '<p class="main-style-245">خطأ في الاتصال بالخادم</p>';
      }
    }

    function renderTasksList(tasks) {
      if (!tasksMonitorList) return;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        tasksMonitorList.innerHTML = `
          <div class="main-style-246">
            <p class="main-style-247">لا توجد مؤقتات أو مهام مجدولة تعمل في الخلفية حالياً</p>
            <span class="main-style-248">يعرض هذا الموضع الأدوار المملوكة والرسائل التالية المحفوظة محليًا.</span>
          </div>
        `;
        return;
      }
      tasksMonitorList.innerHTML = '';
      tasks.forEach(t => {
        const item = (doc || document).createElement('div');
        item.className = 'task-monitor-item';
        item.style.cssText = 'padding:12px; border:1px solid var(--border-main); border-radius:8px; background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;';

        const isCompleted = t.status === 'completed';
        const isCancelled = ['cancelled', 'failed', 'interrupted'].includes(t.status);
        const isActive = !isCompleted && !isCancelled;

        let statusBadge = '';
        if (isActive) {
          const remText = typeof t.remaining_seconds === 'number' ? `باقي: ${t.remaining_seconds}ث` : 'نشطة';
          statusBadge = `<span class="badge main-style-249">⏳ قيد التشغيل (${escapeHtml(remText)})</span>`;
        } else if (isCompleted) {
          statusBadge = `<span class="badge main-style-250">✓ مكتملة</span>`;
        } else {
          statusBadge = `<span class="badge main-style-251">✕ تم الإلغاء</span>`;
        }

        const actionBtnHtml = isActive && t.cancellable !== false
          ? `<button type="button" class="btn btn-sm btn-danger btn-kill-task" data-task-id="${escapeHtml(t.id)}" aria-label="إلغاء المهمة ${escapeHtml(t.id)}">🛑 إلغاء</button>`
          : `<span>${escapeHtml(t.state || t.status)}</span>`;

        item.innerHTML = `
          <div class="main-style-253">
            <div class="main-style-10">
              <strong class="main-style-254">${escapeHtml(t.id || 'Task')}</strong>
              ${statusBadge}
            </div>
            <div class="main-style-75">${escapeHtml(t.prompt || t.description || 'مهمة في الخلفية')}</div>
            <div class="main-style-255">${t.cron ? 'Cron: ' + escapeHtml(t.cron) : (t.duration ? 'المدة: ' + t.duration + ' ثانية' : '')}</div>
          </div>
          ${actionBtnHtml}
        `;
        const killBtn = item.querySelector('.btn-kill-task');
        if (killBtn) {
          killBtn.addEventListener('click', async () => {
            const act = killBtn.getAttribute('data-action') || 'kill';
            await killScheduledTask(t.id, act);
          });
        }
        tasksMonitorList.appendChild(item);
      });
    }

    async function killScheduledTask(taskId, action = 'kill') {
      const confirmMsg = action === 'delete' ? `هل تريد حذف المهمة ${taskId} من السجل؟` : `هل أنت متأكد من إلغاء المهمة ${taskId}؟`;
      const confirmed = (typeof window !== 'undefined' && window.confirm) ? window.confirm(confirmMsg) : true;
      if (!confirmed) return;
      try {
        announce(action === 'delete' ? 'جارٍ حذف المهمة...' : `جارٍ إلغاء المهمة ${taskId}...`);
        const res = await fetchApi('/api/ai/tasks/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action, task_id: taskId })
        });
        if (res.ok) {
          announce(action === 'delete' ? 'تم الحذف' : `تم إلغاء المهمة ${taskId} بنجاح`);
          playBeep(400, 0.1);
          await refreshTasksMonitor();
        } else {
          announce('تعذر تنفيذ الإجراء');
        }
      } catch (e) {
        announce('حدث خطأ في الاتصال');
      }
    }

    async function syncActiveConversationMessages() {
      const activeConvId = getCurrentConversationId();
      if (!activeConvId || getIsAiGenerating() || isSyncingConversation || getForceNewSession()) return;
      isSyncingConversation = true;
      try {
        const res = await fetchApi('/api/ai/conversation?id=' + encodeURIComponent(activeConvId));
        if (!res.ok) return;
        const data = await res.json();
        const allMessages = data.messages || [];

        // Live sync artifacts in background polling
        let hasNewArt = false;
        if (data.artifacts && Array.isArray(data.artifacts)) {
          data.artifacts.forEach(art => {
            if (!knownArtifacts.has(art.name)) {
              knownArtifacts.set(art.name, art);
              hasNewArt = true;
            }
          });
          updateArtifactsUI(knownArtifacts.size);
          if (hasNewArt && aiChatFeed) {
            let sec = aiChatFeed.querySelector('.chat-artifacts-section');
            if (!sec) {
              sec = (doc || document).createElement('div');
              sec.className = 'chat-artifacts-section';
              sec.setAttribute('role', 'region');
              sec.setAttribute('aria-label', 'مستندات وخطط المحادثة (Artifacts)');
              sec.style.cssText = 'margin:12px 0; display:flex; flex-direction:column; gap:8px;';
              aiChatFeed.appendChild(sec);
            }
            data.artifacts.forEach(art => {
              if (!sec.querySelector(`[aria-label="مستند: ${art.name}"]`)) {
                sec.appendChild(createArtifactCard(art));
              }
            });
          }
        }

        if (allMessages.length === lastSyncedMessageCount && !hasNewArt) {
          return;
        }
        lastSyncedMessageCount = allMessages.length;

        const textAgentMsgs = allMessages.filter(m => m.role === 'agent' && ((m.text && m.text.trim()) || m.thinking));
        if (textAgentMsgs.length === 0) return;

        if (aiChatFeed) {
          const lastFeedCard = aiChatFeed.querySelector('.chat-message.ai-message:last-child');
          if (lastFeedCard) {
            const lastMsg = textAgentMsgs[textAgentMsgs.length - 1];
            if (lastMsg && lastMsg.id) {
              lastFeedCard.setAttribute('data-msg-id', lastMsg.id);
              if (lastMsg.time) lastFeedCard.setAttribute('data-msg-time', lastMsg.time);
            }
          }
        }
      } catch (e) {
      } finally {
        isSyncingConversation = false;
      }
    }

    if (doc) {
      bindDom(doc);
    }

    return {
      bindDom: bindDom,
      syncActiveModelDisplay: syncActiveModelDisplay,
      syncReasoningEffortDisplay: syncReasoningEffortDisplay,
      toggleAppDrawer: toggleAppDrawer,
      openModelPicker: openModelPicker,
      switchActiveModelDirectly: switchActiveModelDirectly,
      openTasksMonitor: openTasksMonitor,
      refreshTasksMonitor: refreshTasksMonitor,
      killScheduledTask: killScheduledTask,
      syncActiveConversationMessages: syncActiveConversationMessages
    };
  }

  return {
    createNativeDrawerManager: createNativeDrawerManager
  };
});
