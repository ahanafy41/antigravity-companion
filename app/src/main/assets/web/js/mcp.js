// ==============================================================================
// MCP (Model Context Protocol) & Token Pairing Wizard Controller
// Management, Catalog, Installation, Toggle, Custom Servers & Device Authentication
// ==============================================================================

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
const mcpCustomEnv = document.getElementById('mcp-custom-env');

    // ==========================================
    // MCP (MODEL CONTEXT PROTOCOL) CONTROLLER
    // ==========================================
    async function loadMcpServers() {
      if (!mcpInstalledContainer || !mcpCatalogContainer) return;
      mcpInstalledContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:14px;">جاري فحص بروتوكولات MCP...</div>';
      mcpCatalogContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:14px;">جاري فحص الكتالوج المعتمد...</div>';

      try {
        const res = await fetch('/api/mcp/list');
        if (!res.ok) throw new Error('فشل جلب قائمة بروتوكولات MCP');
        const data = await res.json();
        const installed = data.installed || [];
        const catalog = data.catalog || [];

        const installedMap = {};
        installed.forEach(s => { installedMap[s.name] = s; });

        // 1. Render Installed MCP Servers
        if (installed.length === 0) {
          mcpInstalledContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:14px; font-size:0.9rem;">لا توجد بروتوكولات MCP مثبتة حالياً. يمكنك التثبيت من الكتالوج المعتمد أدناه بنقرة واحدة.</div>';
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
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                <strong style="color:var(--text-main); font-size:0.98rem; font-family:monospace;">${escapeHtml(srv.name)}</strong>
                <span style="font-size:0.72rem; padding:2px 6px; border-radius:4px; font-weight:bold; background:${srv.enabled ? 'rgba(56,189,248,0.2); color:var(--accent-cyan);' : 'rgba(139,148,158,0.2); color:var(--text-muted);'}">
                  ${srv.enabled ? '🟢 مفعل (enabled)' : '⚪ معطل (disabled)'}
                </span>
                <span style="font-size:0.72rem; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.06); color:var(--text-muted); font-family:monospace;">
                  ${escapeHtml(srv.type || 'stdio')}
                </span>
                <span style="font-size:0.72rem; padding:1px 5px; border-radius:3px; font-weight:bold; background:${hasAuth ? 'rgba(34,197,94,0.15); color:var(--accent-green);' : 'rgba(255,255,255,0.06); color:var(--text-muted);'}">
                  ${hasAuth ? '🔑 موثق' : 'غير موثق'}
                </span>
              </div>
              <div style="font-size:0.8rem; color:var(--text-muted); word-break:break-all; font-family:monospace; direction:ltr; text-align:left;">
                ${escapeHtml(srv.command || srv.url || '')}
              </div>
            `;

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; align-items:center; gap:6px; flex-shrink:0; flex-wrap:wrap;';

            // Toggle Button
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn ' + (srv.enabled ? 'btn-danger' : 'btn-primary');
            toggleBtn.style.cssText = 'padding:4px 10px; font-size:0.82rem; min-height:32px;';
            toggleBtn.setAttribute('aria-label', (srv.enabled ? 'تعطيل بروتوكول ' : 'تفعيل بروتوكول ') + srv.name);
            toggleBtn.textContent = srv.enabled ? '⏸️ تعطيل' : '▶️ تفعيل';

            toggleBtn.addEventListener('click', async () => {
              await toggleMcpServer(srv.name, !srv.enabled, toggleBtn);
            });

            // Auth Button
            const authBtn = document.createElement('button');
            authBtn.className = 'btn';
            authBtn.style.cssText = 'padding:4px 10px; font-size:0.82rem; min-height:32px; background:rgba(56,189,248,0.12); color:var(--accent-cyan); border-color:var(--accent-cyan);';
            authBtn.setAttribute('aria-label', 'توثيق ومصادقة بروتوكول ' + srv.name);
            authBtn.textContent = '🔐 توثيق';

            authBtn.addEventListener('click', () => {
              openMcpAuthModal(srv);
            });

            // Remove Button
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

        // 2. Render Approved Catalog
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
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:1.2rem;" aria-hidden="true">${item.icon || '🔌'}</span>
                  <strong style="color:var(--text-main); font-size:0.95rem;">${escapeHtml(item.name)}</strong>
                  <code style="font-size:0.75rem; color:var(--accent-cyan);">${escapeHtml(item.id)}</code>
                </div>
                <span style="font-size:0.7rem; padding:1px 5px; border-radius:3px; background:rgba(255,255,255,0.06); color:var(--text-muted);">
                  ${escapeHtml(item.category || 'MCP')}
                </span>
              </div>
              <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4; margin:0 0 8px 0;">
                ${escapeHtml(item.description)}
              </p>
              <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; background:rgba(0,0,0,0.3); padding:4px 6px; border-radius:4px; word-break:break-all; direction:ltr; text-align:left;">
                ${escapeHtml(item.command)}
              </div>
            </div>
          `;

          const actionRow = document.createElement('div');
          actionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:4px;';

          if (isInstalled) {
            actionRow.innerHTML = `
              <span style="font-size:0.8rem; color:var(--accent-green); font-weight:bold;">
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
        mcpInstalledContainer.innerHTML = '<div style="color:var(--accent-red); padding:10px;">تعذر تحميل الخوادم: ' + escapeHtml(err.message) + '</div>';
        mcpCatalogContainer.innerHTML = '<div style="color:var(--accent-red); padding:10px;">تعذر تحميل الكتالوج</div>';
        announce('تعذر تحميل بروتوكولات MCP');
      }
    }

    async function installMcpServer(payload, triggerBtn, displayName) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري التثبيت...';
      }
      announce('جاري تثبيت بروتوكول MCP: ' + (displayName || payload.name));
      playBeep(600, 0.08);

      try {
        const res = await fetch('/api/mcp/install', {
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
    }

    async function toggleMcpServer(name, nextState, triggerBtn) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري...';
      }
      playBeep(700, 0.06);

      try {
        const res = await fetch('/api/mcp/toggle', {
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

    async function removeMcpServer(name, triggerBtn) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري الحذف...';
      }
      announce('جاري حذف بروتوكول ' + name);

      try {
        const res = await fetch('/api/mcp/remove', {
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

    if (btnSubmitCustomMcp) {
      btnSubmitCustomMcp.addEventListener('click', async () => {
        const name = (mcpCustomName ? mcpCustomName.value : '').trim();
        const type = (mcpCustomType ? mcpCustomType.value : 'stdio').trim();
        const command = (mcpCustomCommand ? mcpCustomCommand.value : '').trim();
        const envRaw = (mcpCustomEnv ? mcpCustomEnv.value : '').trim();

        if (!name) {
          announce('يرجى كتابة اسم البروتوكول');
          if (mcpCustomName) mcpCustomName.focus();
          return;
        }
        if (!command) {
          announce('يرجى كتابة أمر التشغيل أو الرابط الكامل');
          if (mcpCustomCommand) mcpCustomCommand.focus();
          return;
        }

        const envList = envRaw ? envRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        await installMcpServer({
          name: name,
          type: type,
          command: command,
          env: envList
        }, btnSubmitCustomMcp, name);

        if (mcpCustomName) mcpCustomName.value = '';
        if (mcpCustomCommand) mcpCustomCommand.value = '';
        if (mcpCustomEnv) mcpCustomEnv.value = '';
      });
    }

    // ==========================================
    // MCP AUTHENTICATION & TOKEN PAIRING WIZARD
    // ==========================================
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

    function openMcpAuthModal(serverOrItem) {
      if (!mcpAuthDialog) return;
      currentAuthServer = serverOrItem;
      currentDeviceSession = null;

      const name = serverOrItem.name || serverOrItem.id || 'mcp-server';
      const isHttp = (serverOrItem.type === 'http') || Boolean(serverOrItem.url);

      if (mcpAuthTargetName) mcpAuthTargetName.textContent = name;
      if (mcpAuthTargetType) mcpAuthTargetType.textContent = isHttp ? 'خادم بعيد (HTTP)' : 'أمر محلي (STDIO)';
      if (mcpAuthTargetDesc) {
        mcpAuthTargetDesc.textContent = serverOrItem.description || (isHttp ? (serverOrItem.url || 'خادم بروتوكول عن بعد') : (serverOrItem.command || 'أمر تشغيل بروتوكول'));
      }

      if (mcpAuthTokenInput) {
        mcpAuthTokenInput.value = '';
        mcpAuthTokenInput.type = 'password';
      }
      if (btnToggleTokenVis) btnToggleTokenVis.textContent = '👁️';
      if (mcpAuthDeviceCodeInput) mcpAuthDeviceCodeInput.value = '';
      if (mcpDeviceDetailsBox) mcpDeviceDetailsBox.style.display = 'none';
      if (mcpAuthStatus) mcpAuthStatus.style.display = 'none';

      if (mcpModeToken) mcpModeToken.checked = true;
      if (mcpAuthTabToken) mcpAuthTabToken.style.display = 'flex';
      if (mcpAuthTabDevice) mcpAuthTabDevice.style.display = 'none';

      let defaultVar = 'API_KEY';
      let hintText = 'أدخل التوكن أو المفتاح السري المطلوب للربط.';
      const lowerName = name.toLowerCase();
      if (lowerName.includes('github')) {
        defaultVar = 'GITHUB_PERSONAL_ACCESS_TOKEN';
        hintText = 'توكن GitHub الشخصي (Personal Access Token) بصلاحيات repo / read.';
      } else if (lowerName.includes('brave')) {
        defaultVar = 'BRAVE_API_KEY';
        hintText = 'مفتاح Brave Search API Key من لوحة تحكم مطوري Brave.';
      } else if (serverOrItem.auth_env) {
        defaultVar = serverOrItem.auth_env;
        hintText = serverOrItem.auth_hint || hintText;
      }

      if (mcpAuthVarName) mcpAuthVarName.value = defaultVar;
      if (mcpAuthTokenHint) mcpAuthTokenHint.textContent = hintText;

      if (mcpAuthEnvContainer) {
        mcpAuthEnvContainer.style.display = isHttp ? 'none' : 'block';
      }

      if (serverOrItem.env && serverOrItem.env[defaultVar]) {
        if (mcpAuthTokenInput) mcpAuthTokenInput.value = serverOrItem.env[defaultVar];
        setMcpAuthStatus('البروتوكول يحتوي على توكن مسجل بالفعل. يمكنك اختباره أو استبداله.', 'info');
      } else if (serverOrItem.headers && serverOrItem.headers.Authorization) {
        let authH = serverOrItem.headers.Authorization;
        if (authH.toLowerCase().startsWith('bearer ')) authH = authH.substring(7);
        if (mcpAuthTokenInput) mcpAuthTokenInput.value = authH;
        setMcpAuthStatus('البروتوكول يحتوي على توكن Bearer مسجل بالفعل. يمكنك اختباره أو استبداله.', 'info');
      }

      mcpAuthDialog.showModal();
      announce('تم فتح نافذة توثيق ومصادقة بروتوكول ' + name);
      if (mcpAuthTokenInput) mcpAuthTokenInput.focus();
    }

    if (mcpModeToken && mcpModeDevice) {
      mcpModeToken.addEventListener('change', () => {
        if (mcpModeToken.checked) {
          if (mcpAuthTabToken) mcpAuthTabToken.style.display = 'flex';
          if (mcpAuthTabDevice) mcpAuthTabDevice.style.display = 'none';
          announce('تم اختيار مسار التوكن المباشر');
        }
      });
      mcpModeDevice.addEventListener('change', () => {
        if (mcpModeDevice.checked) {
          if (mcpAuthTabToken) mcpAuthTabToken.style.display = 'none';
          if (mcpAuthTabDevice) mcpAuthTabDevice.style.display = 'flex';
          announce('تم اختيار مسار كود التحقق والربط الخارجي');
        }
      });
    }

    if (btnToggleTokenVis && mcpAuthTokenInput) {
      btnToggleTokenVis.addEventListener('click', () => {
        const isPass = mcpAuthTokenInput.type === 'password';
        mcpAuthTokenInput.type = isPass ? 'text' : 'password';
        btnToggleTokenVis.textContent = isPass ? '🔒' : '👁️';
        btnToggleTokenVis.setAttribute('aria-label', isPass ? 'إخفاء التوكن' : 'إظهار التوكن');
        announce(isPass ? 'تم إظهار التوكن نصاً' : 'تم إخفاء التوكن');
      });
    }

    if (btnRequestDeviceCode) {
      btnRequestDeviceCode.addEventListener('click', async () => {
        if (!currentAuthServer) return;
        btnRequestDeviceCode.disabled = true;
        btnRequestDeviceCode.textContent = '⏳ جاري طلب الكود...';
        setMcpAuthStatus('جاري الاتصال بخادم المصادقة لتوليد كود التحقق...', 'info');

        try {
          const res = await fetch('/api/mcp/auth/request_device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: currentAuthServer.name || currentAuthServer.id,
              url: currentAuthServer.url || ''
            })
          });
          const data = await res.json();
          btnRequestDeviceCode.disabled = false;
          btnRequestDeviceCode.textContent = '🌐 إنشاء كود التحقق ورابط الدخول';

          if (res.ok && data.status === 'ok') {
            currentDeviceSession = data;
            if (data.user_code && mcpDeviceUserCode) {
              mcpDeviceUserCode.textContent = data.user_code;
            }
            if (data.verification_uri && mcpDeviceLink) {
              mcpDeviceLink.href = data.verification_uri;
              mcpDeviceLink.textContent = '🔗 فتح صفحة التحقق (' + data.verification_uri + ') ↗';
            }
            if (mcpDeviceDetailsBox) {
              mcpDeviceDetailsBox.style.display = 'flex';
            }
            const promptMsg = data.user_code ? 
              ('تم استخراج كود التحقق بنجاح: ' + data.user_code + '. افتح الرابط وأدخل الكود ثم اضغط تحقق.') : 
              (data.message || 'افتح صفحة الاعتماد للحصول على التوكن.');
            setMcpAuthStatus(promptMsg, 'success');
          } else if (data.status === 'manual_token_required') {
            setMcpAuthStatus(data.message || 'هذا البروتوكول يتطلب إدخال التوكن مباشرة.', 'info');
            if (mcpModeToken) {
              mcpModeToken.checked = true;
              if (mcpAuthTabToken) mcpAuthTabToken.style.display = 'flex';
              if (mcpAuthTabDevice) mcpAuthTabDevice.style.display = 'none';
            }
          } else {
            setMcpAuthStatus('خطأ: ' + (data.error || data.message || 'فشل طلب كود التحقق'), 'error');
          }
        } catch (err) {
          btnRequestDeviceCode.disabled = false;
          btnRequestDeviceCode.textContent = '🌐 إنشاء كود التحقق ورابط الدخول';
          setMcpAuthStatus('خطأ اتصال أثناء طلب كود التحقق: ' + err.message, 'error');
        }
      });
    }

    if (btnCopyDeviceCode && mcpDeviceUserCode) {
      btnCopyDeviceCode.addEventListener('click', () => {
        const code = mcpDeviceUserCode.textContent.trim();
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            playSuccessChime();
            announce('تم نسخ كود التحقق ' + code + ' إلى الحافظة بنجاح');
          }).catch(() => {
            announce('كود التحقق هو: ' + code);
          });
        }
      });
    }

    if (btnTestMcpAuth) {
      btnTestMcpAuth.addEventListener('click', async () => {
        if (!currentAuthServer) return;
        btnTestMcpAuth.disabled = true;
        btnTestMcpAuth.textContent = '⏳ جاري الاختبار...';
        setMcpAuthStatus('جاري اختبار الاتصال بالبروتوكول وفحص صحة الاعتماد...', 'info');

        const activeMode = mcpModeDevice && mcpModeDevice.checked ? 'device' : 'token';
        const enteredToken = activeMode === 'device' ? 
          (mcpAuthDeviceCodeInput ? mcpAuthDeviceCodeInput.value.trim() : '') : 
          (mcpAuthTokenInput ? mcpAuthTokenInput.value.trim() : '');
        const varName = mcpAuthVarName ? mcpAuthVarName.value.trim() : 'API_KEY';

        try {
          const res = await fetch('/api/mcp/auth/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: currentAuthServer.name || currentAuthServer.id,
              token: enteredToken,
              var_name: varName,
              command: currentAuthServer.command,
              url: currentAuthServer.url,
              server_type: currentAuthServer.type
            })
          });
          const data = await res.json();
          btnTestMcpAuth.disabled = false;
          btnTestMcpAuth.textContent = '🔍 اختبار الاتصال';

          if (res.ok && data.status === 'ok') {
            const rep = data.report || {};
            if (rep.healthy) {
              const latMsg = rep.latency_ms ? (' (زمن الاستجابة: ' + rep.latency_ms + ' مللي ثانية)') : '';
              setMcpAuthStatus('✓ نجح الاتصال بالبروتوكول بنجاح! التوكن صالح والخادم يستجيب' + latMsg, 'success');
            } else {
              setMcpAuthStatus('❌ فشل فحص البروتوكول: ' + (rep.message || rep.error || 'استجابة غير صالحة'), 'error');
            }
          } else {
            setMcpAuthStatus('خطأ في فحص البروتوكول: ' + (data.error || 'تعذر الاختبار'), 'error');
          }
        } catch (err) {
          btnTestMcpAuth.disabled = false;
          btnTestMcpAuth.textContent = '🔍 اختبار الاتصال';
          setMcpAuthStatus('خطأ اتصال أثناء اختبار البروتوكول: ' + err.message, 'error');
        }
      });
    }

    if (btnSaveMcpAuth) {
      btnSaveMcpAuth.addEventListener('click', async () => {
        if (!currentAuthServer) return;
        const activeMode = mcpModeDevice && mcpModeDevice.checked ? 'device' : 'token';
        const tokenVal = activeMode === 'device' ? 
          (mcpAuthDeviceCodeInput ? mcpAuthDeviceCodeInput.value.trim() : '') : 
          (mcpAuthTokenInput ? mcpAuthTokenInput.value.trim() : '');
        const varName = mcpAuthVarName ? mcpAuthVarName.value.trim() : 'API_KEY';

        if (!tokenVal && activeMode === 'token') {
          setMcpAuthStatus('يرجى لصق التوكن أو مفتاح API في الحقل أولاً', 'error');
          if (mcpAuthTokenInput) mcpAuthTokenInput.focus();
          return;
        }

        btnSaveMcpAuth.disabled = true;
        btnSaveMcpAuth.textContent = '⏳ جاري الحفظ والربط...';
        setMcpAuthStatus('جاري حفظ أوراق الاعتماد والربط بالبروتوكول...', 'info');

        try {
          const payload = {
            name: currentAuthServer.name || currentAuthServer.id,
            auth_mode: activeMode,
            token: tokenVal,
            var_name: varName,
            command: currentAuthServer.command,
            url: currentAuthServer.url,
            server_type: currentAuthServer.type
          };

          if (activeMode === 'device' && currentDeviceSession) {
            payload.device_code = currentDeviceSession.device_code;
            payload.token_endpoint = currentDeviceSession.token_endpoint;
            payload.client_id = currentDeviceSession.client_id;
          }

          const res = await fetch('/api/mcp/auth/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          btnSaveMcpAuth.disabled = false;
          btnSaveMcpAuth.textContent = '💾 تحقق وربط الحساب';

          if (res.ok && data.status === 'ok') {
            setMcpAuthStatus('✓ ' + (data.message || 'تم حفظ وتوثيق البروتوكول بنجاح'), 'success');
            if (typeof window.syncInstalledMcpGlobally === 'function') await window.syncInstalledMcpGlobally();
            await loadMcpServers();
            setTimeout(() => {
              if (mcpAuthDialog && mcpAuthDialog.open) {
                mcpAuthDialog.close();
                announce('تم إغلاق نافذة التوثيق بعد الحفظ الناجح');
              }
            }, 1800);
          } else if (data.status === 'pending') {
            setMcpAuthStatus('⏳ ' + data.message, 'info');
          } else {
            setMcpAuthStatus('خطأ أثناء حفظ الاعتماد: ' + (data.error || data.message || 'فشل الحفظ'), 'error');
          }
        } catch (err) {
          btnSaveMcpAuth.disabled = false;
          btnSaveMcpAuth.textContent = '💾 تحقق وربط الحساب';
          setMcpAuthStatus('خطأ اتصال أثناء الحفظ: ' + err.message, 'error');
        }
      });
    }

    if (btnCloseMcpAuth && mcpAuthDialog) {
      btnCloseMcpAuth.addEventListener('click', () => mcpAuthDialog.close());
    }
    if (btnCloseMcpAuthTop && mcpAuthDialog) {
      btnCloseMcpAuthTop.addEventListener('click', () => mcpAuthDialog.close());
    }


// Global exports
window.loadMcpServers = loadMcpServers;
window.installMcpServer = installMcpServer;
window.toggleMcpServer = toggleMcpServer;
window.removeMcpServer = removeMcpServer;
window.setMcpAuthStatus = setMcpAuthStatus;
window.openMcpAuthModal = openMcpAuthModal;
