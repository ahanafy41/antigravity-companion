/**
 * mcp-manager.js - Model Context Protocol (MCP) Manager & Auth Wizard for Antigravity Companion
 * Manages installed servers, approved catalog, OAuth device pairing, and talkback notifications.
 */

(function (root, factory) {
  const exportsObj = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (window) {
  'use strict';

  function escapeHtml(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  function playSuccessChime() {
    if (typeof window.playSuccessChime === 'function') window.playSuccessChime();
  }

  function playBeep(freq, dur) {
    if (typeof window.playBeep === 'function') window.playBeep(freq, dur);
  }

  function initMcpManager() {
    const mcpDialog = document.getElementById('mcp-dialog');
    const btnOpenMcp = document.getElementById('btn-open-mcp');
    const btnCloseMcp = document.getElementById('btn-close-mcp');
    const btnCloseMcpTop = document.getElementById('btn-close-mcp-top');
    const btnRefreshMcp = document.getElementById('btn-refresh-mcp');
    const mcpInstalledContainer = document.getElementById('mcp-installed-container');
    const mcpCatalogContainer = document.getElementById('mcp-catalog-container');
    const btnSubmitCustomMcp = document.getElementById('btn-submit-custom-mcp');
    const mcpCustomName = document.getElementById('mcp-custom-name');
    const mcpCustomType = document.getElementById('mcp-custom-type');
    const mcpCustomCommand = document.getElementById('mcp-custom-command');
    const mcpCustomArgs = document.getElementById('mcp-custom-args');
    const mcpCustomEnv = document.getElementById('mcp-custom-env');

    const mcpAuthDialog = document.getElementById('mcp-auth-dialog');
    const mcpAuthTargetName = document.getElementById('mcp-auth-target-name');
    const mcpAuthTargetType = document.getElementById('mcp-auth-target-type');
    const mcpAuthTargetDesc = document.getElementById('mcp-auth-target-desc');
    const mcpAuthTokenInput = document.getElementById('mcp-auth-token-input');
    const mcpAuthTokenHint = document.getElementById('mcp-auth-token-hint');
    const mcpAuthVarName = document.getElementById('mcp-auth-var-name');
    const mcpAuthEnvContainer = document.getElementById('mcp-auth-env-container');
    const mcpModeToken = document.getElementById('mcp-mode-token');
    const mcpModeDevice = document.getElementById('mcp-mode-device');
    const mcpAuthTabToken = document.getElementById('mcp-auth-tab-token');
    const mcpAuthTabDevice = document.getElementById('mcp-auth-tab-device');
    const btnToggleTokenVis = document.getElementById('btn-toggle-token-visibility');
    const btnRequestDeviceCode = document.getElementById('btn-request-device-code');
    const mcpDeviceDetailsBox = document.getElementById('mcp-device-details-box');
    const mcpDeviceUserCode = document.getElementById('mcp-device-user-code');
    const mcpDeviceLink = document.getElementById('mcp-device-link');
    const btnCopyDeviceCode = document.getElementById('btn-copy-device-code');
    const mcpAuthDeviceCodeInput = document.getElementById('mcp-auth-device-code-input');
    const mcpAuthStatus = document.getElementById('mcp-auth-status');
    const btnTestMcpAuth = document.getElementById('btn-test-mcp-auth');
    const btnSaveMcpAuth = document.getElementById('btn-save-mcp-auth');
    const btnCloseMcpAuth = document.getElementById('btn-close-mcp-auth');
    const btnCloseMcpAuthTop = document.getElementById('btn-close-mcp-auth-top');

    let currentAuthServer = null;
    let currentDeviceSession = null;

    function setMcpAuthStatus(msg, type = 'info') {
      if (!mcpAuthStatus) return;
      mcpAuthStatus.style.display = 'block';
      mcpAuthStatus.textContent = msg;
      if (type === 'success') {
        mcpAuthStatus.style.background = 'rgba(34, 197, 94, 0.15)';
        mcpAuthStatus.style.color = 'var(--accent-green)';
        mcpAuthStatus.style.border = '1px solid var(--accent-green)';
        playSuccessChime();
      } else if (type === 'error') {
        mcpAuthStatus.style.background = 'rgba(239, 68, 68, 0.15)';
        mcpAuthStatus.style.color = 'var(--accent-red)';
        mcpAuthStatus.style.border = '1px solid var(--accent-red)';
        playBeep(400, 0.2);
      } else {
        mcpAuthStatus.style.background = 'rgba(56, 189, 248, 0.1)';
        mcpAuthStatus.style.color = 'var(--accent-cyan)';
        mcpAuthStatus.style.border = '1px solid var(--accent-cyan)';
        playBeep(700, 0.06);
      }
      announce(msg);
    }

    async function loadMcpServers() {
      if (!mcpInstalledContainer || !mcpCatalogContainer) return;
      mcpInstalledContainer.innerHTML = '<div class="main-style-197">جاري فحص بروتوكولات MCP...</div>';
      mcpCatalogContainer.innerHTML = '<div class="main-style-197">جاري فحص الكتالوج المعتمد...</div>';

      try {
        if (typeof window.mainV1Fetch !== 'function') return;
        const res = await window.mainV1Fetch('/api/mcp/list');
        if (!res || !res.ok) throw new Error('فشل جلب قائمة بروتوكولات MCP');
        const data = await res.json();
        const installed = data.installed || [];
        const catalog = data.catalog || [];

        const installedMap = {};
        installed.forEach(s => { installedMap[s.name] = s; });

        if (installed.length === 0) {
          mcpInstalledContainer.innerHTML = '<div class="main-style-198">لا توجد بروتوكولات MCP مثبتة حالياً. يمكنك التثبيت من الكتالوج المعتمد أدناه بنقرة واحدة.</div>';
        } else {
          mcpInstalledContainer.innerHTML = '';
          installed.forEach(srv => {
            const card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-card); border:1px solid ' + (srv.enabled ? 'var(--accent-cyan)' : 'var(--border-main)') + '; border-radius:8px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
            card.setAttribute('role', 'listitem');

            const hasAuth = Boolean((srv.headers && srv.headers.Authorization) || (srv.env && Object.keys(srv.env).length > 0));

            const info = document.createElement('div');
            info.style.cssText = 'flex:1; min-width:200px;';
            info.innerHTML = `
              <div class="main-style-199">
                <strong class="main-style-200">${escapeHtml(srv.name)}</strong>
                <span class="${(srv.enabled) ? "main-style-201" : "main-style-202"}">
                  ${srv.enabled ? '🟢 مفعل (enabled)' : '⚪ معطل (disabled)'}
                </span>
                <span class="main-style-203">
                  ${escapeHtml(srv.type || 'stdio')}
                </span>
                <span class="${(hasAuth) ? "main-style-204" : "main-style-205"}">
                  ${hasAuth ? '🔑 موثق' : 'غير موثق'}
                </span>
              </div>
              <div class="main-style-206">
                ${escapeHtml(srv.command || srv.url || '')}
              </div>
            `;

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; align-items:center; gap:6px; flex-shrink:0; flex-wrap:wrap;';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn ' + (srv.enabled ? 'btn-danger' : 'btn-primary');
            toggleBtn.style.cssText = 'padding:4px 10px; font-size:0.82rem; min-height:32px;';
            toggleBtn.setAttribute('aria-label', (srv.enabled ? 'تعطيل بروتوكول ' : 'تفعيل بروتوكول ') + srv.name);
            toggleBtn.textContent = srv.enabled ? '⏸️ تعطيل' : '▶️ تفعيل';

            toggleBtn.addEventListener('click', async () => {
              await toggleMcpServer(srv.name, !srv.enabled, toggleBtn);
            });

            const authBtn = document.createElement('button');
            authBtn.className = 'btn';
            authBtn.style.cssText = 'padding:4px 10px; font-size:0.82rem; min-height:32px; background:rgba(56,189,248,0.12); color:var(--accent-cyan); border-color:var(--accent-cyan);';
            authBtn.setAttribute('aria-label', 'توثيق ومصادقة بروتوكول ' + srv.name);
            authBtn.textContent = '🔐 توثيق';

            authBtn.addEventListener('click', () => {
              openMcpAuthModal(srv);
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn';
            removeBtn.style.cssText = 'padding:4px 10px; font-size:0.82rem; min-height:32px; background:#2d1a20; color:var(--accent-red); border-color:var(--accent-red);';
            removeBtn.setAttribute('aria-label', 'حذف بروتوكول ' + srv.name);
            removeBtn.textContent = '🗑️ حذف';

            removeBtn.addEventListener('click', async () => {
              if (confirm('هل أنت متأكد من حذف بروتوكول MCP "' + srv.name + '"؟')) {
                await removeMcpServer(srv.name, removeBtn);
              }
            });

            actions.appendChild(toggleBtn);
            actions.appendChild(authBtn);
            actions.appendChild(removeBtn);
            card.appendChild(info);
            card.appendChild(actions);
            mcpInstalledContainer.appendChild(card);
          });
        }

        // Render Approved Catalog
        mcpCatalogContainer.innerHTML = '';
        catalog.forEach(item => {
          const isInstalled = !!installedMap[item.id];
          const installedItem = installedMap[item.id];
          const isEnabled = isInstalled && installedItem.enabled;

          const catCard = document.createElement('div');
          catCard.style.cssText = 'background:var(--bg-card); border:1px solid ' + (isInstalled ? 'var(--accent-green)' : 'var(--border-main)') + '; border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;';
          catCard.setAttribute('role', 'listitem');

          catCard.innerHTML = `
            <div>
              <div class="main-style-207">
                <div class="main-style-208">
                  <span aria-hidden="true" class="main-style-209">${item.icon || '🔌'}</span>
                  <strong class="main-style-210">${escapeHtml(item.name)}</strong>
                  <code class="main-style-211">${escapeHtml(item.id)}</code>
                </div>
                <span class="main-style-212">
                  ${escapeHtml(item.category || 'MCP')}
                </span>
              </div>
              <p class="main-style-213">
                ${escapeHtml(item.description)}
              </p>
              <div class="main-style-214">
                ${escapeHtml(item.command)}
              </div>
            </div>
          `;

          const actionRow = document.createElement('div');
          actionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:4px;';

          if (isInstalled) {
            actionRow.innerHTML = `
              <span class="main-style-215">
                ✓ مثبت (${isEnabled ? 'مفعل' : 'معطل'})
              </span>
            `;
            const quickToggleBtn = document.createElement('button');
            quickToggleBtn.className = 'btn ' + (isEnabled ? 'btn-danger' : 'btn-primary');
            quickToggleBtn.style.cssText = 'padding:3px 10px; font-size:0.8rem;';
            quickToggleBtn.setAttribute('aria-label', (isEnabled ? 'تعطيل ' : 'تفعيل ') + item.name);
            quickToggleBtn.textContent = isEnabled ? 'تعطيل' : 'تفعيل';
            quickToggleBtn.addEventListener('click', async () => {
              await toggleMcpServer(item.id, !isEnabled, quickToggleBtn);
            });

            const quickAuthBtn = document.createElement('button');
            quickAuthBtn.className = 'btn btn-sm';
            quickAuthBtn.style.cssText = 'padding:3px 8px; font-size:0.8rem; background:rgba(56,189,248,0.15); color:var(--accent-cyan); border-color:var(--accent-cyan);';
            quickAuthBtn.setAttribute('aria-label', 'توثيق بروتوكول ' + item.name);
            quickAuthBtn.textContent = '🔐 توثيق';
            quickAuthBtn.addEventListener('click', () => {
              openMcpAuthModal(installedItem || item);
            });

            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex; gap:6px;';
            btnWrap.appendChild(quickToggleBtn);
            btnWrap.appendChild(quickAuthBtn);
            actionRow.appendChild(btnWrap);
          } else {
            actionRow.style.display = 'flex';
            actionRow.style.gap = '6px';

            const installBtn = document.createElement('button');
            installBtn.className = 'btn btn-primary';
            installBtn.style.cssText = 'flex:1; padding:6px 12px; font-size:0.85rem; font-weight:bold;';
            installBtn.setAttribute('aria-label', 'تثبيت بروتوكول ' + item.name);
            installBtn.textContent = '📥 تثبيت بنقرة واحدة';
            installBtn.addEventListener('click', async () => {
              await installMcpServer({
                name: item.id,
                command: item.command,
                type: 'stdio'
              }, installBtn, item.name);
            });
            actionRow.appendChild(installBtn);

            if (item.requires_auth) {
              const catAuthBtn = document.createElement('button');
              catAuthBtn.className = 'btn btn-sm';
              catAuthBtn.style.cssText = 'padding:6px 10px; font-size:0.82rem; background:rgba(56,189,248,0.15); color:var(--accent-cyan); border-color:var(--accent-cyan); flex-shrink:0;';
              catAuthBtn.setAttribute('aria-label', 'توثيق وتثبيت بروتوكول ' + item.name);
              catAuthBtn.textContent = '🔐 توثيق وتثبيت';
              catAuthBtn.addEventListener('click', () => {
                openMcpAuthModal(item);
              });
              actionRow.appendChild(catAuthBtn);
            }
          }

          catCard.appendChild(actionRow);
          mcpCatalogContainer.appendChild(catCard);
        });

        if (typeof window.syncInstalledMcpGlobally === 'function') {
          await window.syncInstalledMcpGlobally();
        }

      } catch (err) {
        console.error('Failed to load MCP servers:', err);
        mcpInstalledContainer.innerHTML = '<div class="main-style-196">تعذر تحميل الخوادم: ' + escapeHtml(err.message) + '</div>';
        mcpCatalogContainer.innerHTML = '<div class="main-style-196">تعذر تحميل الكتالوج</div>';
        announce('تعذر تحميل بروتوكولات MCP');
      }
    }
    window.loadMcpServers = loadMcpServers;

    async function installMcpServer(payload, triggerBtn, displayName) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري التثبيت...';
      }
      announce('جاري تثبيت بروتوكول MCP: ' + (displayName || payload.name));
      playBeep(600, 0.08);

      try {
        const res = await window.mainV1Fetch('/api/mcp/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'ok') {
          playSuccessChime();
          announce('تم تثبيت بروتوكول ' + (displayName || payload.name) + ' بنجاح');
          if (typeof window.syncInstalledMcpGlobally === 'function') await window.syncInstalledMcpGlobally();
          await loadMcpServers();
          return true;
        } else {
          playBeep(400, 0.2);
          const msg = resData.error || 'فشل التثبيت';
          announce('خطأ في تثبيت البروتوكول: ' + msg);
          alert('خطأ أثناء التثبيت: ' + msg);
          if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.textContent = '📥 تثبيت بنقرة واحدة';
          }
        }
      } catch (err) {
        playBeep(400, 0.2);
        announce('فشل الاتصال بالخادم أثناء التثبيت: ' + err.message);
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.textContent = '📥 تثبيت بنقرة واحدة';
        }
      }
      return false;
    }
    window.installMcpServer = installMcpServer;

    async function toggleMcpServer(name, nextState, triggerBtn) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري...';
      }
      playBeep(700, 0.06);

      try {
        const res = await window.mainV1Fetch('/api/mcp/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, enable: nextState })
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'ok') {
          playSuccessChime();
          const act = nextState ? 'تم تفعيل بروتوكول ' : 'تم تعطيل بروتوكول ';
          announce(act + name);
          if (typeof window.syncInstalledMcpGlobally === 'function') await window.syncInstalledMcpGlobally();
          await loadMcpServers();
        } else {
          playBeep(400, 0.2);
          announce('خطأ: ' + (resData.error || 'تعذر تعديل الحالة'));
          if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.textContent = nextState ? '▶️ تفعيل' : '⏸️ تعطيل';
          }
        }
      } catch (err) {
        playBeep(400, 0.2);
        announce('خطأ اتصال: ' + err.message);
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.textContent = nextState ? '▶️ تفعيل' : '⏸️ تعطيل';
        }
      }
    }
    window.toggleMcpServer = toggleMcpServer;

    async function removeMcpServer(name, triggerBtn) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري الحذف...';
      }
      announce('جاري حذف بروتوكول ' + name);

      try {
        const res = await window.mainV1Fetch('/api/mcp/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'ok') {
          playSuccessChime();
          announce('تم حذف بروتوكول ' + name + ' بنجاح');
          if (typeof window.syncInstalledMcpGlobally === 'function') await window.syncInstalledMcpGlobally();
          await loadMcpServers();
        } else {
          playBeep(400, 0.2);
          announce('خطأ أثناء الحذف: ' + (resData.error || 'فشل الحذف'));
          if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.textContent = '🗑️ حذف';
          }
        }
      } catch (err) {
        playBeep(400, 0.2);
        announce('خطأ اتصال: ' + err.message);
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.textContent = '🗑️ حذف';
        }
      }
    }
    window.removeMcpServer = removeMcpServer;

    async function openMcpAuthModal(serverOrItem) {
      if (!mcpAuthDialog) return;
      currentAuthServer = serverOrItem;
      currentDeviceSession = null;
      const name = serverOrItem.name || serverOrItem.id;
      if (mcpAuthTargetName) mcpAuthTargetName.textContent = name;
      if (mcpAuthTargetDesc) mcpAuthTargetDesc.textContent = 'المصادقة في طرفية agy؛ لا تجمع الواجهة رموز الحساب. إعداد OAuth يطبق عند إعادة تحميل CLI.';
      if (mcpModeToken) mcpModeToken.disabled = true;
      if (mcpModeDevice) {
        mcpModeDevice.disabled = true;
        mcpModeDevice.checked = true;
      }
      if (mcpAuthTabToken) mcpAuthTabToken.style.display = 'none';
      if (mcpAuthTabDevice) mcpAuthTabDevice.style.display = 'flex';
      if (mcpDeviceDetailsBox) mcpDeviceDetailsBox.style.display = 'none';
      if (mcpAuthDeviceCodeInput) mcpAuthDeviceCodeInput.disabled = true;
      if (btnSaveMcpAuth) btnSaveMcpAuth.disabled = true;
      if (btnRequestDeviceCode) {
        btnRequestDeviceCode.textContent = 'إتمام المصادقة في طرفية agy';
        btnRequestDeviceCode.setAttribute('aria-label', 'إتمام مصادقة MCP في طرفية agy');
      }

      document.getElementById('mcp-oauth-editor')?.remove();
      const editor = document.createElement('fieldset');
      editor.id = 'mcp-oauth-editor';
      const legend = document.createElement('legend'); legend.textContent = 'إعداد عميل OAuth'; editor.append(legend);
      const fields = {};
      for (const [key, label, type] of [['client_id', 'Client ID الجديد (الفارغ يحفظ الموجود)', 'text'],
        ['client_secret', 'Client Secret الجديد (الفارغ يحفظ الموجود)', 'password'],
        ['clear_client_secret', 'محو السر المحفوظ صراحةً', 'checkbox']]) {
        const input = document.createElement('input'); input.type = type; input.id = 'oauth-' + key;
        input.autocomplete = 'off';
        const caption = document.createElement('label'); caption.htmlFor = input.id; caption.textContent = label;
        editor.append(caption, input); fields[key] = input;
      }
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'حفظ إعداد OAuth'; save.disabled = true; editor.append(save);
      if (mcpAuthTabDevice) mcpAuthTabDevice.append(editor);
      if (typeof mcpAuthDialog.showModal === 'function') mcpAuthDialog.showModal();
      if (btnRequestDeviceCode) btnRequestDeviceCode.focus();

      let revision;
      try {
        const response = await window.mainV1Fetch('/api/mcp/oauth?name=' + encodeURIComponent(name));
        if (!response.ok) { setMcpAuthStatus((await response.json()).error, 'error'); return; }
        const ownership = await response.json(); revision = ownership.revision;
        save.disabled = false;
        setMcpAuthStatus('المالك: ' + ownership.scope + '. السر محفوظ: ' + (ownership.has_client_secret ? 'نعم' : 'لا'), 'info');
        save.addEventListener('click', async () => {
          const oauth = {};
          for (const key of ['client_id', 'client_secret']) if (fields[key].value) oauth[key] = fields[key].value;
          if (fields.clear_client_secret.checked) oauth.clear_client_secret = true;
          const written = await window.mainV1Fetch('/api/mcp/oauth', {method: 'PATCH', body: JSON.stringify({name, revision, oauth})});
          const outcome = await written.json();
          if (!written.ok) { setMcpAuthStatus(outcome.error, 'error'); return; }
          revision = outcome.revision;
          fields.client_secret.value = ''; fields.clear_client_secret.checked = false;
          setMcpAuthStatus('حُفظ إعداد OAuth في نطاق مالكه؛ لا يثبت ذلك مصادقة الحساب.', 'info');
        });
      } catch (err) {
        setMcpAuthStatus('تعذر فحص ملكية OAuth: ' + err.message, 'error');
      }
    }
    window.openMcpAuthModal = openMcpAuthModal;

    if (btnOpenMcp && mcpDialog) {
      btnOpenMcp.addEventListener('click', async () => {
        mcpDialog.showModal();
        announce('تم فتح نافذة إدارة بروتوكولات MCP');
        await loadMcpServers();
      });
    }
    if (btnCloseMcp && mcpDialog) {
      btnCloseMcp.addEventListener('click', () => mcpDialog.close());
    }
    if (btnCloseMcpTop && mcpDialog) {
      btnCloseMcpTop.addEventListener('click', () => mcpDialog.close());
    }
    if (btnRefreshMcp) {
      btnRefreshMcp.addEventListener('click', async () => {
        playBeep(750, 0.08);
        announce('جاري تحديث قائمة خوادم MCP');
        await loadMcpServers();
      });
    }

    if (btnCloseMcpAuth && mcpAuthDialog) {
      btnCloseMcpAuth.addEventListener('click', () => mcpAuthDialog.close());
    }
    if (btnCloseMcpAuthTop && mcpAuthDialog) {
      btnCloseMcpAuthTop.addEventListener('click', () => mcpAuthDialog.close());
    }
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMcpManager);
    } else {
      initMcpManager();
    }
  }

  return {
    initMcpManager,
    loadMcpServers: window.loadMcpServers,
    openMcpAuthModal: window.openMcpAuthModal,
    installMcpServer: window.installMcpServer,
    toggleMcpServer: window.toggleMcpServer,
    removeMcpServer: window.removeMcpServer
  };
}));
