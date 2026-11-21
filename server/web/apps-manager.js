/**
 * Accessible Apps Manager for Antigravity Companion
 * Manages the persistent local applications repository, listing, launch, deletion,
 * search filtering, and integration with the Live Canvas runner.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppsManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return isoStr;
    }
  }

  function createAppsManager(options) {
    const opts = options || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : globalThis);
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    let announcer = opts.announcer || null;
    let canvasRunner = opts.canvasRunner || null;

    let appsList = [];
    let previousFocusedElement = null;
    let isInitialized = false;

    // DOM Elements
    let dialogEl = opts.dialogElement || (doc ? doc.getElementById('apps-dialog') : null);
    let listContainer = opts.listContainer || (doc ? doc.getElementById('apps-list-container') : null);
    let searchInput = opts.searchInput || (doc ? doc.getElementById('apps-search-input') : null);
    let countBadge = opts.countBadge || (doc ? doc.getElementById('val-apps-count-drawer') : null);
    let btnOpen = opts.btnOpen || (doc ? doc.getElementById('btn-open-apps') : null);
    let btnClose = opts.btnClose || (doc ? doc.getElementById('btn-close-apps') : null);
    let btnCloseTop = opts.btnCloseTop || (doc ? doc.getElementById('btn-close-apps-top') : null);

    function announce(text, isError) {
      if (typeof announcer === 'function') {
        announcer(text, isError);
      } else if (announcer && typeof announcer.announce === 'function') {
        announcer.announce(text, isError);
      } else if (win.Companion && typeof win.Companion.announce === 'function') {
        win.Companion.announce(text);
      } else if (win.console) {
        if (isError) win.console.error('[AppsManager]', text);
        else win.console.log('[AppsManager]', text);
      }
    }

    function captureFocus() {
      if (doc && doc.activeElement) {
        previousFocusedElement = doc.activeElement;
      }
    }

    function restoreFocus() {
      if (previousFocusedElement && doc && doc.contains(previousFocusedElement)) {
        try {
          previousFocusedElement.focus();
        } catch (_) {}
      } else if (btnOpen && doc && doc.contains(btnOpen)) {
        try {
          btnOpen.focus();
        } catch (_) {}
      }
      previousFocusedElement = null;
    }

    async function apiRequest(endpoint, method = 'GET', bodyData = null) {
      if (win.Companion && typeof win.Companion.request === 'function') {
        const reqOpts = { method: method };
        if (bodyData) reqOpts.body = bodyData;
        return await win.Companion.request(endpoint, reqOpts);
      }

      // Fallback to fetch with /api/v1 prefix
      const url = endpoint.startsWith('/') ? `/api/v1${endpoint}` : `/api/v1/${endpoint}`;
      const headers = { 'Accept': 'application/json' };
      if (bodyData) headers['Content-Type'] = 'application/json';

      const fetchOpts = {
        method: method,
        headers: headers,
        credentials: 'include'
      };
      if (bodyData) fetchOpts.body = JSON.stringify(bodyData);

      const res = await win.fetch(url, fetchOpts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP error ${res.status}`);
      }
      return data;
    }

    async function loadApps() {
      if (listContainer) {
        listContainer.innerHTML = '<div class="apps-loading-state" role="status">⏳ جاري تحميل التطبيقات...</div>';
      }

      try {
        const res = await apiRequest('/apps');
        appsList = (res && res.apps) ? res.apps : [];

        updateBadge(appsList.length);
        renderList(appsList);
        return appsList;
      } catch (err) {
        if (listContainer) {
          listContainer.innerHTML = `
            <div class="apps-error-state" role="alert">
              <p>تعذر تحميل قائمة التطبيقات: ${escapeHtml(err.message)}</p>
              <button type="button" class="btn btn-sm btn-retry-apps" id="btn-retry-apps" aria-label="إعادة محاولة تحميل التطبيقات">🔄 إعادة المحاولة</button>
            </div>
          `;
          const btnRetry = listContainer.querySelector('#btn-retry-apps');
          if (btnRetry) {
            btnRetry.addEventListener('click', () => loadApps());
          }
        }
        announce(`خطأ أثناء تحميل التطبيقات: ${err.message}`, true);
        return [];
      }
    }

    function updateBadge(count) {
      if (!countBadge && doc) {
        countBadge = doc.getElementById('val-apps-count-drawer');
      }
      if (countBadge) {
        countBadge.textContent = String(count);
        countBadge.setAttribute('aria-label', `${count} تطبيق`);
      }
    }

    function renderList(appsToDisplay) {
      if (!listContainer) return;

      listContainer.innerHTML = '';

      if (!appsToDisplay || appsToDisplay.length === 0) {
        listContainer.innerHTML = `
          <div class="apps-empty-state" role="status">
            <span class="empty-icon" aria-hidden="true" style="font-size: 2.2rem; display: block; margin-bottom: 8px;">📱✨</span>
            <p style="font-weight: bold; margin-bottom: 4px;">لا توجد تطبيقات محفوظة حتى الآن</p>
            <p style="color: var(--text-muted, #94a3b8); font-size: 0.9rem;">
              عندما يُنشئ المساعد الذكي أداة تفاعلية في الشات، اضغط على زر [⚡ تشغيل في الكانفاس] ثم اختر [💾 حفظ في التطبيقات] لتظهر هنا.
            </p>
          </div>
        `;
        return;
      }

      const frag = doc.createDocumentFragment();

      appsToDisplay.forEach((app) => {
        const card = doc.createElement('article');
        card.className = 'app-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `تطبيق ${app.title || app.id}`);

        const dateFormatted = formatDate(app.updated_at || app.created_at);

        card.innerHTML = `
          <div class="app-card-header">
            <div class="app-card-title-group">
              <span class="app-card-icon" aria-hidden="true">📱</span>
              <h3 class="app-card-title">${escapeHtml(app.title || 'تطبيق بدون اسم')}</h3>
            </div>
            ${dateFormatted ? `<span class="app-card-date" aria-label="تاريخ التحديث">${escapeHtml(dateFormatted)}</span>` : ''}
          </div>
          ${app.description ? `<p class="app-card-desc">${escapeHtml(app.description)}</p>` : ''}
          <div class="app-card-actions">
            <button type="button" class="btn btn-sm btn-primary btn-run-app" data-id="${escapeHtml(app.id)}" aria-label="تشغيل تطبيق ${escapeHtml(app.title || app.id)} في الكانفاس">
              ⚡ تشغيل في الكانفاس
            </button>
            <button type="button" class="btn btn-sm btn-edit-app" data-id="${escapeHtml(app.id)}" aria-label="تعديل تطبيق ${escapeHtml(app.title || app.id)} في المحادثة">
              🛠️ تعديل في الشات
            </button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-app" data-id="${escapeHtml(app.id)}" aria-label="حذف تطبيق ${escapeHtml(app.title || app.id)}">
              🗑️ حذف
            </button>
          </div>
        `;

        // Action Listeners
        const btnRun = card.querySelector('.btn-run-app');
        if (btnRun) {
          btnRun.addEventListener('click', () => runApp(app.id));
        }

        const btnEdit = card.querySelector('.btn-edit-app');
        if (btnEdit) {
          btnEdit.addEventListener('click', () => editInChat(app.id));
        }

        const btnDelete = card.querySelector('.btn-delete-app');
        if (btnDelete) {
          btnDelete.addEventListener('click', () => confirmDelete(app.id, app.title || app.id));
        }

        frag.appendChild(card);
      });

      listContainer.appendChild(frag);
    }

    async function getApp(appId) {
      if (!appId) throw new Error('معرف التطبيق مطلوب');
      const res = await apiRequest(`/apps/${encodeURIComponent(appId)}`);
      return res.app;
    }

    async function saveApp(appData) {
      if (!appData || !appData.title) {
        throw new Error('بيانات التطبيق غير مكتملة (العنوان مطلوب)');
      }

      const res = await apiRequest('/apps', 'POST', appData);
      if (res && res.app) {
        // Refresh local cache and list
        await loadApps();
        announce(`تم حفظ تطبيق ${res.app.title} بنجاح في التطبيقات`);
        return res.app;
      }
      return null;
    }

    async function deleteApp(appId) {
      if (!appId) throw new Error('معرف التطبيق مطلوب للحذف');
      await apiRequest(`/apps/${encodeURIComponent(appId)}`, 'DELETE');

      appsList = appsList.filter((a) => a.id !== appId);
      updateBadge(appsList.length);
      renderList(appsList);
      announce('تم حذف التطبيق بنجاح');
    }

    async function runApp(appId) {
      try {
        announce('جاري تحميل وتشغيل التطبيق...');
        const fullApp = await getApp(appId);
        if (!fullApp || (!fullApp.code && !fullApp.html)) {
          throw new Error('كود التطبيق غير موجود أو تالف');
        }

        closeDialog();

        if (canvasRunner && typeof canvasRunner.launch === 'function') {
          canvasRunner.launch(fullApp);
        } else if (win.CanvasRunner && typeof win.CanvasRunner.launch === 'function') {
          win.CanvasRunner.launch(fullApp);
        } else {
          throw new Error('محرك الكانفاس التفاعلي غير مهيأ');
        }
      } catch (err) {
        announce(`تعذر تشغيل التطبيق: ${err.message}`, true);
      }
    }

    async function editInChat(appId) {
      try {
        const fullApp = await getApp(appId);
        closeDialog();

        const input = (doc ? doc.getElementById('ai-prompt-input') : null) || (doc ? doc.getElementById('message-input') : null);
        if (input) {
          const prefix = `@تعديل_تطبيق: ${fullApp.title} (ID: ${fullApp.id})\n`;
          input.value = prefix;
          input.focus();
          // Position cursor at the end
          input.setSelectionRange(input.value.length, input.value.length);
        }
        announce(`تم فتح نموذج تعديل تطبيق ${fullApp.title} في المحادثة`);
      } catch (err) {
        announce(`تعذر تحضير التعديل: ${err.message}`, true);
      }
    }

    async function confirmDelete(appId, appTitle) {
      const confirmed = win.confirm(`هل أنت متأكد من رغبتك في حذف تطبيق "${appTitle}" نهائياً من مستودع التطبيقات؟`);
      if (confirmed) {
        try {
          await deleteApp(appId);
        } catch (err) {
          announce(`فشل حذف التطبيق: ${err.message}`, true);
        }
      }
    }

    function filterApps(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        renderList(appsList);
        return;
      }

      const filtered = appsList.filter((app) => {
        const t = (app.title || '').toLowerCase();
        const d = (app.description || '').toLowerCase();
        return t.includes(q) || d.includes(q);
      });

      renderList(filtered);
      if (filtered.length === 0) {
        announce('لم يتم العثور على أي تطبيق يطابق البحث');
      } else {
        announce(`تم العثور على ${filtered.length} تطبيق مطابق`);
      }
    }

    function openDialog() {
      captureFocus();
      if (!dialogEl && doc) dialogEl = doc.getElementById('apps-dialog');
      if (dialogEl && typeof dialogEl.showModal === 'function') {
        try {
          dialogEl.showModal();
        } catch (_) {
          dialogEl.open = true;
        }
      }
      announce('تم فتح مستودع التطبيقات');
      loadApps().then(() => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
      });
    }

    function closeDialog() {
      if (!dialogEl && doc) dialogEl = doc.getElementById('apps-dialog');
      if (dialogEl && typeof dialogEl.close === 'function') {
        try {
          dialogEl.close();
        } catch (_) {}
        dialogEl.open = false;
      }
      restoreFocus();
    }

    function init(customOpts) {
      if (customOpts) {
        if (customOpts.announcer) announcer = customOpts.announcer;
        if (customOpts.canvasRunner) canvasRunner = customOpts.canvasRunner;
      }

      if (!doc) return;

      dialogEl = dialogEl || doc.getElementById('apps-dialog');
      listContainer = listContainer || doc.getElementById('apps-list-container');
      searchInput = searchInput || doc.getElementById('apps-search-input');
      countBadge = countBadge || doc.getElementById('val-apps-count-drawer');
      btnOpen = btnOpen || doc.getElementById('btn-open-apps');
      btnClose = btnClose || doc.getElementById('btn-close-apps');
      btnCloseTop = btnCloseTop || doc.getElementById('btn-close-apps-top');

      if (btnOpen) {
        btnOpen.addEventListener('click', () => {
          const drawer = doc.getElementById('antigravity-drawer');
          if (drawer && typeof drawer.close === 'function') {
            try { drawer.close(); } catch (_) {}
          }
          openDialog();
        });
      }

      if (btnClose) {
        btnClose.addEventListener('click', closeDialog);
      }

      if (btnCloseTop) {
        btnCloseTop.addEventListener('click', closeDialog);
      }

      if (searchInput) {
        let debounceTimer = null;
        searchInput.addEventListener('input', (e) => {
          if (debounceTimer) win.clearTimeout(debounceTimer);
          debounceTimer = win.setTimeout(() => {
            filterApps(e.target.value);
          }, 250);
        });
      }

      // Initial silent background load to populate drawer badge count
      loadApps().catch(() => {});
      isInitialized = true;
    }

    return {
      init: init,
      loadApps: loadApps,
      getApp: getApp,
      saveApp: saveApp,
      deleteApp: deleteApp,
      runApp: runApp,
      editInChat: editInChat,
      filterApps: filterApps,
      renderList: renderList,
      openDialog: openDialog,
      closeDialog: closeDialog,
      updateBadge: updateBadge,
      getAppsList: () => appsList
    };
  }

  return {
    create: createAppsManager
  };
});
