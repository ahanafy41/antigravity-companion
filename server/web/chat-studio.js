/**
 * Antigravity Companion - Accessible AI Chat Studio (Slice 17)
 * Modular UMD Engine for Chat Messaging, Zero-Token Slash Commands,
 * Live SSE Turn Streamer, Tool Step Accordions, Subagent Routing,
 * Interactive Permission Dialogs & Network Auto-Recovery.
 */
(function(root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    const exports = factory();
    const target = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : root);
    target.ChatStudio = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function() {
  'use strict';

  function defaultEscapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createChatStudio(options) {
    const opts = options || {};

    // Helper functions
    const escapeHtml = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : defaultEscapeHtml;
    const renderMarkdown = typeof opts.renderMarkdown === 'function' ? opts.renderMarkdown : function(s) { return escapeHtml(s || ''); };
    const getToolLabel = typeof opts.getToolLabel === 'function' ? opts.getToolLabel : function(name) { return name; };
    const renderToolResultCard = typeof opts.renderToolResultCard === 'function' ? opts.renderToolResultCard : function() { return ''; };
    const announce = typeof opts.announce === 'function' ? opts.announce : function() {};
    const playBeep = typeof opts.playBeep === 'function' ? opts.playBeep : function() {};
    const playStartChime = typeof opts.playStartChime === 'function' ? opts.playStartChime : function() {};
    const playToolChime = typeof opts.playToolChime === 'function' ? opts.playToolChime : function() {};
    const playSuccessChime = typeof opts.playSuccessChime === 'function' ? opts.playSuccessChime : function() {};

    const fetchApi = typeof opts.fetchApi === 'function' ? opts.fetchApi : (
      typeof window !== 'undefined' && typeof window.mainV1Fetch === 'function' ? window.mainV1Fetch : (
        typeof fetch === 'function' ? fetch : async function() { return { ok: false }; }
      )
    );

    // State bindings
    let internalConversationId = null;
    let internalIsGenerating = false;
    let internalForceNewSession = false;

    const getCurrentConvId = typeof opts.getCurrentConversationId === 'function' ? opts.getCurrentConversationId : function() { return internalConversationId; };
    const setCurrentConvId = typeof opts.setCurrentConversationId === 'function' ? opts.setCurrentConversationId : function(id) { internalConversationId = id; };

    const getIsGenerating = typeof opts.getIsGenerating === 'function' ? opts.getIsGenerating : function() { return internalIsGenerating; };
    const setIsGenerating = typeof opts.setIsGenerating === 'function' ? opts.setIsGenerating : function(v) { internalIsGenerating = !!v; };

    const getForceNewSession = typeof opts.getForceNewSession === 'function' ? opts.getForceNewSession : function() { return internalForceNewSession; };
    const setForceNewSession = typeof opts.setForceNewSession === 'function' ? opts.setForceNewSession : function(v) { internalForceNewSession = !!v; };

    const updateSystemUsage = typeof opts.updateSystemUsage === 'function' ? opts.updateSystemUsage : async function() {};

    // Artifacts & Subagents callbacks
    const openArtifactViewer = typeof opts.openArtifactViewer === 'function' ? opts.openArtifactViewer : function() {};
    const createArtifactCard = typeof opts.createArtifactCard === 'function' ? opts.createArtifactCard : function() { return (typeof document !== 'undefined' ? document.createElement('div') : null); };
    const loadArtifactsList = typeof opts.loadArtifactsList === 'function' ? opts.loadArtifactsList : async function() {};
    const updateArtifactsUI = typeof opts.updateArtifactsUI === 'function' ? opts.updateArtifactsUI : function() {};
    const knownArtifacts = opts.knownArtifacts || new Map();

    const getRegisterSubagent = function() {
      if (typeof opts.registerSubagent === 'function') return opts.registerSubagent;
      if (typeof window !== 'undefined' && typeof window.registerSubagent === 'function') return window.registerSubagent;
      return function() {};
    };

    const getUpdateSubagentMessage = function() {
      if (typeof opts.updateSubagentMessage === 'function') return opts.updateSubagentMessage;
      if (typeof window !== 'undefined' && typeof window.updateSubagentMessage === 'function') return window.updateSubagentMessage;
      return function() {};
    };

    const getActiveFocusedAgent = function() {
      if (typeof opts.getActiveFocusedAgent === 'function') return opts.getActiveFocusedAgent();
      if (typeof window !== 'undefined' && window.activeFocusedAgent) return window.activeFocusedAgent;
      return null;
    };

    // Controller internal state
    let aiAbortController = null;
    let isUserExplicitAbort = false;

    // DOM Elements resolution helper
    function getEl(optKey, fallbackId) {
      if (opts[optKey]) return opts[optKey];
      if (typeof document !== 'undefined') return document.getElementById(fallbackId);
      return null;
    }

    function scrollChatIfNearBottom(aiChatFeed) {
      if (!aiChatFeed) return;
      const isNearBottom = (aiChatFeed.scrollHeight - aiChatFeed.scrollTop - aiChatFeed.clientHeight) < 180;
      if (isNearBottom) {
        aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
      }
    }

    // Send AI Prompt
    async function sendAiPrompt(promptText, reconnectOptions) {
      const reconnectOpts = reconnectOptions || null;
      if (!reconnectOpts && (!promptText || !String(promptText).trim())) return;
      promptText = (promptText || '').toString().trim();

      const aiInput = getEl('aiInput', 'ai-prompt-input');
      const aiChatFeed = getEl('aiChatFeed', 'ai-chat-feed');
      const btnNewAiChat = getEl('btnNewAiChat', 'btn-new-ai-chat');
      const checkContinue = getEl('checkContinue', 'check-session-continue');

      // Zero-Token Smart Command Dispatcher
      const trimmed = promptText.trim();
      const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

      if (firstWord === '/model' || firstWord === '/models') {
        if (aiInput) aiInput.value = '';
        if (typeof opts.openModelPicker === 'function') opts.openModelPicker();
        else if (typeof window !== 'undefined' && typeof window.openModelPicker === 'function') window.openModelPicker();
        return;
      }
      if (firstWord === '/tasks' || firstWord === '/task' || firstWord === '/schedule' || firstWord === '/jobs') {
        if (aiInput) aiInput.value = '';
        if (typeof opts.openTasksMonitor === 'function') opts.openTasksMonitor();
        else if (typeof window !== 'undefined' && typeof window.openTasksMonitor === 'function') window.openTasksMonitor();
        return;
      }
      if (firstWord === '/drawer' || firstWord === '/menu') {
        if (aiInput) aiInput.value = '';
        if (typeof opts.toggleAppDrawer === 'function') opts.toggleAppDrawer(true);
        else if (typeof window !== 'undefined' && typeof window.toggleAppDrawer === 'function') window.toggleAppDrawer(true);
        return;
      }
      if (firstWord === '/new' || firstWord === '/clear' || firstWord === '/reset' ||
          firstWord === 'new' || firstWord === 'clear' || firstWord === 'reset' ||
          firstWord === 'جديد' || firstWord === 'تفريغ' || firstWord === 'مسح' ||
          firstWord === '/exit' || firstWord === 'exit' || firstWord === '/quit' || firstWord === 'quit' || firstWord === 'خروج') {
        if (aiInput) aiInput.value = '';
        if (btnNewAiChat) btnNewAiChat.click();
        return;
      }
      if (firstWord === '/team' || firstWord === '/tean' || firstWord === '/taem' || firstWord === '/agents' || firstWord === '/agent' || firstWord === '/subagents') {
        if (aiInput) aiInput.value = '';
        const btnOpenSubagents = getEl('btnOpenSubagents', 'btn-open-subagents');
        if (btnOpenSubagents) btnOpenSubagents.click();
        return;
      }
      if (firstWord === '/skills' || firstWord === '/skill') {
        if (aiInput) aiInput.value = '';
        const btnOpenSkills = getEl('btnOpenSkills', 'btn-open-skills');
        if (btnOpenSkills) btnOpenSkills.click();
        return;
      }
      if (firstWord === '/mcp') {
        if (aiInput) aiInput.value = '';
        const btnOpenMcp = getEl('btnOpenMcp', 'btn-open-mcp');
        if (btnOpenMcp) btnOpenMcp.click();
        return;
      }
      if (firstWord === '/settings' || firstWord === '/config') {
        if (aiInput) aiInput.value = '';
        const btnOpenSettings = getEl('btnOpenSettings', 'btn-open-settings');
        if (btnOpenSettings) btnOpenSettings.click();
        return;
      }
      if (firstWord === '/files' || firstWord === '/file') {
        if (aiInput) aiInput.value = '';
        const btnOpenFiles = getEl('btnOpenFiles', 'btn-open-files');
        if (btnOpenFiles) btnOpenFiles.click();
        return;
      }
      if (firstWord === '/quota' || firstWord === '/usage' || firstWord === '/stats') {
        if (aiInput) aiInput.value = '';
        if (typeof document !== 'undefined') {
          const quotaDlg = document.getElementById('quota-dialog');
          if (quotaDlg && typeof quotaDlg.showModal === 'function') {
            quotaDlg.showModal();
            announce('تم فتح نافذة الحصص');
          }
        }
        return;
      }

      let userMsgContent = promptText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      let finalPromptToSend = promptText;

      // Highlight @mention for installed MCP protocols
      const mentionedMcpNames = [];
      const installedMcp = (typeof window !== 'undefined' && Array.isArray(window.INSTALLED_MCP_SERVERS)) ? window.INSTALLED_MCP_SERVERS : [];
      userMsgContent = userMsgContent.replace(/@([a-zA-Z0-9_-]+)/g, function(fullMatch, mcpName) {
        const found = installedMcp.find(function(s) { return s.name.toLowerCase() === mcpName.toLowerCase(); });
        if (found) {
          if (!mentionedMcpNames.includes(found.name)) {
            mentionedMcpNames.push(found.name);
          }
          const icon = found.icon || (typeof window !== 'undefined' && typeof window.getMcpIcon === 'function' ? window.getMcpIcon(found.name) : '🔌');
          const statusText = found.enabled ? '🟢 مفعل' : '⚪ معطل';
          return '<span class="mcp-mention-badge" title="بروتوكول MCP: ' + escapeHtml(found.name) + ' (' + statusText + ')">' + icon + ' @' + escapeHtml(found.name) + '</span>';
        }
        return fullMatch;
      });

      // Clear input immediately upon sending
      if (aiInput) {
        aiInput.value = '';
        aiInput.style.height = 'auto';
      }

      const activeAgent = getActiveFocusedAgent();

      // If a task is already generating, inject into persistent session queue
      if (getIsGenerating()) {
        const nowRunning = new Date();
        const timeStrRunning = nowRunning.getHours().toString().padStart(2, '0') + ':' + nowRunning.getMinutes().toString().padStart(2, '0');
        if (activeAgent) {
          userMsgContent = '<div class="main-style-142">🎯 موجه إلى: ' + escapeHtml(activeAgent) + '</div><br>' + userMsgContent;
          finalPromptToSend = '[توجيه محادثة مباشر إلى الوكيل الفرعي: "' + activeAgent + '"]: ' + promptText;
        }
        if (typeof document !== 'undefined' && aiChatFeed) {
          const userCardRunning = document.createElement('article');
          userCardRunning.className = 'chat-message user-message';
          userCardRunning.setAttribute('role', 'article');
          userCardRunning.setAttribute('aria-label', activeAgent ? ('طلبك موجه للوكيل ' + activeAgent) : 'طلبك أثناء تشغيل المهمة');
          userCardRunning.innerHTML =
            '<header class="msg-header">' +
              '<div class="msg-header-left">' +
                '<span class="user-avatar" aria-hidden="true">👤</span>' +
                '<span class="msg-title">أنت</span>' +
              '</div>' +
              '<span class="msg-time">' + timeStrRunning + '</span>' +
            '</header>' +
            '<div class="msg-content" dir="auto">' + userMsgContent + '</div>';
          aiChatFeed.appendChild(userCardRunning);
          if (typeof userCardRunning.scrollIntoView === 'function') {
            userCardRunning.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }

        try {
          const res = await fetchApi('/api/ai/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: finalPromptToSend })
          });
          const resData = (res && typeof res.json === 'function') ? await res.json().catch(function() { return {}; }) : {};
          if (res && res.ok && resData.queued) {
            playStartChime();
            announce('حُفظت الرسالة للدور التالي؛ لم تُحقن في الدور الجاري.');
            return;
          }
          announce(resData.error || 'تعذر حفظ الرسالة التالية.');
          return;
        } catch (e) {
          announce('تعذر تأكيد حفظ الرسالة؛ افحص المهام قبل تكرارها.');
          return;
        }
      }

      setIsGenerating(true);
      playStartChime();
      if (reconnectOpts) {
        announce('تمت استعادة الاتصال بالمهمة الجارية، الوكيل يعمل الآن...');
      } else if (mentionedMcpNames.length > 0) {
        announce('تم إرسال الطلب مع استدعاء بروتوكول MCP: ' + mentionedMcpNames.map(function(n) { return '@' + n; }).join(', '));
      } else {
        announce('تم إرسال الطلب للوكيل...');
      }

      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

      if (!reconnectOpts && typeof document !== 'undefined' && aiChatFeed) {
        if (activeAgent) {
          userMsgContent = '<div class="main-style-142">🎯 موجه إلى: ' + escapeHtml(activeAgent) + '</div><br>' + userMsgContent;
          finalPromptToSend = '[توجيه محادثة مباشر إلى الوكيل الفرعي: "' + activeAgent + '"]: ' + promptText;
        }

        // 1. Append User Card
        const userCard = document.createElement('article');
        userCard.className = 'chat-message user-message';
        userCard.setAttribute('role', 'article');
        userCard.setAttribute('aria-label', activeAgent ? ('طلبك موجه للوكيل ' + activeAgent) : 'طلبك');
        userCard.innerHTML =
          '<header class="msg-header">' +
            '<div class="msg-header-left">' +
              '<span class="user-avatar" aria-hidden="true">👤</span>' +
              '<span class="msg-title">أنت</span>' +
            '</div>' +
            '<span class="msg-time">' + timeStr + '</span>' +
          '</header>' +
          '<div class="msg-content" dir="auto">' + userMsgContent + '</div>';
        aiChatFeed.appendChild(userCard);
      }

      // 2. Append AI Card with Live Execution Steps Container
      let aiCard = null;
      let aiContentDiv = null;
      let aiTitle = null;
      let stepsTracker = null;
      let stepsList = null;
      let thinkingAccordion = null;
      let thinkingHeader = null;
      let thinkingBody = null;
      let thinkingFooter = null;
      let btnCloseThinking = null;
      let thinkingBadge = null;
      let thinkingIcon = null;

      if (typeof document !== 'undefined' && aiChatFeed) {
        aiCard = document.createElement('article');
        aiCard.className = 'chat-message ai-message generating';
        aiCard.setAttribute('role', 'article');
        aiCard.setAttribute('aria-label', 'إجابة الوكيل الذكي');
        aiCard.innerHTML =
          '<header class="msg-header">' +
            '<div class="msg-header-left">' +
              '<span class="ai-avatar" aria-hidden="true">🤖</span>' +
              '<h3 class="msg-title">' + (activeAgent ? ('الوكيل [' + escapeHtml(activeAgent) + ']: جارٍ التفكير والعمل...') : 'الوكيل الذكي: جارٍ التفكير والعمل...') + '</h3>' +
            '</div>' +
            '<div class="msg-actions">' +
              '<button type="button" class="btn-icon-sm btn-copy-msg" aria-label="نسخ الإجابة">📋 نسخ</button>' +
            '</div>' +
          '</header>' +
          '<div class="ai-steps-tracker" role="region" aria-label="خطوات تنفيذ الأدوات الحية">' +
            '<div class="steps-title">⚡ خطوات التفكير والعمل الحالية:</div>' +
            '<ul class="steps-list" role="list"></ul>' +
          '</div>' +
          '<div class="thinking-accordion main-style-2" role="region" aria-label="تحليل وتفكير الوكيل الداخلي">' +
            '<button type="button" class="thinking-header" aria-expanded="false" aria-label="تفكير واستدلال الوكيل (مغلق حالياً، اضغط للعرض)">' +
              '<div class="thinking-title-wrapper">' +
                '<span aria-hidden="true">🧠</span>' +
                '<span>تفكير واستدلال الوكيل</span>' +
                '<span class="thinking-badge main-style-143">0 حرف</span>' +
              '</div>' +
              '<span class="thinking-toggle-icon" aria-hidden="true">▼</span>' +
            '</button>' +
            '<div class="thinking-body" hidden dir="auto"></div>' +
            '<div class="thinking-footer" hidden>' +
              '<button type="button" class="btn-close-thinking" aria-label="إغلاق صندوق التفكير">✕ إغلاق صندوق التفكير (Esc)</button>' +
            '</div>' +
          '</div>' +
          '<div class="msg-content markdown-body" dir="rtl"><p>⏳ جارٍ تحضير الرد...</p></div>';
        aiChatFeed.appendChild(aiCard);
        aiChatFeed.scrollTop = aiChatFeed.scrollHeight;

        aiContentDiv = aiCard.querySelector('.msg-content');
        aiTitle = aiCard.querySelector('.msg-title');
        stepsTracker = aiCard.querySelector('.ai-steps-tracker');
        stepsList = aiCard.querySelector('.steps-list');
        thinkingAccordion = aiCard.querySelector('.thinking-accordion');
        thinkingHeader = aiCard.querySelector('.thinking-header');
        thinkingBody = aiCard.querySelector('.thinking-body');
        thinkingFooter = aiCard.querySelector('.thinking-footer');
        btnCloseThinking = aiCard.querySelector('.btn-close-thinking');
        thinkingBadge = aiCard.querySelector('.thinking-badge');
        thinkingIcon = aiCard.querySelector('.thinking-toggle-icon');
      }

      let accumulatedThinking = '';

      function toggleThinking(open) {
        if (!thinkingHeader || !thinkingBody) return;
        const willOpen = (typeof open === 'boolean') ? open : (thinkingHeader.getAttribute('aria-expanded') !== 'true');
        thinkingHeader.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        thinkingHeader.setAttribute('aria-label', willOpen ? 'تفكير واستدلال الوكيل (مفتوح، اضغط للإخفاء)' : 'تفكير واستدلال الوكيل (مغلق، اضغط للعرض)');
        if (thinkingIcon) thinkingIcon.textContent = willOpen ? '▲' : '▼';
        if (willOpen) {
          thinkingBody.removeAttribute('hidden');
          if (thinkingFooter) thinkingFooter.removeAttribute('hidden');
          announce('تم فتح صندوق تفكير واستدلال الوكيل');
        } else {
          thinkingBody.setAttribute('hidden', '');
          if (thinkingFooter) thinkingFooter.setAttribute('hidden', '');
          announce('تم إغلاق صندوق تفكير الوكيل');
          if (typeof thinkingHeader.focus === 'function') thinkingHeader.focus();
        }
      }

      if (thinkingHeader) {
        thinkingHeader.addEventListener('click', function() { toggleThinking(); });
        thinkingHeader.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') toggleThinking(false);
        });
      }
      if (btnCloseThinking) {
        btnCloseThinking.addEventListener('click', function() { toggleThinking(false); });
      }

      let accumulatedText = '';
      let lastRenderedText = '';
      let renderRafId = null;
      let lastRenderTime = 0;

      function scheduleAiRender(forceImmediate) {
        if (forceImmediate) {
          if (renderRafId) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(renderRafId);
            clearTimeout(renderRafId);
            renderRafId = null;
          }
          if (aiContentDiv) {
            aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
            lastRenderedText = accumulatedText;
            if (typeof window !== 'undefined' && window.MediaViewer && window.MediaViewer.enhanceContainer) {
              window.MediaViewer.enhanceContainer(aiContentDiv);
            }
          }
          if (typeof performance !== 'undefined' && performance.now) {
            lastRenderTime = performance.now();
          }
          scrollChatIfNearBottom(aiChatFeed);
          return;
        }
        if (renderRafId) return;

        const textLen = accumulatedText.length;
        const minInterval = textLen < 1000 ? 40 : (textLen < 3000 ? 70 : 100);

        const scheduleFn = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(cb) { return setTimeout(cb, 16); };

        renderRafId = scheduleFn(function() {
          renderRafId = null;
          const nowPerf = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const elapsed = nowPerf - lastRenderTime;
          if (elapsed < minInterval) {
            renderRafId = setTimeout(function() {
              renderRafId = null;
              if (aiContentDiv && accumulatedText !== lastRenderedText) {
                aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
                lastRenderedText = accumulatedText;
              }
              lastRenderTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              scrollChatIfNearBottom(aiChatFeed);
            }, minInterval - elapsed);
            return;
          }
          if (aiContentDiv && accumulatedText !== lastRenderedText) {
            aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
            lastRenderedText = accumulatedText;
          }
          lastRenderTime = nowPerf;
          scrollChatIfNearBottom(aiChatFeed);
        });
      }

      aiAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      isUserExplicitAbort = false;
      const promptStartTime = Date.now();

      const isForcedNew = getForceNewSession() || (checkContinue ? !checkContinue.checked : false);
      const shouldContinue = !isForcedNew;
      setForceNewSession(false);

      let streamWatchdog = null;

      try {
        let payload;
        if (reconnectOpts) {
          payload = {
            reconnect_run_id: reconnectOpts.run_id,
            session_id: reconnectOpts.session_id,
            conversation_id: reconnectOpts.conversation_id
          };
        } else {
          payload = {
            prompt: finalPromptToSend,
            continue: shouldContinue,
            force_new: isForcedNew
          };
          const curId = getCurrentConvId();
          if (curId && !isForcedNew) {
            payload.conversation_id = curId;
          }
        }

        const fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        };
        if (aiAbortController && aiAbortController.signal) {
          fetchOpts.signal = aiAbortController.signal;
        }

        const response = await fetchApi('/api/ai/stream', fetchOpts);

        if (!response || !response.ok) {
          throw new Error('رمز الخطأ: ' + (response ? response.status : 'تعذر الاتصال'));
        }

        const reader = response.body ? response.body.getReader() : null;
        const decoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : { decode: function(b) { return String(b); } };
        let buffer = '';
        let lastEventReceivedAt = Date.now();

        // Resilient Stream Watchdog
        streamWatchdog = setInterval(async function() {
          if (!getIsGenerating()) {
            clearInterval(streamWatchdog);
            return;
          }
          const idleMs = Date.now() - lastEventReceivedAt;
          const curId = getCurrentConvId();
          if (idleMs >= 60000 && curId) {
            try {
              const res = await fetchApi('/api/ai/conversation?id=' + encodeURIComponent(curId));
              if (res && res.ok) {
                const convData = await res.json();
                const msgs = convData.messages || [];
                const lastAgent = msgs.filter(function(m) { return m.role === 'agent'; }).pop();
                if (lastAgent) {
                  const msgTime = lastAgent.time ? new Date(lastAgent.time).getTime() : 0;
                  const isCurrentTurn = msgTime >= (promptStartTime - 3000);
                  if (isCurrentTurn && lastAgent.terminal_status && lastAgent.terminal_status !== 'running') {
                    if (lastAgent.text && lastAgent.text.length >= accumulatedText.length) {
                      accumulatedText = lastAgent.text;
                    }
                    if (lastAgent.thinking && !accumulatedThinking) {
                      accumulatedThinking = lastAgent.thinking;
                      if (thinkingBody) thinkingBody.innerHTML = renderMarkdown(accumulatedThinking);
                    }
                    clearInterval(streamWatchdog);
                    streamWatchdog = null;
                    scheduleAiRender(true);
                    if (aiCard) aiCard.classList.remove('generating');
                    if (aiTitle) aiTitle.textContent = 'إجابة الوكيل الذكي:';
                    setIsGenerating(false);
                    announce('تم استرداد وإكمال رد الوكيل بنجاح من سجل الجلسة.');
                    playSuccessChime();
                    if (reader && typeof reader.cancel === 'function') {
                      try { reader.cancel(); } catch(e) {}
                    }
                  } else {
                    lastEventReceivedAt = Date.now();
                  }
                }
              }
            } catch (wErr) {}
          }
        }, 10000);

        if (reader) {
          while (true) {
            const result = await reader.read();
            if (result.done) break;

            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith(':') || trimmedLine.startsWith('data: {"type":"heartbeat"')) {
                lastEventReceivedAt = Date.now();
              }
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;
                try {
                  const data = JSON.parse(jsonStr);
                  lastEventReceivedAt = Date.now();

                  if (data.type === 'heartbeat') continue;

                  // 0) Session Init event
                  if (data.type === 'init' && data.conversation_id) {
                    setCurrentConvId(data.conversation_id);
                    loadArtifactsList();
                  }

                  // A) Live tool step event
                  if (data.type === 'tool_step') {
                    playToolChime();
                    const toolDesc = escapeHtml(getToolLabel(data.tool, data.params || {}));

                    // Check for subagent multi-agent operations
                    if (data.tool === 'invoke_subagent') {
                      playBeep(650, 0.12);
                      const subList = [];
                      if (data.params && Array.isArray(data.params.Subagents) && data.params.Subagents.length > 0) {
                        data.params.Subagents.forEach(function(s) { subList.push(s); });
                      } else if (data.params) {
                        subList.push({
                          Role: data.params.Role || data.params.role || data.params.TypeName || data.params.type_name || 'وكيل فرعي',
                          TypeName: data.params.TypeName || data.params.type_name || 'subagent',
                          Prompt: data.params.Prompt || data.params.prompt || ''
                        });
                      }
                      const regSub = getRegisterSubagent();
                      subList.forEach(function(s) {
                        regSub({
                          role: s.Role || s.TypeName || 'وكيل فرعي',
                          type: s.TypeName || 'subagent',
                          prompt: s.Prompt || '',
                          state: data.state === 'ACTIVE' ? 'نشط (يعمل الآن)' : 'مكتمل',
                          lastAction: 'تم الإطلاق للبدء بالمهمة',
                          timestamp: new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit', second:'2-digit'})
                        });
                      });
                      if (data.state === 'ACTIVE') {
                        const countStr = subList.length > 1 ? ('(' + subList.length + ' وكلاء)') : '';
                        announce('تنبيه فريق العمل: تم استدعاء ' + subList.map(function(s) { return s.Role || s.TypeName; }).join(' و ') + ' ' + countStr);
                      }
                    } else if (data.tool === 'send_message') {
                      const recipient = (data.params && data.params.Recipient) ? data.params.Recipient : 'وكيل فرعي';
                      const msg = (data.params && data.params.Message) ? data.params.Message : '';
                      announce('محادثة بين الوكلاء: رسالة موجهة إلى ' + recipient);
                      getUpdateSubagentMessage()(recipient, msg);
                    }

                    // Route subagent tool steps to a SubagentThreadCard
                    let targetList = stepsList;
                    if ((data.subagent_id || data.subagent_role) && typeof document !== 'undefined' && aiCard) {
                      const subId = data.subagent_id || 'subagent';
                      const roleName = data.subagent_role || 'وكيل فرعي';
                      const typeName = data.subagent_type || '';
                      let subCard = aiCard.querySelector('.subagent-thread-card[data-subagent-id="' + escapeHtml(subId) + '"]');
                      if (!subCard) {
                        subCard = document.createElement('div');
                        subCard.className = 'subagent-thread-card';
                        subCard.dataset.subagentId = subId;
                        subCard.setAttribute('role', 'region');
                        subCard.setAttribute('aria-label', 'أنشطة الوكيل الفرعي: ' + roleName);
                        subCard.innerHTML =
                          '<div class="subagent-thread-header">' +
                            '<div style="display:flex;align-items:center;gap:8px;">' +
                              '<span aria-hidden="true" style="font-size:1.1rem;">🤖</span>' +
                              '<strong>' + escapeHtml(roleName) + '</strong>' +
                              (typeName ? '<small class="step-state-badge">' + escapeHtml(typeName) + '</small>' : '') +
                            '</div>' +
                            '<span class="subagent-thread-badge badge-active">🟢 يعمل الآن</span>' +
                          '</div>' +
                          '<ul class="subagent-steps-list steps-list" role="list"></ul>';
                        if (stepsTracker) {
                          stepsTracker.removeAttribute('hidden');
                          stepsTracker.appendChild(subCard);
                        } else if (stepsList && stepsList.parentElement) {
                          stepsList.parentElement.appendChild(subCard);
                        }
                      }
                      targetList = subCard.querySelector('.subagent-steps-list') || stepsList;
                      if (data.state === 'DONE') {
                        announce('الوكيل ' + roleName + ': أنجز ' + escapeHtml(toolDesc));
                      }
                    }

                    if (targetList && typeof document !== 'undefined') {
                      let stepLi = null;
                      if (data.step_index !== undefined && data.step_index !== null) {
                        stepLi = targetList.querySelector('.step-item[data-step-index="' + data.step_index + '"]');
                      }
                      if (!stepLi && data.state !== 'ACTIVE') {
                        const activeSteps = targetList.querySelectorAll('.step-item.active');
                        for (let k = activeSteps.length - 1; k >= 0; k--) {
                          if (!data.tool || activeSteps[k].dataset.tool === data.tool) {
                            stepLi = activeSteps[k];
                            break;
                          }
                        }
                      }
                      if (!stepLi && data.state === 'DONE') {
                        const lastStep = targetList.querySelector('.step-item:last-child');
                        if (lastStep) stepLi = lastStep;
                      }

                      const isDone = data.state === 'DONE';
                      const isError = data.state === 'ERROR';

                      if (!stepLi) {
                        stepLi = document.createElement('li');
                        if (data.step_index !== undefined && data.step_index !== null) {
                          stepLi.dataset.stepIndex = data.step_index;
                        }
                        if (data.tool) stepLi.dataset.tool = data.tool;
                        targetList.appendChild(stepLi);
                      } else {
                        if (data.step_index !== undefined && data.step_index !== null) {
                          stepLi.dataset.stepIndex = data.step_index;
                        }
                        if (data.tool) stepLi.dataset.tool = data.tool;
                      }

                      const totalStepsSoFar = targetList.querySelectorAll('.step-item').length;
                      if (!data.subagent_id && !data.subagent_role) {
                        if (data.state === 'ACTIVE') {
                          announce('جارٍ تنفيذ أداة: ' + toolDesc + ' (خطوة رقم ' + totalStepsSoFar + ')');
                        } else if (isDone) {
                          announce('اكتملت أداة: ' + toolDesc);
                        }
                      }

                      stepLi.className = 'step-item ' + (data.state === 'ACTIVE' ? 'active' : (isError ? 'error' : 'done'));

                      const stateIcon = data.state === 'ACTIVE' ? '⚙️' : (isError ? '❌' : '✓');
                      const stateLabel = data.state === 'ACTIVE' ? 'جارٍ التنفيذ...' : (isError ? 'تعثر' : 'اكتمل');

                      let toolTile = stepLi.querySelector('.step-tool-tile');
                      if (!toolTile) {
                        toolTile = document.createElement('details');
                        toolTile.className = 'step-tool-tile';
                        toolTile.open = false;
                        stepLi.appendChild(toolTile);
                      }

                      let summary = toolTile.querySelector('.step-tool-summary');
                      if (!summary) {
                        summary = document.createElement('summary');
                        summary.className = 'step-item-header step-tool-summary';
                        summary.setAttribute('role', 'button');
                        toolTile.insertBefore(summary, toolTile.firstChild);
                      }

                      let cardWrapper = toolTile.querySelector('.step-output-card-wrapper');
                      if (!cardWrapper) {
                        cardWrapper = document.createElement('div');
                        cardWrapper.className = 'step-output-card-wrapper';
                        toolTile.appendChild(cardWrapper);
                      }

                      const prevLabel = summary.querySelector('.step-label') ? summary.querySelector('.step-label').textContent : 'تنفيذ أداة';
                      const finalDesc = toolDesc || prevLabel;
                      summary.setAttribute('aria-expanded', toolTile.open ? 'true' : 'false');

                      let accessibleLabel = '';
                      if (data.state === 'ACTIVE') {
                        accessibleLabel = 'أداة: ' + finalDesc + '، جارٍ التنفيذ، اضغط لعرض التفاصيل';
                      } else if (isDone) {
                        accessibleLabel = 'أداة: ' + finalDesc + '، اكتملت بنجاح، اضغط لعرض مخرجات الأداة ونسخ المحتوى';
                      } else if (isError) {
                        accessibleLabel = 'أداة: ' + finalDesc + '، تعثرت، اضغط لعرض تفاصيل الخطأ';
                      }
                      summary.setAttribute('aria-label', accessibleLabel);

                      if (data.tool === 'invoke_subagent') {
                        stepLi.style.background = 'rgba(57, 197, 187, 0.12)';
                        stepLi.style.border = '1px solid var(--accent-cyan)';
                        summary.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex:1;"><span class="step-icon">👥</span> ' +
                          '<span><strong class="main-style-12">' + escapeHtml(toolDesc) + '</strong></span></div>' +
                          '<span class="step-expand-indicator" aria-hidden="true">▼</span>';
                      } else if (data.tool === 'send_message') {
                        stepLi.style.background = 'rgba(163, 113, 247, 0.12)';
                        summary.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex:1;"><span class="step-icon">💬</span> ' +
                          '<span><strong class="main-style-144">' + escapeHtml(toolDesc) + '</strong></span></div>' +
                          '<span class="step-expand-indicator" aria-hidden="true">▼</span>';
                      } else {
                        summary.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex:1;"><span class="step-icon">' + stateIcon + '</span> ' +
                          '<span class="step-label">' + escapeHtml(finalDesc) + ' <small class="step-state-badge">(' + stateLabel + ')</small></span></div>' +
                          '<span class="step-expand-indicator" aria-hidden="true">▼</span>';
                      }

                      if (!toolTile._toggleBound) {
                        toolTile._toggleBound = true;
                        toolTile.addEventListener('toggle', function() {
                          summary.setAttribute('aria-expanded', toolTile.open ? 'true' : 'false');
                        });
                      }

                      // Render Real Tool Output & Execution Results
                      if (data.output && String(data.output).trim()) {
                        cardWrapper.innerHTML = renderToolResultCard(data.tool, data.params || {}, data.output);
                        cardWrapper.querySelectorAll('.btn-copy-inline').forEach(function(btn) {
                          btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            const toCopy = btn.getAttribute('data-copy');
                            if (toCopy && navigator && navigator.clipboard) {
                              navigator.clipboard.writeText(toCopy).then(function() {
                                playBeep(880, 0.08);
                                announce('تم النسخ في الحافظة بنجاح');
                                btn.textContent = '✓ تم';
                                setTimeout(function() { btn.textContent = '📋 نسخ'; }, 2000);
                              });
                            }
                          });
                        });
                      } else if (data.state === 'ACTIVE' && !cardWrapper.innerHTML.trim()) {
                        cardWrapper.innerHTML = '<div class="tool-result-pending" style="padding:8px;color:var(--text-muted);font-size:0.85rem;">جارٍ تنفيذ الأداة واستقبال المخرجات...</div>';
                      }

                      if (data.state === 'ACTIVE') {
                        announce('جارٍ تنفيذ: ' + toolDesc);
                      } else if (isDone) {
                        announce('تم تنفيذ: ' + toolDesc + ' بنجاح');
                      } else if (isError) {
                        announce('تعثر تنفيذ: ' + toolDesc);
                      }
                      scrollChatIfNearBottom(aiChatFeed);
                    }
                  }
                  // B) Thought / Reasoning event
                  else if (data.type === 'thought' && data.text) {
                    const wasEmpty = !accumulatedThinking;
                    const newThinkingText = String(data.text).trim();
                    if (!accumulatedThinking.includes(newThinkingText)) {
                      accumulatedThinking += (accumulatedThinking ? '\n\n' : '') + newThinkingText;
                    }
                    if (thinkingAccordion && thinkingHeader && thinkingBody) {
                      thinkingAccordion.style.display = 'block';
                      const isUserOpened = thinkingHeader.getAttribute('aria-expanded') === 'true';
                      if (!isUserOpened) {
                        thinkingBody.setAttribute('hidden', '');
                        if (thinkingFooter) thinkingFooter.setAttribute('hidden', '');
                        thinkingHeader.setAttribute('aria-expanded', 'false');
                        thinkingHeader.setAttribute('aria-label', 'تفكير واستدلال الوكيل (' + accumulatedThinking.length + ' حرف، مغلق، اضغط للعرض)');
                        if (thinkingIcon) thinkingIcon.textContent = '▼';
                      }
                    }
                    if (thinkingBody) thinkingBody.innerHTML = renderMarkdown(accumulatedThinking);
                    if (thinkingBadge) thinkingBadge.textContent = accumulatedThinking.length + ' حرف تفكير';
                    if (wasEmpty) announce('بدأ الوكيل في التفكير والتحليل الداخلي');
                  }
                  // C) Content chunk event
                  else if (data.type === 'chunk' && data.text) {
                    if (accumulatedThinking && thinkingBadge && !thinkingBadge.dataset.finished) {
                      thinkingBadge.dataset.finished = 'true';
                      thinkingBadge.textContent = 'اكتمل التفكير (' + accumulatedThinking.length + ' حرف)';
                      if (thinkingHeader && thinkingHeader.getAttribute('aria-expanded') !== 'true') {
                        thinkingHeader.setAttribute('aria-label', 'تفكير واستدلال الوكيل (اكتمل ' + accumulatedThinking.length + ' حرف، مغلق، اضغط للعرض)');
                      }
                    }
                    accumulatedText += data.text;
                    scheduleAiRender();
                  }
                  // C) Final result event
                  else if (data.type === 'final_result' && data.response && data.response.length >= accumulatedText.length) {
                    accumulatedText = data.response;
                    scheduleAiRender(true);
                  }
                  // D) Error event
                  else if (data.type === 'error') {
                    const rawMsg = data.message || '';
                    const curId = getCurrentConvId();
                    if (rawMsg.includes('تعذر استعادة البث') && curId) {
                      fetchApi('/api/ai/conversation?id=' + encodeURIComponent(curId))
                        .then(function(r) { return r.json(); })
                        .then(function(convData) {
                          const lastAgent = (convData.messages || []).filter(function(m) { return m.role === 'agent'; }).pop();
                          if (lastAgent && lastAgent.text) {
                            accumulatedText = lastAgent.text;
                            scheduleAiRender(true);
                          }
                        }).catch(function() {});
                    } else {
                      const errorMsg = '[خطأ: ' + rawMsg + ']';
                      if (!accumulatedText.includes(errorMsg)) {
                        accumulatedText += (accumulatedText ? '\n' : '') + errorMsg;
                        scheduleAiRender(true);
                      }
                    }
                  }
                  // E) Artifact event
                  else if (data.type === 'artifact' && (data.artifact || data.name)) {
                    playSuccessChime();
                    const art = data.artifact || {
                      name: data.name,
                      path: data.path,
                      summary: data.summary,
                      requestFeedback: data.requestFeedback,
                      userFacing: data.userFacing
                    };
                    knownArtifacts.set(art.name, art);
                    updateArtifactsUI(knownArtifacts.size);
                    const artCard = createArtifactCard(art);
                    if (aiChatFeed && artCard) {
                      aiChatFeed.appendChild(artCard);
                      scrollChatIfNearBottom(aiChatFeed);
                    }
                    announce('تم إنشاء وثيقة عمل جديدة: ' + art.name + '. ' + (art.summary || ''));
                  }
                  // F) Permission Request
                  else if (data.type === 'permission_request' && typeof document !== 'undefined') {
                    playBeep(900, 0.2);
                    announce('انتباه! مطلوب إذنك: ' + data.question);

                    const aiSlot = document.getElementById('ai-interactive-prompt-slot');
                    const targetContainer = aiSlot || stepsTracker || document.getElementById('interactive-prompt-slot');
                    if (targetContainer) {
                      document.querySelectorAll('.interactive-prompt-card').forEach(function(el) { el.remove(); });

                      const card = document.createElement('div');
                      card.className = 'interactive-prompt-card';
                      card.setAttribute('role', 'alertdialog');
                      card.setAttribute('aria-modal', 'false');
                      const permTitleId = 'perm-title-' + Date.now();
                      const permQuestionId = 'perm-question-' + Date.now();
                      card.setAttribute('aria-labelledby', permTitleId);
                      card.setAttribute('aria-describedby', permQuestionId);
                      card.style.border = '2px solid var(--accent-yellow)';
                      card.style.background = '#1a1608';
                      card.style.borderRadius = '10px';
                      card.style.padding = '14px';
                      card.style.margin = '10px 0';
                      card.style.boxShadow = '0 0 16px rgba(210, 153, 34, 0.6)';

                      card.innerHTML =
                        '<div id="' + permTitleId + '" class="prompt-title-row main-style-145">' +
                          '<span aria-hidden="true" class="main-style-146">🔐</span>' +
                          '<span>مطلوب إذنك لتنفيذ هذا الإجراء:</span>' +
                        '</div>' +
                        '<div id="' + permQuestionId + '" class="main-style-147">' +
                          escapeHtml(data.question) +
                        '</div>' +
                        '<div class="prompt-options-grid main-style-148" role="group" aria-label="خيارات الموافقة">' +
                          '<button type="button" class="btn btn-choice-yes perm-btn main-style-149" data-perm-key="y" aria-label="موافقة على العملية (نعم - مفتاح Y)">' +
                            '<span>✅ موافقة (Yes - Y)</span>' +
                          '</button>' +
                          '<button type="button" class="btn btn-choice-no perm-btn main-style-150" data-perm-key="n" aria-label="رفض العملية (لا - مفتاح N)">' +
                            '<span>❌ رفض (No - N)</span>' +
                          '</button>' +
                          '<button type="button" class="btn btn-choice-always perm-btn main-style-151" data-perm-key="a" aria-label="موافقة دائماً على هذا النوع (مفتاح A)">' +
                            '<span>🔄 موافقة دائماً (A)</span>' +
                          '</button>' +
                        '</div>';

                      targetContainer.appendChild(card);
                      if (typeof card.scrollIntoView === 'function') {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }

                      const sendDecision = async function(key) {
                        try {
                          await fetchApi('/api/ai/permission', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({key: key})
                          });
                        } catch(err) {}
                        const labels = {y: 'تمت الموافقة ✅', n: 'تم الرفض ❌', a: 'موافقة دائماً ✅🔄'};
                        announce(labels[key] || key);
                        card.remove();
                      };

                      card.querySelectorAll('.perm-btn').forEach(function(btn) {
                        btn.addEventListener('click', function(e) {
                          e.preventDefault();
                          sendDecision(this.getAttribute('data-perm-key'));
                        });
                      });

                      card.addEventListener('keydown', function(e) {
                        const k = e.key.toLowerCase();
                        if (k === 'y') {
                          e.preventDefault();
                          sendDecision('y');
                        } else if (k === 'n' || k === 'escape') {
                          e.preventDefault();
                          sendDecision('n');
                        } else if (k === 'a') {
                          e.preventDefault();
                          sendDecision('a');
                        }
                      });

                      const firstBtn = card.querySelector('.perm-btn');
                      if (firstBtn && typeof firstBtn.focus === 'function') {
                        setTimeout(function() { firstBtn.focus(); }, 100);
                      }
                    }
                  }
                  // F) Permission Result confirmation
                  else if (data.type === 'permission_result' && typeof document !== 'undefined') {
                    document.querySelectorAll('.interactive-prompt-card').forEach(function(el) { el.remove(); });
                    announce(data.label || 'تم الرد على طلب الإذن');
                    if (stepsList) {
                      const li = document.createElement('li');
                      li.className = 'step-item done';
                      li.innerHTML = '<span class="step-icon">🔐</span> <span>' + escapeHtml(data.label || '') + '</span>';
                      stepsList.appendChild(li);
                    }
                  }
                } catch (e) {}
              }
            }
          }
        }

        scheduleAiRender(true);
        if (aiCard) aiCard.classList.remove('generating');
        if (aiTitle) aiTitle.textContent = 'إجابة الوكيل الذكي:';
        playSuccessChime();
        announce('اكتمل عمل ورد الوكيل الذكي بنجاح.');
        if (typeof console !== 'undefined') console.log('ANTIGRAVITY_TASK_FINISHED');
        if (typeof document !== 'undefined') document.title = 'DONE:اكتملت المهمة في Antigravity';

      } catch (err) {
        if (err && err.name === 'AbortError') {
          if (isUserExplicitAbort) {
            accumulatedText += '\n\n*(تم إيقاف الرد بواسطة المستخدم)*';
            scheduleAiRender(true);
            announce('تم إيقاف الرد');
          } else {
            scheduleAiRender(true);
          }
        } else {
          const errMsg = err ? (err.message || String(err)) : 'خطأ غير معروف';
          const noticeMsg = accumulatedText && accumulatedText.trim()
            ? '⚠️ حدث انقطاع مؤقت في تدفق الشبكة (' + escapeHtml(errMsg) + '). الإجابة المكتملة محفوظة في سجل الجلسة، وجارٍ استعادتها تلقائياً...'
            : '⏳ جارٍ استرداد رد الوكيل من الخادم (' + escapeHtml(errMsg) + ')...';
          if (aiContentDiv) {
            aiContentDiv.innerHTML = (accumulatedText && accumulatedText.trim() ? renderMarkdown(accumulatedText) : '') +
              '<div class="connection-notice main-style-152">' + noticeMsg + '</div>';
          }

          let retryCount = 0;
          const recoveryTimer = setInterval(async function() {
            retryCount++;
            const curId = getCurrentConvId();
            if (retryCount > 60 || !curId) {
              clearInterval(recoveryTimer);
              return;
            }
            try {
              const res = await fetchApi('/api/ai/conversation?id=' + encodeURIComponent(curId));
              if (res && res.ok) {
                const convData = await res.json();
                const lastAgent = (convData.messages || []).filter(function(m) { return m.role === 'agent'; }).pop();
                const msgTime = lastAgent && lastAgent.time ? new Date(lastAgent.time).getTime() : 0;
                const isCurrentTurn = msgTime >= (promptStartTime - 3000);
                if (isCurrentTurn && lastAgent && lastAgent.text && lastAgent.text.trim().length > 0) {
                  clearInterval(recoveryTimer);
                  accumulatedText = lastAgent.text;
                  scheduleAiRender(true);
                  announce('تم استرداد وتحديث كامل إجابة الوكيل بنجاح من السيرفر');
                  playSuccessChime();
                }
              }
            } catch(e) {}
          }, 2000);
        }
        if (aiCard) aiCard.classList.remove('generating');
      } finally {
        if (streamWatchdog) {
          clearInterval(streamWatchdog);
          streamWatchdog = null;
        }
        if (renderRafId) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(renderRafId);
          clearTimeout(renderRafId);
          renderRafId = null;
        }
        if (aiCard) {
          aiCard.querySelectorAll('.subagent-thread-card .subagent-thread-badge.badge-active').forEach(function(badge) {
            badge.classList.remove('badge-active');
            badge.classList.add('badge-done');
            badge.textContent = '✅ مكتمل';
          });
        }
        scheduleAiRender(true);
        setIsGenerating(false);
        aiAbortController = null;
        isUserExplicitAbort = false;
        updateSystemUsage();
        const curId = getCurrentConvId();
        if (curId) {
          fetchApi('/api/ai/conversation?id=' + encodeURIComponent(curId))
            .then(function(r) { return r.json(); })
            .then(function(convData) {
              const msgs = convData.messages || [];
              const lastAgent = msgs.filter(function(m) { return m.role === 'agent'; }).pop();
              if (lastAgent && lastAgent.id && aiCard) {
                aiCard.setAttribute('data-msg-id', lastAgent.id);
                if (lastAgent.time) aiCard.setAttribute('data-msg-time', lastAgent.time);
              }
            }).catch(function() {});
        }
      }
    }

    // Abort Current Prompt
    async function abortCurrentPrompt() {
      if (!getIsGenerating() && !aiAbortController) {
        announce('لا توجد مهمة قيد التشغيل حالياً');
        return;
      }
      playBeep(440, 0.15);
      announce('جارٍ إيقاف المهمة الجارية...');
      isUserExplicitAbort = true;
      if (aiAbortController) {
        aiAbortController.abort();
        aiAbortController = null;
      }
      try {
        const cancelled = await fetchApi('/api/ai/abort', { method: 'POST' });
        if (cancelled && !cancelled.ok) {
          const errData = await cancelled.json().catch(function() { return {}; });
          announce(errData.error || 'تعذر إيقاف المهمة');
          return;
        }
      } catch(e) {}
      setIsGenerating(false);
      announce('تم إيقاف المهمة الجارية بنجاح');
    }

    // Reset AI Chat
    async function resetAiChat() {
      try {
        const closed = await fetchApi('/api/ai/chat/reset', { method: 'POST' });
        if (closed && !closed.ok) {
          const errData = await closed.json().catch(function() { return {}; });
          announce(errData.error || 'تعذر إعادة تعيين الجلسة');
          return;
        }
      } catch(e) {}

      if (aiAbortController) {
        isUserExplicitAbort = true;
        aiAbortController.abort();
      }
      setForceNewSession(true);
      setCurrentConvId(null);
      knownArtifacts.clear();
      updateArtifactsUI(0);

      const valSessionTitle = getEl('valSessionTitle', 'val-session-title');
      const settingsActiveConv = getEl('settingsActiveConv', 'settings-active-conv');
      const aiChatFeed = getEl('aiChatFeed', 'ai-chat-feed');
      const aiInput = getEl('aiInput', 'ai-prompt-input');

      if (valSessionTitle) valSessionTitle.textContent = 'محادثة جديدة';
      if (settingsActiveConv) settingsActiveConv.textContent = 'جديدة';
      if (aiChatFeed) aiChatFeed.innerHTML = '';
      announce('تم تفريغ الذاكرة وبدء جلسة جديدة بالكامل');
      playBeep(600, 0.08);
      if (aiInput) {
        aiInput.value = '';
        if (typeof aiInput.focus === 'function') aiInput.focus();
      }
    }

    // Attach Event Listeners
    function attachEventListeners() {
      const aiForm = getEl('aiForm', 'ai-chat-form');
      const aiInput = getEl('aiInput', 'ai-prompt-input');
      const btnAiAbort = getEl('btnAiAbort', 'btn-ai-abort');
      const btnNewAiChat = getEl('btnNewAiChat', 'btn-new-ai-chat');
      const btnAiNewBottom = getEl('btnAiNewBottom', 'btn-ai-new-bottom');

      if (aiForm) {
        aiForm.addEventListener('submit', function(e) {
          e.preventDefault();
          if (typeof document !== 'undefined') {
            if (document.getElementById('slash-autocomplete-popup') || document.getElementById('at-autocomplete-popup')) return;
          }
          if (aiInput) sendAiPrompt(aiInput.value);
        });
      }

      if (aiInput) {
        if (typeof window !== 'undefined') {
          if (typeof window.attachSlashAutocomplete === 'function') window.attachSlashAutocomplete(aiInput);
          if (typeof window.attachAtAutocomplete === 'function') window.attachAtAutocomplete(aiInput);
        }
        aiInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            if (typeof document !== 'undefined') {
              if (document.getElementById('slash-autocomplete-popup') || document.getElementById('at-autocomplete-popup')) return;
            }
            e.preventDefault();
            sendAiPrompt(aiInput.value);
          }
        });
      }

      if (btnAiAbort) {
        btnAiAbort.addEventListener('click', function() {
          abortCurrentPrompt();
        });
      }

      if (btnNewAiChat) {
        btnNewAiChat.addEventListener('click', function() {
          resetAiChat();
        });
      }

      if (btnAiNewBottom && btnNewAiChat) {
        btnAiNewBottom.addEventListener('click', function() {
          btnNewAiChat.click();
        });
      }

      // Global copy handlers & file link interceptors
      if (typeof document !== 'undefined') {
        document.addEventListener('click', function(e) {
          const fileLink = e.target.closest('a[href^="file://"], a[href*="/brain/"]');
          if (fileLink) {
            e.preventDefault();
            const rawHref = fileLink.getAttribute('href') || '';
            const cleanPath = rawHref.replace(/^file:\/\//, '').replace(/^["']|["']$/g, '');
            const cleanName = cleanPath.split('/').pop().replace(/^["']|["']$/g, '');
            openArtifactViewer(cleanName, cleanPath, '', false, getCurrentConvId() || '');
            return;
          }
          const viewFileDirectBtn = e.target.closest('.btn-view-file-direct');
          if (viewFileDirectBtn) {
            e.preventDefault();
            const fPath = (viewFileDirectBtn.getAttribute('data-path') || '').replace(/^["']|["']$/g, '');
            const fName = fPath.split('/').pop().replace(/^["']|["']$/g, '') || fPath;
            openArtifactViewer(fName, fPath, 'ملف تم إنشاؤه أو تعديله بواسطة الوكيل في هذا المشروع', false, getCurrentConvId() || '');
            return;
          }
          const copyCodeBtn = e.target.closest('.btn-copy-code');
          if (copyCodeBtn) {
            const code = decodeURIComponent(copyCodeBtn.getAttribute('data-code') || '');
            if (navigator && navigator.clipboard) {
              navigator.clipboard.writeText(code).then(function() {
                playBeep(880, 0.08);
                announce('تم نسخ الكود البرمجي');
                copyCodeBtn.textContent = '✓ تم النسخ';
                setTimeout(function() { copyCodeBtn.textContent = '📋 نسخ الكود'; }, 2000);
              });
            }
            return;
          }
          const copyMsgBtn = e.target.closest('.btn-copy-msg');
          if (copyMsgBtn) {
            const card = copyMsgBtn.closest('.chat-message');
            const contentEl = card ? card.querySelector('.msg-content') : null;
            if (contentEl && navigator && navigator.clipboard) {
              navigator.clipboard.writeText(contentEl.innerText).then(function() {
                playBeep(880, 0.08);
                announce('تم نسخ الرسالة');
                copyMsgBtn.textContent = '✓ تم النسخ';
                setTimeout(function() { copyMsgBtn.textContent = '📋 نسخ'; }, 2000);
              });
            }
          }
        });
      }
    }

    return {
      sendAiPrompt: sendAiPrompt,
      abortCurrentPrompt: abortCurrentPrompt,
      resetAiChat: resetAiChat,
      attachEventListeners: attachEventListeners,
      getCurrentConversationId: getCurrentConvId,
      setCurrentConversationId: setCurrentConvId,
      getIsGenerating: getIsGenerating,
      setIsGenerating: setIsGenerating,
      getForceNewSession: getForceNewSession,
      setForceNewSession: setForceNewSession
    };
  }

  return {
    createChatStudio: createChatStudio
  };
});
