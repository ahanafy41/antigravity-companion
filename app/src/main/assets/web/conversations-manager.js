/**
 * Antigravity Companion App - Conversations & System Resources Controller
 * Clean Architecture Modular Engine
 *
 * Manages system usage telemetry (tokens, RAM, storage, quotas), conversation list
 * loading, multi-turn history hydration, turn cards rendering, and options (pin, rename, delete).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConversationsManager = factory();
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

  function createConversationsManager(options) {
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
    const getToolLabel = opts.getToolLabel || function (name) { return name; };
    const renderToolResultCard = opts.renderToolResultCard || function (name, p, o) { return `<pre>${escapeHtml(o)}</pre>`; };
    const registerSubagent = opts.registerSubagent || (typeof window !== 'undefined' && window.SubagentsManager && window.SubagentsManager.registerSubagent ? window.SubagentsManager.registerSubagent : function () {});
    const loadArtifactsList = opts.loadArtifactsList || function () {};
    const createArtifactCard = opts.createArtifactCard || function () { return (doc || document).createElement('div'); };
    const knownArtifacts = opts.knownArtifacts || new Map();
    const updateArtifactsUI = opts.updateArtifactsUI || function () {};
    const sendAiPrompt = opts.sendAiPrompt || function () {};
    const onActivateConversation = opts.onActivateConversation || function () {};
    const onDeleteActiveConversation = opts.onDeleteActiveConversation || function () {};
    const getCurrentConversationId = opts.getCurrentConversationId || function () { return currentActiveConversationId; };

    let currentActiveConversationId = opts.initialConversationId || null;
    let selectedOptionConversation = null;

    // DOM references
    let valAiTokens = null;
    let valAiContext = null;
    let fillAiContext = null;
    let settingsContextText = null;
    let settingsContextFill = null;
    let settingsLastTokens = null;
    let settingsSessionTokens = null;
    let settingsInputTokens = null;
    let settingsOutputTokens = null;
    let valQuotaGoogle = null;
    let valQuotaClaude = null;
    let valRam = null;
    let fillRam = null;
    let settingsRamText = null;
    let settingsRamFill = null;
    let valDisk = null;
    let fillDisk = null;
    let settingsDiskText = null;
    let settingsDiskFill = null;

    let btnRefreshStats = null;
    let btnSettingsRefreshStats = null;

    let conversationsDialog = null;
    let conversationsListContainer = null;
    let btnOpenConversations = null;
    let btnCloseConversations = null;
    let btnCloseConversationsTop = null;

    let convOptionsDialog = null;
    let btnCloseConvOptions = null;
    let btnCloseConvOptionsTop = null;
    let btnConvOptRename = null;
    let btnConvOptPin = null;
    let btnConvOptDelete = null;

    let valSessionTitle = null;
    let settingsActiveConv = null;
    let aiChatFeed = null;
    let aiInput = null;

    function bindDom(customDoc) {
      if (customDoc) doc = customDoc;
      if (!doc) return;

      valAiTokens = doc.getElementById('val-ai-tokens');
      valAiContext = doc.getElementById('val-ai-context');
      fillAiContext = doc.getElementById('fill-ai-context');
      settingsContextText = doc.getElementById('settings-context-text');
      settingsContextFill = doc.getElementById('settings-context-fill');
      settingsLastTokens = doc.getElementById('settings-last-tokens');
      settingsSessionTokens = doc.getElementById('settings-session-tokens');
      settingsInputTokens = doc.getElementById('settings-input-tokens');
      settingsOutputTokens = doc.getElementById('settings-output-tokens');
      valQuotaGoogle = doc.getElementById('val-quota-google');
      valQuotaClaude = doc.getElementById('val-quota-claude');
      valRam = doc.getElementById('val-ram');
      fillRam = doc.getElementById('fill-ram');
      settingsRamText = doc.getElementById('settings-ram-text');
      settingsRamFill = doc.getElementById('settings-ram-fill');
      valDisk = doc.getElementById('val-disk');
      fillDisk = doc.getElementById('fill-disk');
      settingsDiskText = doc.getElementById('settings-disk-text');
      settingsDiskFill = doc.getElementById('settings-disk-fill');

      btnRefreshStats = doc.getElementById('btn-refresh-stats');
      btnSettingsRefreshStats = doc.getElementById('btn-settings-refresh-stats');

      conversationsDialog = doc.getElementById('conversations-dialog');
      conversationsListContainer = doc.getElementById('conversations-list-container');
      btnOpenConversations = doc.getElementById('btn-open-conversations');
      btnCloseConversations = doc.getElementById('btn-close-conversations');
      btnCloseConversationsTop = doc.getElementById('btn-close-conversations-top');

      convOptionsDialog = doc.getElementById('conv-options-dialog');
      btnCloseConvOptions = doc.getElementById('btn-close-conv-options');
      btnCloseConvOptionsTop = doc.getElementById('btn-close-conv-options-top');
      btnConvOptRename = doc.getElementById('btn-conv-opt-rename');
      btnConvOptPin = doc.getElementById('btn-conv-opt-pin');
      btnConvOptDelete = doc.getElementById('btn-conv-opt-delete');

      valSessionTitle = doc.getElementById('val-session-title');
      settingsActiveConv = doc.getElementById('settings-active-conv');
      aiChatFeed = doc.getElementById('ai-chat-feed');
      aiInput = doc.getElementById('ai-prompt-input');

      if (btnRefreshStats) {
        btnRefreshStats.addEventListener('click', () => {
          updateSystemUsage();
          announce('تم تحديث استهلاك الموارد');
          playBeep(750, 0.08);
        });
      }

      if (btnSettingsRefreshStats) {
        btnSettingsRefreshStats.addEventListener('click', () => {
          updateSystemUsage();
          announce('تم تحديث استهلاك الموارد');
          playBeep(750, 0.08);
        });
      }

      if (btnOpenConversations && conversationsDialog) {
        btnOpenConversations.addEventListener('click', async () => {
          if (typeof conversationsDialog.showModal === 'function') conversationsDialog.showModal();
          announce('تم فتح سجل وأرشيف المحادثات السابقة');
          await loadConversationsList();
        });
      }

      if (btnCloseConversations && conversationsDialog) {
        btnCloseConversations.addEventListener('click', () => {
          if (typeof conversationsDialog.close === 'function') conversationsDialog.close();
        });
      }
      if (btnCloseConversationsTop && conversationsDialog) {
        btnCloseConversationsTop.addEventListener('click', () => {
          if (typeof conversationsDialog.close === 'function') conversationsDialog.close();
        });
      }

      if (btnCloseConvOptions && convOptionsDialog) {
        btnCloseConvOptions.addEventListener('click', () => {
          if (typeof convOptionsDialog.close === 'function') convOptionsDialog.close();
        });
      }
      if (btnCloseConvOptionsTop && convOptionsDialog) {
        btnCloseConvOptionsTop.addEventListener('click', () => {
          if (typeof convOptionsDialog.close === 'function') convOptionsDialog.close();
        });
      }

      if (btnConvOptRename && convOptionsDialog) {
        btnConvOptRename.addEventListener('click', async () => {
          if (!selectedOptionConversation) return;
          if (typeof convOptionsDialog.close === 'function') convOptionsDialog.close();
          const currentTitle = selectedOptionConversation.title || '';
          const newTitle = (typeof window !== 'undefined' && window.prompt) ? window.prompt('إعادة تسمية المحادثة:', currentTitle) : null;
          if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
            const trimmed = newTitle.trim();
            try {
              const res = await fetchApi('/api/ai/conversation/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename', id: selectedOptionConversation.id, title: trimmed })
              });
              if (res.ok) {
                if (currentActiveConversationId === selectedOptionConversation.id) {
                  if (valSessionTitle) {
                    valSessionTitle.textContent = trimmed.length > 25 ? trimmed.slice(0, 22) + '...' : trimmed;
                  }
                  if (settingsActiveConv) settingsActiveConv.textContent = trimmed;
                }
                announce('تمت إعادة تسمية المحادثة إلى: ' + trimmed);
                await loadConversationsList();
              } else {
                announce('فشل تعديل عنوان المحادثة');
              }
            } catch (e) {
              announce('خطأ أثناء إعادة التسمية');
            }
          }
        });
      }

      if (btnConvOptPin && convOptionsDialog) {
        btnConvOptPin.addEventListener('click', async () => {
          if (!selectedOptionConversation) return;
          if (typeof convOptionsDialog.close === 'function') convOptionsDialog.close();
          const isPinned = Boolean(selectedOptionConversation.is_pinned);
          const action = isPinned ? 'unpin' : 'pin';
          try {
            const res = await fetchApi('/api/ai/conversation/manage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, id: selectedOptionConversation.id })
            });
            if (res.ok) {
              announce(isPinned ? 'تم إلغاء تثبيت المحادثة' : 'تم تثبيت المحادثة في أعلى القائمة');
              await loadConversationsList();
            } else {
              announce('تعذر تعديل حالة التثبيت');
            }
          } catch (e) {
            announce('خطأ أثناء تعديل التثبيت');
          }
        });
      }

      if (btnConvOptDelete && convOptionsDialog) {
        btnConvOptDelete.addEventListener('click', async () => {
          if (!selectedOptionConversation) return;
          if (typeof convOptionsDialog.close === 'function') convOptionsDialog.close();
          const confirmed = (typeof window !== 'undefined' && window.confirm) ? window.confirm(`هل أنت متأكد من حذف محادثة "${selectedOptionConversation.title}" نهائياً؟`) : true;
          if (confirmed) {
            try {
              const res = await fetchApi('/api/ai/conversation/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id: selectedOptionConversation.id })
              });
              if (res.ok) {
                announce('تم حذف المحادثة نهائياً');
                if (currentActiveConversationId === selectedOptionConversation.id) {
                  currentActiveConversationId = null;
                  onDeleteActiveConversation(selectedOptionConversation.id);
                }
                await loadConversationsList();
              } else {
                announce('تعذر حذف المحادثة');
              }
            } catch (e) {
              announce('خطأ أثناء حذف المحادثة');
            }
          }
        });
      }
    }

    async function updateSystemUsage() {
      try {
        const res = await fetchApi('/api/system/usage');
        if (res.ok) {
          const data = await res.json();
          if (data.ai) {
            const ai = data.ai;
            const lastTok = (ai.last_tokens || 0).toLocaleString();
            if (valAiTokens) valAiTokens.textContent = lastTok;
            if (valAiContext) valAiContext.textContent = (ai.context_pct || 0) + '%';
            if (fillAiContext) fillAiContext.style.width = Math.min(ai.context_pct || 0, 100) + '%';
            if (settingsContextText) {
              const ctxLimit = (ai.context_limit || 1048576).toLocaleString();
              const ctxTok = (ai.context_tokens || 0).toLocaleString();
              settingsContextText.textContent = `${ctxTok} / ${ctxLimit} توكنز (${ai.context_pct || 0}%)`;
            }
            if (settingsContextFill) settingsContextFill.style.width = Math.min(ai.context_pct || 0, 100) + '%';
            if (settingsLastTokens) settingsLastTokens.textContent = `${lastTok} توكنز`;
            if (settingsSessionTokens) settingsSessionTokens.textContent = `${(ai.total_session_tokens || 0).toLocaleString()} توكنز`;
            if (settingsInputTokens) settingsInputTokens.textContent = (ai.input_tokens || 0).toLocaleString();
            if (settingsOutputTokens) settingsOutputTokens.textContent = (ai.output_tokens || 0).toLocaleString();
          }
          if (data.quotas && Array.isArray(data.quotas)) {
            data.quotas.forEach(q => {
              if (q.group && q.limit_type) {
                if (q.group.includes('Gemini') && q.limit_type.includes('Five Hour')) {
                  if (valQuotaGoogle) valQuotaGoogle.textContent = q.pct;
                } else if (q.group.includes('Claude') && q.limit_type.includes('Five Hour')) {
                  if (valQuotaClaude) valQuotaClaude.textContent = q.pct;
                }
              }
            });
          }
          if (data.ram) {
            const ramPct = data.ram.pct || 0;
            if (valRam) valRam.textContent = ramPct + '%';
            if (fillRam) fillRam.style.width = Math.min(ramPct, 100) + '%';
            if (settingsRamText) settingsRamText.textContent = `${data.ram.used_mb} / ${data.ram.total_mb} MB (${ramPct}%)`;
            if (settingsRamFill) settingsRamFill.style.width = Math.min(ramPct, 100) + '%';
          }
          if (data.disk) {
            const diskPct = data.disk.pct || 0;
            if (valDisk) valDisk.textContent = diskPct + '%';
            if (fillDisk) fillDisk.style.width = Math.min(diskPct, 100) + '%';
            if (settingsDiskText) settingsDiskText.textContent = `${data.disk.used} / ${data.disk.total} (${diskPct}%)`;
            if (settingsDiskFill) settingsDiskFill.style.width = Math.min(diskPct, 100) + '%';
          }
        }
      } catch (e) {
        console.warn('Failed to fetch system usage:', e);
      }
    }

    async function loadConversationsList() {
      if (!conversationsListContainer) return;
      conversationsListContainer.innerHTML = '<div class="main-style-176">جاري تحميل سجل المحادثات...</div>';
      try {
        const res = await fetchApi('/api/ai/conversations');
        if (!res.ok) throw new Error('فشل جلب المحادثات');
        const data = await res.json();
        const convs = data.conversations || [];
        if (convs.length === 0) {
          conversationsListContainer.innerHTML = '<div class="main-style-176">لا توجد محادثات سابقة محفوظة.</div>';
          return;
        }

        conversationsListContainer.innerHTML = '';
        convs.forEach(c => {
          const item = (doc || document).createElement('div');
          const isCurrent = (getCurrentConversationId() || currentActiveConversationId) === c.id;
          const isRunning = Boolean(c.is_active || c.active_run);
          item.className = 'conv-card-item' + (isCurrent ? ' active' : '') + (isRunning ? ' running-task' : '');
          item.setAttribute('role', 'listitem');

          const ariaText = (isRunning ? '⚡ مهمة جارية تعمل الآن: ' : '') +
            (c.is_pinned ? 'محادثة مثبتة: ' : '') +
            (isCurrent ? `المحادثة الحالية المفتوحة: ${c.title}` : `استئناف المحادثة: ${c.title}`) +
            (c.date ? `، تاريخ ${c.date}` : '') + `، ${c.steps} رسالة وخطوة. اضغط لفتح المحادثة`;

          item.innerHTML = `
            <button type="button" class="btn-conv-main" aria-label="${escapeHtml(ariaText)}">
              <div class="conv-card-info">
                <div class="conv-card-title">
                  ${isRunning ? '<span class="conv-active-tag" style="background:#00e676;color:#000;padding:2px 6px;border-radius:4px;font-size:0.8rem;font-weight:bold;margin-left:6px;">⚡ تعمل الآن</span>' : ''}
                  ${c.is_pinned ? '<span class="conv-pin-tag" aria-hidden="true">📌 </span>' : ''}${escapeHtml(c.title)}
                </div>
                <div class="conv-card-meta">
                  ${isRunning ? '<span style="color:#00e676;font-weight:bold;">⚡ جارٍ التنفيذ بالخلفية</span>' : ''}
                  ${c.is_pinned ? '<span class="conv-pin-tag">مثبتة</span>' : ''}
                  <span>📅 ${escapeHtml(c.date || 'بدون تاريخ')}</span>
                  <span>🔢 ${c.steps} خطوة</span>
                  ${isCurrent ? '<span class="main-style-177">● المفتوحة حالياً</span>' : ''}
                </div>
              </div>
            </button>
            <button type="button" class="btn-conv-options" aria-label="خيارات محادثة ${escapeHtml(c.title)}" aria-haspopup="dialog">
              ⚙️ خيارات
            </button>
          `;

          const mainBtn = item.querySelector('.btn-conv-main');
          if (mainBtn) {
            mainBtn.addEventListener('click', async () => {
              await resumeConversation(c.id, c.title);
              if (conversationsDialog && typeof conversationsDialog.close === 'function') {
                conversationsDialog.close();
              }
            });
          }

          const optBtn = item.querySelector('.btn-conv-options');
          if (optBtn) {
            optBtn.addEventListener('click', (e) => {
              if (e.stopPropagation) e.stopPropagation();
              selectedOptionConversation = c;
              if (btnConvOptPin) {
                btnConvOptPin.textContent = c.is_pinned ? '📌 إلغاء تثبيت المحادثة' : '📌 تثبيت المحادثة في الأعلى';
              }
              if (convOptionsDialog && typeof convOptionsDialog.showModal === 'function') {
                convOptionsDialog.showModal();
              }
            });
          }

          conversationsListContainer.appendChild(item);
        });
      } catch (err) {
        if (conversationsListContainer) {
          conversationsListContainer.innerHTML = `<div class="main-style-178">تعذر تحميل السجل: ${escapeHtml(err.message)}</div>`;
        }
      }
    }

    async function resumeConversation(convId, convTitle) {
      announce('جاري استئناف المحادثة...');
      try {
        const res = await fetchApi('/api/ai/conversation?id=' + encodeURIComponent(convId));
        if (!res.ok) throw new Error('فشل تحميل تفاصيل المحادثة');
        const data = await res.json();
        const messages = data.messages || [];

        currentActiveConversationId = convId;
        onActivateConversation(convId, convTitle, data);

        loadArtifactsList();

        if (valSessionTitle) {
          valSessionTitle.textContent = convTitle.length > 25 ? convTitle.slice(0, 22) + '...' : convTitle;
          valSessionTitle.title = convTitle;
        }
        if (settingsActiveConv) {
          settingsActiveConv.textContent = convTitle;
        }

        // Render conversation history
        if (aiChatFeed) {
          aiChatFeed.innerHTML = '';
          if (messages.length === 0) {
            aiChatFeed.innerHTML = '<article class="chat-message ai-message"><div class="msg-content markdown-body" dir="rtl"><p>محادثة فارغة، يمكنك البدء بكتابة طلبك الآن.</p></div></article>';
          } else {
            messages.forEach(msg => {
              const isUser = msg.role === 'user';
              const card = (doc || document).createElement('article');
              card.className = 'chat-message ' + (isUser ? 'user-message' : 'ai-message');
              card.setAttribute('role', 'article');
              card.setAttribute('aria-label', isUser ? 'رسالتك السابقة' : 'رد الذكاء الاصطناعي السابق');
              if (msg.id) card.setAttribute('data-msg-id', msg.id);
              if (msg.time) card.setAttribute('data-msg-time', msg.time);

              let thinkingHtml = '';
              if (!isUser && msg.thinking) {
                thinkingHtml = `
                  <div class="thinking-accordion" role="region" aria-label="تحليل وتفكير الوكيل الداخلي">
                    <button type="button" class="thinking-header" aria-expanded="false" aria-label="تفكير واستدلال الوكيل (مغلق، اضغط للعرض)">
                      <div class="thinking-title-wrapper">
                        <span aria-hidden="true">🧠</span>
                        <span>تفكير واستدلال الوكيل</span>
                        <span class="thinking-badge">${msg.thinking.length} حرف تفكير</span>
                      </div>
                      <span class="thinking-toggle-icon" aria-hidden="true">▼</span>
                    </button>
                    <div class="thinking-body" hidden dir="auto">${renderMarkdown(msg.thinking)}</div>
                    <div class="thinking-footer" hidden>
                      <button type="button" class="btn-close-thinking" aria-label="إغلاق صندوق التفكير">✕ إغلاق صندوق التفكير (Esc)</button>
                    </div>
                  </div>
                `;
              }

              let toolsHtml = '';
              if (!isUser && Array.isArray(msg.tools) && msg.tools.length > 0) {
                const toolsCount = msg.tools.length;
                toolsHtml = `
                  <div class="thinking-accordion tools-accordion" role="region" aria-label="أدوات وعمليات الوكيل المنفذة" style="margin-top:8px;">
                    <button type="button" class="thinking-header tools-header" aria-expanded="false" aria-label="الأدوات المنفذة (${toolsCount} أداة، اضغط للعرض)">
                      <div class="thinking-title-wrapper">
                        <span aria-hidden="true">🛠️</span>
                        <span>الأدوات والعمليات المنفذة</span>
                        <span class="thinking-badge">${toolsCount} أداة</span>
                      </div>
                      <span class="thinking-toggle-icon" aria-hidden="true">▼</span>
                    </button>
                    <div class="thinking-body tools-body" hidden dir="auto">
                      ${msg.tools.map(t => `
                        <div class="tool-result-card" style="margin-bottom:8px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:8px; background:rgba(0,0,0,0.2);">
                          <div style="font-weight:bold; color:var(--accent-cyan); display:flex; justify-content:space-between;">
                            <span>⚡ ${escapeHtml(t.name || 'أداة')}</span>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(t.status || 'منفذة')}</span>
                          </div>
                          ${t.summary ? `<div style="font-size:0.85rem; color:var(--text-main); margin-top:3px;">${escapeHtml(t.summary)}</div>` : ''}
                          ${t.preview ? `<pre style="font-size:0.78rem; background:rgba(0,0,0,0.3); padding:4px; border-radius:4px; overflow-x:auto; max-height:120px; margin-top:4px;">${escapeHtml(t.preview)}</pre>` : ''}
                        </div>
                      `).join('')}
                    </div>
                    <div class="thinking-footer tools-footer" hidden>
                      <button type="button" class="btn-close-tools" aria-label="إغلاق صندوق الأدوات">✕ إغلاق صندوق الأدوات</button>
                    </div>
                  </div>
                `;
              }

              let statusBannerHtml = '';
              if (!isUser && (msg.terminal_status === 'completed_tools' || (!msg.text && Array.isArray(msg.tools) && msg.tools.length > 0))) {
                statusBannerHtml = `<div class="terminal-status-banner" style="background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.3); border-radius:6px; padding:6px 10px; margin-top:8px; font-size:0.85rem; color:var(--accent-cyan);">⚡ نفذ الوكيل العمليات والأدوات بنجاح.</div>`;
              }

              card.innerHTML = `
                <header class="msg-header">
                  <div class="msg-header-left">
                    <span class="ai-avatar" aria-hidden="true">${isUser ? '👤' : '🤖'}</span>
                    <h3 class="msg-title">${isUser ? 'أنت' : 'الوكيل الذكي'}</h3>
                  </div>
                  ${msg.time ? `<span class="msg-timestamp">${escapeHtml((String(msg.time).split('T')[1] || '').slice(0, 5))}</span>` : ''}
                </header>
                ${thinkingHtml}
                ${toolsHtml}
                <div class="msg-content markdown-body" dir="rtl">
                  ${isUser ? escapeHtml(msg.text) : (renderMarkdown(msg.text) || '<p class="main-style-179">(لا يوجد نص إضافي في هذا الرد)</p>')}
                </div>
                ${statusBannerHtml}
              `;
              aiChatFeed.appendChild(card);

              // Toggle listeners
              if (!isUser && msg.thinking) {
                const tHeader = card.querySelector('.thinking-header:not(.tools-header)');
                const tBody = card.querySelector('.thinking-body:not(.tools-body)');
                const tFooter = card.querySelector('.thinking-footer:not(.tools-footer)');
                const tClose = card.querySelector('.btn-close-thinking');
                const tIcon = tHeader?.querySelector('.thinking-toggle-icon');
                const doToggle = (open) => {
                  const willOpen = (typeof open === 'boolean') ? open : (tHeader.getAttribute('aria-expanded') !== 'true');
                  tHeader.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                  tHeader.setAttribute('aria-label', willOpen ? 'تفكير واستدلال الوكيل (مفتوح، اضغط للإخفاء)' : 'تفكير واستدلال الوكيل (مغلق، اضغط للعرض)');
                  if (tIcon) tIcon.textContent = willOpen ? '▲' : '▼';
                  if (willOpen) {
                    if (tBody) tBody.removeAttribute('hidden');
                    if (tFooter) tFooter.removeAttribute('hidden');
                    announce('تم فتح صندوق تفكير واستدلال الوكيل');
                  } else {
                    if (tBody) tBody.setAttribute('hidden', '');
                    if (tFooter) tFooter.setAttribute('hidden', '');
                    announce('تم إغلاق صندوق تفكير الوكيل');
                    if (typeof tHeader.focus === 'function') tHeader.focus();
                  }
                };
                if (tHeader) {
                  tHeader.addEventListener('click', () => doToggle());
                  tHeader.addEventListener('keydown', (e) => { if (e.key === 'Escape') doToggle(false); });
                }
                if (tClose) {
                  tClose.addEventListener('click', () => doToggle(false));
                }
              }

              if (!isUser && Array.isArray(msg.tools) && msg.tools.length > 0) {
                const tlHeader = card.querySelector('.tools-header');
                const tlBody = card.querySelector('.tools-body');
                const tlFooter = card.querySelector('.tools-footer');
                const tlClose = card.querySelector('.btn-close-tools');
                const tlIcon = tlHeader?.querySelector('.thinking-toggle-icon');
                if (tlHeader && tlBody) {
                  const doToolsToggle = (open) => {
                    const willOpen = (typeof open === 'boolean') ? open : (tlHeader.getAttribute('aria-expanded') !== 'true');
                    tlHeader.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                    tlHeader.setAttribute('aria-label', willOpen ? 'الأدوات المنفذة (مفتوح، اضغط للإخفاء)' : 'الأدوات المنفذة (مغلق، اضغط للعرض)');
                    if (tlIcon) tlIcon.textContent = willOpen ? '▲' : '▼';
                    if (willOpen) {
                      tlBody.removeAttribute('hidden');
                      if (tlFooter) tlFooter.removeAttribute('hidden');
                      announce('تم فتح صندوق الأدوات المنفذة');
                    } else {
                      tlBody.setAttribute('hidden', '');
                      if (tlFooter) tlFooter.setAttribute('hidden', '');
                      announce('تم إغلاق صندوق الأدوات');
                      if (typeof tlHeader.focus === 'function') tlHeader.focus();
                    }
                  };
                  tlHeader.addEventListener('click', () => doToolsToggle());
                  if (tlClose) tlClose.addEventListener('click', () => doToolsToggle(false));
                }
              }
            });
          }
        }

        // Render Subagents associated with this conversation
        if (typeof window !== 'undefined') window.subagentRegistry = [];
        if (data.subagents && data.subagents.length > 0) {
          data.subagents.forEach(sub => {
            registerSubagent({
              role: sub.role || 'وكيل فرعي',
              type: sub.type_name || 'subagent',
              prompt: sub.prompt || '',
              state: 'مكتمل',
              lastAction: sub.response ? 'أنجز المهمة وأرسل المخرجات' : 'أنجز مهامه',
              timestamp: ''
            });

            if (sub.tools && sub.tools.length > 0 && aiChatFeed) {
              const subThread = (doc || document).createElement('article');
              subThread.className = 'chat-message ai-message subagent-thread-card';
              subThread.setAttribute('role', 'region');
              subThread.setAttribute('aria-label', `أنشطة ومخرجات الوكيل السابق: ${escapeHtml(sub.role || 'وكيل')}`);
              let toolsHtml = '';
              sub.tools.forEach(t => {
                const label = escapeHtml(getToolLabel(t.name, t.parameters || {}));
                toolsHtml += `
                  <li class="step-item done">
                    <details class="step-tool-tile">
                      <summary class="step-item-header step-tool-summary" role="button" aria-expanded="false">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;">
                          <span class="step-icon">✓</span>
                          <span class="step-label">${label} <small class="step-state-badge">(اكتمل)</small></span>
                        </div>
                        <span class="step-expand-indicator" aria-hidden="true">▼</span>
                      </summary>
                      <div class="step-output-card-wrapper">
                        ${renderToolResultCard(t.name, t.parameters || {}, t.output || '')}
                      </div>
                    </details>
                  </li>
                `;
              });

              subThread.innerHTML = `
                <header class="msg-header" style="border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;margin-bottom:8px;">
                  <div class="msg-header-left">
                    <span class="ai-avatar" aria-hidden="true">🤖</span>
                    <h3 class="msg-title">الوكيل التابع: ${escapeHtml(sub.role || 'وكيل فرعي')} <small class="step-state-badge">${escapeHtml(sub.type_name || '')}</small></h3>
                  </div>
                  <span class="subagent-thread-badge badge-done">✅ مكتمل</span>
                </header>
                ${sub.prompt ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">🎯 المهمة: ${escapeHtml(sub.prompt)}</div>` : ''}
                <ul class="subagent-steps-list steps-list" role="list">${toolsHtml}</ul>
                ${sub.response ? `<div class="msg-content markdown-body" style="margin-top:8px;" dir="rtl">${renderMarkdown(sub.response)}</div>` : ''}
              `;
              aiChatFeed.appendChild(subThread);
            }
          });
        }

        // Render Artifacts associated with this conversation
        knownArtifacts.clear();
        if (data.artifacts && data.artifacts.length > 0) {
          data.artifacts.forEach(art => knownArtifacts.set(art.name, art));
          updateArtifactsUI(data.artifacts.length);
          if (aiChatFeed) {
            const artSection = (doc || document).createElement('div');
            artSection.className = 'chat-artifacts-section';
            artSection.setAttribute('role', 'region');
            artSection.setAttribute('aria-label', 'مستندات وخطط المحادثة (Artifacts)');
            artSection.style.cssText = 'margin:12px 0; display:flex; flex-direction:column; gap:8px;';
            data.artifacts.forEach(art => {
              artSection.appendChild(createArtifactCard(art));
            });
            aiChatFeed.appendChild(artSection);
          }
        } else {
          updateArtifactsUI(0);
        }

        if (aiChatFeed) aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
        if (conversationsDialog && typeof conversationsDialog.close === 'function') {
          conversationsDialog.close();
        }
        playSuccessChime();

        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('antigravity_last_active_conv', convId);
          }
        } catch (e) {}

        if (typeof window !== 'undefined' && window.MediaViewer && window.MediaViewer.enhanceContainer && aiChatFeed) {
          window.MediaViewer.enhanceContainer(aiChatFeed);
        }

        if (data.active_run && data.active_run.state === 'running') {
          announce('تمت استعادة الاتصال بالمهمة الجارية، الوكيل يعمل الآن...');
          sendAiPrompt('', {
            run_id: data.active_run.run_id,
            session_id: data.session_id,
            conversation_id: convId
          });
        } else {
          announce(`تم استئناف المحادثة بنجاح: ${convTitle}`);
        }

        if (aiInput && typeof aiInput.focus === 'function') aiInput.focus();
      } catch (err) {
        playBeep(400, 0.2);
        announce('حدث خطأ أثناء استئناف المحادثة: ' + err.message);
      }
    }

    if (doc) {
      bindDom(doc);
    }

    return {
      bindDom: bindDom,
      updateSystemUsage: updateSystemUsage,
      loadConversationsList: loadConversationsList,
      resumeConversation: resumeConversation,
      getCurrentActiveConversationId: function () { return currentActiveConversationId; },
      setCurrentActiveConversationId: function (id) { currentActiveConversationId = id; }
    };
  }

  return {
    createConversationsManager: createConversationsManager
  };
});
