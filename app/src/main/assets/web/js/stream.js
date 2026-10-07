// ==============================================================================
// Server-Sent Events (SSE) Streaming Client & Message Feed Controller
// Live chunk parser, thinking stream, tool execution cards & bubble builders
// ==============================================================================

var currentActiveConversationId = window.currentActiveConversationId || null;
var isAiGenerating = window.isAiGenerating || false;
var forceNewSession = window.forceNewSession || false;
var aiAbortController = window.aiAbortController || null;

const aiViewport = document.getElementById('ai-studio-viewport');
const aiChatFeed = document.getElementById('ai-chat-feed');
const aiForm = document.getElementById('ai-chat-form');
const aiInput = document.getElementById('ai-prompt-input');
const btnAiSend = document.getElementById('btn-ai-send');
const btnAiAbort = document.getElementById('btn-ai-abort');
const btnNewAiChat = document.getElementById('btn-new-ai-chat');
const btnAiNewBottom = document.getElementById('btn-ai-new-bottom');
const valSessionTitle = document.getElementById('val-session-title');
const settingsActiveConv = document.getElementById('settings-active-conv');

    // Pure Accessible Agent Mode - AI Studio is always active
    if (aiViewport) aiViewport.style.display = 'flex';

    // Friendly Arabic labels for tools
    function getToolLabel(toolName, params) {
      if (toolName === 'run_command') {
        const cmd = params.CommandLine || '';
        return 'تشغيل أمر: ' + cmd;
      } else if (toolName === 'view_file' || toolName === 'read_resource') {
        const p = params.AbsolutePath || params.TargetFile || '';
        const name = p.split('/').pop() || p;
        return 'قراءة الملف: ' + name;
      } else if (toolName === 'write_to_file' || toolName === 'replace_file_content') {
        const p = params.TargetFile || params.AbsolutePath || '';
        const name = p.split('/').pop() || p;
        return 'تعديل أو كتابة الملف: ' + name;
      } else if (toolName === 'list_dir' || toolName === 'find_by_name') {
        return 'فحص محتويات المجلد';
      } else if (toolName === 'invoke_subagent') {
        const subagents = params.Subagents || [];
        const roles = subagents.map(s => s.Role || s.TypeName).join(', ');
        return '🤖 إطلاق وكيل فرعي متخصص: ' + (roles || 'وكيل جديد');
      } else if (toolName === 'send_message') {
        return '💬 تواصل وتنسيق مع وكيل فرعي';
      } else if (toolName === 'manage_subagents' || toolName === 'manage_task') {
        return '⚙️ إدارة ومتابعة مهام الوكلاء';
      } else if (toolName === 'search_web') {
        return '🌐 بحث حي في الويب: ' + (params.query || '');
      } else if (toolName === 'read_url_content') {
        return '🌐 قراءة صفحة ومصدر ويب';
      }
      return 'تنفيذ أداة: ' + toolName;
    }

    async function sendAiPrompt(promptText) {
      if (!promptText || !promptText.trim()) return;
      promptText = promptText.trim();

      // ==============================================================================
      // Zero-Token Smart Command Dispatcher (Instant REST API Execution & Modals)
      // ==============================================================================
      const trimmed = promptText.trim();
      const firstWord = trimmed.split(/\s+/)[0].toLowerCase();

      if (firstWord === '/model' || firstWord === '/models') {
        if (aiInput) aiInput.value = '';
        if (typeof openModelPicker === 'function') openModelPicker();
        return;
      }
      if (firstWord === '/tasks' || firstWord === '/task' || firstWord === '/schedule' || firstWord === '/jobs') {
        if (aiInput) aiInput.value = '';
        if (typeof openTasksMonitor === 'function') openTasksMonitor();
        return;
      }
      if (firstWord === '/drawer' || firstWord === '/menu') {
        if (aiInput) aiInput.value = '';
        if (typeof toggleAppDrawer === 'function') toggleAppDrawer(true);
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
        if (btnOpenSubagents) btnOpenSubagents.click();
        return;
      }
      if (firstWord === '/skills' || firstWord === '/skill') {
        if (aiInput) aiInput.value = '';
        if (btnOpenSkills) btnOpenSkills.click();
        return;
      }
      if (firstWord === '/mcp') {
        if (aiInput) aiInput.value = '';
        if (btnOpenMcp) btnOpenMcp.click();
        return;
      }
      if (firstWord === '/settings' || firstWord === '/config') {
        if (aiInput) aiInput.value = '';
        if (btnOpenSettings) btnOpenSettings.click();
        return;
      }
      if (firstWord === '/files' || firstWord === '/file') {
        if (aiInput) aiInput.value = '';
        if (btnOpenFiles) btnOpenFiles.click();
        return;
      }
      if (firstWord === '/quota' || firstWord === '/usage' || firstWord === '/stats') {
        if (aiInput) aiInput.value = '';
        const quotaDlg = document.getElementById('quota-dialog');
        if (quotaDlg) {
          quotaDlg.showModal();
          announce('تم فتح نافذة الحصص');
        }
        return;
      }
      // ==============================================================================

      let userMsgContent = promptText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      let finalPromptToSend = promptText;

      // Highlight @mention for installed MCP protocols
      const mentionedMcpNames = [];
      userMsgContent = userMsgContent.replace(/@([a-zA-Z0-9_-]+)/g, (fullMatch, mcpName) => {
        const found = (window.INSTALLED_MCP_SERVERS || []).find(s => s.name.toLowerCase() === mcpName.toLowerCase());
        if (found) {
          if (!mentionedMcpNames.includes(found.name)) {
            mentionedMcpNames.push(found.name);
          }
          const icon = found.icon || (typeof window.getMcpIcon === 'function' ? window.getMcpIcon(found.name) : '🔌');
          const statusText = found.enabled ? '🟢 مفعل' : '⚪ معطل';
          return `<span class="mcp-mention-badge" title="بروتوكول MCP: ${escapeHtml(found.name)} (${statusText})">${icon} @${escapeHtml(found.name)}</span>`;
        }
        return fullMatch;
      });

      // Clear input immediately upon sending so user has empty box for next message
      if (aiInput) {
        aiInput.value = '';
        aiInput.style.height = 'auto';
      }

      // If a task is already generating, inject into persistent session independently
      if (isAiGenerating) {
        const nowRunning = new Date();
        const timeStrRunning = nowRunning.getHours().toString().padStart(2, '0') + ':' + nowRunning.getMinutes().toString().padStart(2, '0');
        if (activeFocusedAgent) {
          userMsgContent = `<div style="display:inline-block; background:#102230; color:var(--accent-cyan); padding:2px 8px; border-radius:6px; font-size:0.85rem; font-weight:bold; margin-bottom:6px;">🎯 موجه إلى: ${escapeHtml(activeFocusedAgent)}</div><br>` + userMsgContent;
          finalPromptToSend = `[توجيه محادثة مباشر إلى الوكيل الفرعي: "${activeFocusedAgent}"]: ${promptText}`;
        }
        const userCardRunning = document.createElement('article');
        userCardRunning.className = 'chat-message user-message';
        userCardRunning.setAttribute('role', 'article');
        userCardRunning.setAttribute('aria-label', activeFocusedAgent ? `طلبك موجه للوكيل ${activeFocusedAgent}` : 'طلبك أثناء تشغيل المهمة');
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
        userCardRunning.scrollIntoView({ behavior: 'smooth', block: 'end' });

        try {
          const res = await fetch('/api/ai/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: finalPromptToSend })
          });
          const resData = await res.json().catch(() => ({}));
          if (res.ok && resData.delivered) {
            playStartChime();
            announce('تم إرسال الرسالة إلى الجلسة الجارية بنجاح');
            return;
          }
        } catch (e) {
          console.warn('Failed to inject into running session, falling back to stream', e);
        }
      }

      isAiGenerating = true;
      playStartChime();
      if (mentionedMcpNames.length > 0) {
        announce('تم إرسال الطلب مع استدعاء بروتوكول MCP: ' + mentionedMcpNames.map(n => '@' + n).join(', '));
      } else {
        announce('تم إرسال الطلب للوكيل...');
      }

      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

      if (activeFocusedAgent) {
        userMsgContent = `<div style="display:inline-block; background:#102230; color:var(--accent-cyan); padding:2px 8px; border-radius:6px; font-size:0.85rem; font-weight:bold; margin-bottom:6px;">🎯 موجه إلى: ${escapeHtml(activeFocusedAgent)}</div><br>` + userMsgContent;
        finalPromptToSend = `[توجيه محادثة مباشر إلى الوكيل الفرعي: "${activeFocusedAgent}"]: ${promptText}`;
      }

      // 1. Append User Card
      const userCard = document.createElement('article');
      userCard.className = 'chat-message user-message';
      userCard.setAttribute('role', 'article');
      userCard.setAttribute('aria-label', activeFocusedAgent ? `طلبك موجه للوكيل ${activeFocusedAgent}` : 'طلبك');
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

      // 2. Append AI Card with Live Execution Steps Container
      const aiCard = document.createElement('article');
      aiCard.className = 'chat-message ai-message generating';
      aiCard.setAttribute('role', 'article');
      aiCard.setAttribute('aria-label', 'إجابة الوكيل الذكي');
      aiCard.innerHTML = 
        '<header class="msg-header">' +
          '<div class="msg-header-left">' +
            '<span class="ai-avatar" aria-hidden="true">🤖</span>' +
            '<h3 class="msg-title">' + (activeFocusedAgent ? `الوكيل [${escapeHtml(activeFocusedAgent)}]: جارٍ التفكير والعمل...` : 'الوكيل الذكي: جارٍ التفكير والعمل...') + '</h3>' +
          '</div>' +
          '<div class="msg-actions">' +
            '<button type="button" class="btn-icon-sm btn-copy-msg" aria-label="نسخ الإجابة">📋 نسخ</button>' +
          '</div>' +
        '</header>' +
        '<div class="ai-steps-tracker" role="region" aria-label="خطوات تنفيذ الأدوات الحية">' +
          '<div class="steps-title">⚡ خطوات التفكير والعمل الحالية:</div>' +
          '<ul class="steps-list" role="list"></ul>' +
        '</div>' +
        '<div class="thinking-accordion" role="region" aria-label="تحليل وتفكير الوكيل الداخلي" style="display:none;">' +
          '<button type="button" class="thinking-header" aria-expanded="false" aria-label="تفكير واستدلال الوكيل (مغلق حالياً، اضغط للعرض)">' +
            '<div class="thinking-title-wrapper">' +
              '<span aria-hidden="true">🧠</span>' +
              '<span>تفكير واستدلال الوكيل</span>' +
              '<span class="thinking-badge" style="font-family:monospace;">0 حرف</span>' +
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

      const aiContentDiv = aiCard.querySelector('.msg-content');
      const aiTitle = aiCard.querySelector('.msg-title');
      const stepsTracker = aiCard.querySelector('.ai-steps-tracker');
      const stepsList = aiCard.querySelector('.steps-list');
      const thinkingAccordion = aiCard.querySelector('.thinking-accordion');
      const thinkingHeader = aiCard.querySelector('.thinking-header');
      const thinkingBody = aiCard.querySelector('.thinking-body');
      const thinkingFooter = aiCard.querySelector('.thinking-footer');
      const btnCloseThinking = aiCard.querySelector('.btn-close-thinking');
      const thinkingBadge = aiCard.querySelector('.thinking-badge');
      const thinkingIcon = aiCard.querySelector('.thinking-toggle-icon');

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
          thinkingHeader.focus();
        }
      }

      if (thinkingHeader) {
        thinkingHeader.addEventListener('click', () => toggleThinking());
        thinkingHeader.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') toggleThinking(false);
        });
      }
      if (btnCloseThinking) {
        btnCloseThinking.addEventListener('click', () => toggleThinking(false));
      }

      let accumulatedText = '';
      let renderRafId = null;
      let lastRenderTime = 0;

      function scrollChatIfNearBottom() {
        if (!aiChatFeed) return;
        const isNearBottom = (aiChatFeed.scrollHeight - aiChatFeed.scrollTop - aiChatFeed.clientHeight) < 180;
        if (isNearBottom) {
          aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
        }
      }

      function scheduleAiRender(forceImmediate) {
        if (forceImmediate) {
          if (renderRafId) {
            cancelAnimationFrame(renderRafId);
            clearTimeout(renderRafId);
            renderRafId = null;
          }
          if (aiContentDiv) aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
          lastRenderTime = performance.now();
          scrollChatIfNearBottom();
          return;
        }
        if (renderRafId) return;
        renderRafId = requestAnimationFrame(() => {
          renderRafId = null;
          const elapsed = performance.now() - lastRenderTime;
          if (elapsed < 40) {
            renderRafId = setTimeout(() => {
              renderRafId = null;
              if (aiContentDiv) aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
              lastRenderTime = performance.now();
              scrollChatIfNearBottom();
            }, 40 - elapsed);
            return;
          }
          if (aiContentDiv) aiContentDiv.innerHTML = renderMarkdown(accumulatedText);
          lastRenderTime = performance.now();
          scrollChatIfNearBottom();
        });
      }

      aiAbortController = new AbortController();

      const isForcedNew = forceNewSession || (checkContinue ? !checkContinue.checked : false);
      const shouldContinue = !isForcedNew;
      forceNewSession = false;

      try {
        const payload = {
          prompt: finalPromptToSend,
          continue: shouldContinue,
          force_new: isForcedNew
        };
        if (currentActiveConversationId && !isForcedNew) {
          payload.conversation_id = currentActiveConversationId;
        }
        const response = await fetch('/api/ai/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: aiAbortController.signal
        });

        if (!response.ok) {
          throw new Error('رمز الخطأ: ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const data = JSON.parse(jsonStr);

                // 0 - Session Init event
                if (data.type === 'init' && data.conversation_id) {
                  currentActiveConversationId = data.conversation_id;
                }

                // A: Live tool step event
                if (data.type === 'tool_step') {
                  playToolChime();
                  const toolDesc = getToolLabel(data.tool, data.params || {});

                  // Check for subagent multi-agent operations
                  if (data.tool === 'invoke_subagent') {
                    playBeep(650, 0.12);
                    const subList = (data.params && data.params.Subagents) ? data.params.Subagents : [];
                    subList.forEach(s => {
                      registerSubagent({
                        role: s.Role || s.TypeName || 'وكيل فرعي',
                        type: s.TypeName || 'subagent',
                        prompt: s.Prompt || '',
                        state: data.state === 'ACTIVE' ? 'نشط (يعمل الآن)' : 'مكتمل',
                        lastAction: 'تم الإطلاق للبدء بالمهمة',
                        timestamp: new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit', second:'2-digit'})
                      });
                    });
                    const countStr = subList.length > 1 ? `(${subList.length} وكلاء)` : '';
                    announce(`تنبيه فريق العمل: تم استدعاء ${subList.map(s => s.Role || s.TypeName).join(' و ')} ${countStr}`);
                  } else if (data.tool === 'send_message') {
                    const recipient = (data.params && data.params.Recipient) ? data.params.Recipient : 'وكيل فرعي';
                    const msg = (data.params && data.params.Message) ? data.params.Message : '';
                    announce(`محادثة بين الوكلاء: رسالة موجهة إلى ${recipient}`);
                    updateSubagentMessage(recipient, msg);
                  }

                  const li = document.createElement('li');
                  li.className = 'step-item ' + (data.state === 'ACTIVE' ? 'active' : 'done');
                  if (data.tool === 'invoke_subagent') {
                    li.style.background = 'rgba(57, 197, 187, 0.12)';
                    li.style.border = '1px solid var(--accent-cyan)';
                    li.innerHTML = '<span class="step-icon">👥</span> ' +
                      '<span><strong style="color:var(--accent-cyan);">' + toolDesc + '</strong></span>';
                  } else if (data.tool === 'send_message') {
                    li.style.background = 'rgba(163, 113, 247, 0.12)';
                    li.innerHTML = '<span class="step-icon">💬</span> ' +
                      '<span><strong style="color:var(--accent-purple);">' + toolDesc + '</strong></span>';
                  } else {
                    li.innerHTML = '<span class="step-icon">' + (data.state === 'ACTIVE' ? '⚙️' : '✓') + '</span> ' +
                      '<span>' + toolDesc + '</span>';
                  }
                  stepsList.appendChild(li);
                  announce(toolDesc);
                  scrollChatIfNearBottom();
                }
                // B: Thought / Reasoning event
                else if (data.type === 'thought' && data.text) {
                  accumulatedThinking += data.text;
                  if (thinkingAccordion) thinkingAccordion.style.display = 'block';
                  if (thinkingBody) thinkingBody.innerHTML = renderMarkdown(accumulatedThinking);
                  if (thinkingBadge) thinkingBadge.textContent = accumulatedThinking.length + ' حرف تفكير';
                }
                // C: Content chunk event
                else if (data.type === 'chunk' && data.text) {
                  accumulatedText += data.text;
                  scheduleAiRender();
                }
                // Final result event
                else if (data.type === 'final_result' && data.response && !accumulatedText) {
                  accumulatedText = data.response;
                  scheduleAiRender(true);
                }
                // D: Error event
                else if (data.type === 'error') {
                  accumulatedText += '\n[خطأ: ' + (data.message || '') + ']';
                  scheduleAiRender(true);
                }
                // E: Permission Request from Safe Mode middleware
                else if (data.type === 'permission_request') {
                  playBeep(900, 0.2);
                  announce('انتباه! مطلوب إذنك: ' + data.question);

                  // 1. Target dedicated prompt slot right above the input bar, with fallback
                  const aiSlot = document.getElementById('ai-interactive-prompt-slot');
                  const targetContainer = aiSlot || stepsTracker || document.getElementById('interactive-prompt-slot');
                  if (targetContainer) {
                    // Remove any previous active permission card
                    document.querySelectorAll('.interactive-prompt-card').forEach(el => el.remove());

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

                    card.innerHTML = `
                      <div id="${permTitleId}" class="prompt-title-row" style="display:flex; align-items:center; gap:8px; margin-bottom:10px; color:#ffd166; font-weight:800; font-size:1.1rem;">
                        <span style="font-size:1.4rem;" aria-hidden="true">🔐</span>
                        <span>مطلوب إذنك لتنفيذ هذا الإجراء:</span>
                      </div>
                      <div id="${permQuestionId}" style="background:rgba(0,0,0,0.6); border-radius:8px; padding:12px 14px; font-size:1.05rem; color:#fff; word-break:break-word; direction:rtl; text-align:right; line-height:1.6; white-space:pre-wrap; border-right:4px solid var(--accent-yellow);">
                        ${escapeHtml(data.question)}
                      </div>
                      <div class="prompt-options-grid" role="group" aria-label="خيارات الموافقة" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-choice-yes perm-btn" data-perm-key="y" style="flex:1; min-height:48px; background:var(--accent-green); color:#000; font-weight:800; border-radius:8px; font-size:1rem; cursor:pointer;" aria-label="موافقة على العملية (نعم - مفتاح Y)">
                          <span>✅ موافقة (Yes - Y)</span>
                        </button>
                        <button type="button" class="btn btn-choice-no perm-btn" data-perm-key="n" style="flex:1; min-height:48px; background:var(--accent-red); color:#fff; font-weight:800; border-radius:8px; font-size:1rem; cursor:pointer;" aria-label="رفض العملية (لا - مفتاح N)">
                          <span>❌ رفض (No - N)</span>
                        </button>
                        <button type="button" class="btn btn-choice-always perm-btn" data-perm-key="a" style="flex:1; min-height:48px; background:#2b6cb0; color:#fff; font-weight:800; border-radius:8px; font-size:0.95rem; cursor:pointer;" aria-label="موافقة دائماً على هذا النوع (مفتاح A)">
                          <span>🔄 موافقة دائماً (A)</span>
                        </button>
                      </div>
                    `;

                    targetContainer.appendChild(card);
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const sendDecision = async (key) => {
                      try {
                        await fetch('/api/ai/permission', {
                          method: 'POST',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({key: key})
                        });
                      } catch(err) {}
                      const labels = {y: 'تمت الموافقة ✅', n: 'تم الرفض ❌', a: 'موافقة دائماً ✅🔄'};
                      announce(labels[key] || key);
                      card.remove();
                    };

                    // Attach click handlers to send decision
                    card.querySelectorAll('.perm-btn').forEach(btn => {
                      btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        sendDecision(this.getAttribute('data-perm-key'));
                      });
                    });

                    // Keyboard shortcuts for screen reader / quick access
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

                    // Focus first button for TalkBack immediately
                    const firstBtn = card.querySelector('.perm-btn');
                    if (firstBtn) {
                      setTimeout(() => firstBtn.focus(), 100);
                    }
                  }
                }
                // F: Permission Result confirmation
                else if (data.type === 'permission_result') {
                  document.querySelectorAll('.interactive-prompt-card').forEach(el => el.remove());
                  announce(data.label || 'تم الرد على طلب الإذن');
                  const li = document.createElement('li');
                  li.className = 'step-item done';
                  li.innerHTML = '<span class="step-icon">🔐</span> <span>' + escapeHtml(data.label || '') + '</span>';
                  stepsList.appendChild(li);
                }
              } catch (e) {}
            }
          }
        }

        scheduleAiRender(true);
        aiCard.classList.remove('generating');
        if (aiTitle) aiTitle.textContent = 'إجابة الوكيل الذكي:';
        playSuccessChime();
        announce('اكتمل عمل ورد الوكيل الذكي بنجاح.');
        console.log('ANTIGRAVITY_TASK_FINISHED');
        document.title = 'DONE:اكتملت المهمة في Antigravity';

      } catch (err) {
        if (err.name === 'AbortError') {
          accumulatedText += '\n\n*(تم إيقاف الرد بواسطة المستخدم)*';
          scheduleAiRender(true);
          announce('تم إيقاف الرد');
        } else {
          if (accumulatedText && accumulatedText.trim()) {
            aiContentDiv.innerHTML = renderMarkdown(accumulatedText) +
              '<div class="connection-notice" style="margin-top:12px; padding:10px 14px; background:rgba(255, 204, 0, 0.12); border:1px solid var(--accent-yellow); border-radius:8px; color:var(--accent-yellow); font-size:0.88rem;">' +
                '⚠️ حدث انقطاع مؤقت في تدفق الشبكة (' + escapeHtml(err.message) + '). الإجابة المكتملة محفوظة في سجل الجلسة، وجارٍ استعادتها تلقائياً...' +
              '</div>';
            // Auto-recovery: query conversation transcript after 2.5s to fetch completed response
            setTimeout(async () => {
              if (currentActiveConversationId) {
                try {
                  const res = await fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId));
                  if (res.ok) {
                    const convData = await res.json();
                    const lastAgent = (convData.messages || []).filter(m => m.role === 'agent').pop();
                    if (lastAgent && lastAgent.text && lastAgent.text.length >= accumulatedText.length) {
                      accumulatedText = lastAgent.text;
                      scheduleAiRender(true);
                      announce('تم استرداد وتحديث كامل إجابة الوكيل بنجاح من السيرفر');
                    }
                  }
                } catch(e) {}
              }
            }, 2500);
          } else {
            aiContentDiv.innerHTML = '<p style="color:var(--accent-red)">⚠️ تعذر الاتصال بالوكيل: ' + escapeHtml(err.message) + '</p>';
            announce('تعذر الاتصال بالوكيل');
          }
        }
        aiCard.classList.remove('generating');
      } finally {
        if (renderRafId) {
          cancelAnimationFrame(renderRafId);
          clearTimeout(renderRafId);
          renderRafId = null;
        }
        scheduleAiRender(true);
        isAiGenerating = false;
        aiAbortController = null;
        updateSystemUsage();
        if (currentActiveConversationId) {
          fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId))
            .then(r => r.json())
            .then(convData => {
              const msgs = convData.messages || [];
              const lastAgent = msgs.filter(m => m.role === 'agent').pop();
              if (lastAgent && lastAgent.id) {
                aiCard.setAttribute('data-msg-id', lastAgent.id);
                if (lastAgent.time) aiCard.setAttribute('data-msg-time', lastAgent.time);
              }
            }).catch(() => {});
        }
      }
    }

    if (aiForm) {
      aiForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (document.getElementById('slash-autocomplete-popup') || document.getElementById('at-autocomplete-popup')) return;
        if (aiInput) sendAiPrompt(aiInput.value);
      });
    }

    if (aiInput) {
      if (typeof window.attachSlashAutocomplete === 'function') {
        window.attachSlashAutocomplete(aiInput);
      }
      if (typeof window.attachAtAutocomplete === 'function') {
        window.attachAtAutocomplete(aiInput);
      }
      aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // If slash or at popup is open, do not submit
          if (document.getElementById('slash-autocomplete-popup') || document.getElementById('at-autocomplete-popup')) return;
          e.preventDefault();
          sendAiPrompt(aiInput.value);
        }
      });
    }

    if (btnAiAbort) {
      btnAiAbort.addEventListener('click', async () => {
        if (!isAiGenerating && !aiAbortController) {
          announce('لا توجد مهمة قيد التشغيل حالياً');
          return;
        }
        playBeep(440, 0.15);
        announce('جارٍ إيقاف المهمة الجارية...');
        if (aiAbortController) {
          aiAbortController.abort();
          aiAbortController = null;
        }
        try { await fetch('/api/ai/abort', { method: 'POST' }); } catch(e) {}
        isAiGenerating = false;
        announce('تم إيقاف المهمة الجارية بنجاح');
      });
    }


    if (btnNewAiChat) {
      btnNewAiChat.addEventListener('click', async () => {
        forceNewSession = true;
        currentActiveConversationId = null;
        try {
          await fetch('/api/ai/chat/reset', { method: 'POST' });
        } catch(e) {}
        if (valSessionTitle) valSessionTitle.textContent = 'محادثة جديدة';
        if (settingsActiveConv) settingsActiveConv.textContent = 'جديدة';
        aiChatFeed.innerHTML = '';
        announce('تم تفريغ الذاكرة وبدء جلسة جديدة بالكامل');
        playBeep(600, 0.08);
        if (aiInput) {
          aiInput.value = '';
          aiInput.focus();
        }
      });
    }

    if (btnAiNewBottom && btnNewAiChat) {
      btnAiNewBottom.addEventListener('click', () => {
        btnNewAiChat.click();
      });
    }

    let isSyncingConversation = false;

    async function syncActiveConversationMessages() {
      if (!currentActiveConversationId || isAiGenerating || isSyncingConversation || forceNewSession) return;
      isSyncingConversation = true;
      try {
        const res = await fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId));
        if (!res.ok) return;
        const data = await res.json();
        const allMessages = data.messages || [];
        
        const textAgentMsgs = allMessages.filter(m => m.role === 'agent' && ((m.text && m.text.trim()) || m.thinking));
        if (textAgentMsgs.length === 0) return;

        // Pair the last live feed card with its ID from server if it hasn't been tagged yet
        const lastFeedCard = aiChatFeed.querySelector('.chat-message.ai-message:last-child');
        if (lastFeedCard && !lastFeedCard.getAttribute('data-msg-id')) {
          const lastMsg = textAgentMsgs[textAgentMsgs.length - 1];
          if (lastMsg && lastMsg.id) {
            lastFeedCard.setAttribute('data-msg-id', lastMsg.id);
            if (lastMsg.time) lastFeedCard.setAttribute('data-msg-time', lastMsg.time);
          }
        }

        const unrendered = textAgentMsgs.filter(msg => {
          if (!msg.text || !msg.text.trim()) return false;
          if (msg.id && aiChatFeed.querySelector(`[data-msg-id="${msg.id}"]`)) return false;
          if (msg.time && aiChatFeed.querySelector(`[data-msg-time="${msg.time}"]`)) return false;
          return true;
        });

        if (unrendered.length > 0) {
          unrendered.forEach(latestAgentMsg => {
            const card = document.createElement('article');
            card.className = 'chat-message ai-message';
            card.setAttribute('role', 'article');
            card.setAttribute('aria-label', 'رد الوكيل الذكي (مهمة مكتملة)');
            if (latestAgentMsg.id) card.setAttribute('data-msg-id', latestAgentMsg.id);
            if (latestAgentMsg.time) card.setAttribute('data-msg-time', latestAgentMsg.time);

            let thinkingHtml = '';
            if (latestAgentMsg.thinking) {
              thinkingHtml = `
                <div class="thinking-accordion" role="region" aria-label="تحليل وتفكير الوكيل الداخلي">
                  <button type="button" class="thinking-header" aria-expanded="false" aria-label="تفكير واستدلال الوكيل (مغلق، اضغط للعرض)">
                    <div class="thinking-title-wrapper">
                      <span aria-hidden="true">🧠</span>
                      <span>تفكير واستدلال الوكيل</span>
                      <span class="thinking-badge">${latestAgentMsg.thinking.length} حرف</span>
                    </div>
                    <span class="thinking-toggle-icon" aria-hidden="true">▼</span>
                  </button>
                  <div class="thinking-body" hidden dir="auto">${renderMarkdown(latestAgentMsg.thinking)}</div>
                  <div class="thinking-footer" hidden>
                    <button type="button" class="btn-close-thinking" aria-label="إغلاق صندوق التفكير">✕ إغلاق صندوق التفكير (Esc)</button>
                  </div>
                </div>
              `;
            }

            const timeStr = latestAgentMsg.time ? (latestAgentMsg.time.split('T')[1] || '').slice(0,5) : '';
            card.innerHTML = `
              <header class="msg-header">
                <div class="msg-header-left">
                  <span class="ai-avatar" aria-hidden="true">🤖</span>
                  <h3 class="msg-title">الوكيل الذكي (مهمة مكتملة)</h3>
                </div>
                ${timeStr ? `<span class="msg-timestamp">${escapeHtml(timeStr)}</span>` : ''}
                <div class="msg-actions">
                  <button type="button" class="btn-icon-sm btn-copy-msg" aria-label="نسخ الإجابة">📋 نسخ</button>
                </div>
              </header>
              ${thinkingHtml}
              <div class="msg-content markdown-body" dir="rtl">
                ${renderMarkdown(latestAgentMsg.text)}
              </div>
            `;
            aiChatFeed.appendChild(card);

            const copyBtn = card.querySelector('.btn-copy-msg');
            if (copyBtn) {
              copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(latestAgentMsg.text).then(() => announce('تم نسخ النص'));
              });
            }

            if (latestAgentMsg.thinking) {
              const tHeader = card.querySelector('.thinking-header');
              const tBody = card.querySelector('.thinking-body');
              const tFooter = card.querySelector('.thinking-footer');
              const tClose = card.querySelector('.btn-close-thinking');
              const tIcon = card.querySelector('.thinking-toggle-icon');
              const doToggle = (open) => {
                const willOpen = (typeof open === 'boolean') ? open : (tHeader.getAttribute('aria-expanded') !== 'true');
                tHeader.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                if (tIcon) tIcon.textContent = willOpen ? '▲' : '▼';
                if (willOpen) {
                  tBody.removeAttribute('hidden');
                  if (tFooter) tFooter.removeAttribute('hidden');
                  announce('تم فتح صندوق تفكير واستدلال الوكيل');
                } else {
                  tBody.setAttribute('hidden', '');
                  if (tFooter) tFooter.setAttribute('hidden', '');
                  announce('تم إغلاق صندوق تفكير الوكيل');
                  tHeader.focus();
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

            playSuccessChime();
            const cleanAnnounce = latestAgentMsg.text.replace(/[*#_`]/g, '').trim().slice(0, 150);
            announce('تنبيه: وصل رد جديد بعد اكتمال المؤقت: ' + cleanAnnounce);
          });
          const isNearBottom = (aiChatFeed.scrollHeight - aiChatFeed.scrollTop - aiChatFeed.clientHeight) < 180;
          if (isNearBottom) {
            aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
          }
        }
      } catch (e) {
      } finally {
        isSyncingConversation = false;
      }
    }

// Global exports
window.sendAiPrompt = sendAiPrompt;
window.getToolLabel = getToolLabel;
window.syncActiveConversationMessages = syncActiveConversationMessages;
