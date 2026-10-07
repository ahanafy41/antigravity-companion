// ==============================================================================
// Antigravity Native Web Controller & App Initializer
// Features: System Usage, Conversations, Quota, Auth Wizard, Skills, Plugins,
//           Subagents, Native App Drawer, Model Picker, Tasks Monitor, Screen Visibility & PWA
// ==============================================================================

(function() {
  'use strict';

  // DOM Elements shared across native controllers
  const aiChatFeed = document.getElementById('ai-chat-feed');
  const aiInput = document.getElementById('ai-prompt-input');
  const btnNewAiChat = document.getElementById('btn-new-ai-chat');
  const btnAiNewBottom = document.getElementById('btn-ai-new-bottom');
  const settingsDialog = document.getElementById('settings-dialog');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseDialog = document.getElementById('btn-close-dialog');
  const btnCloseDialogTop = document.getElementById('btn-close-dialog-top');
  const selectModel = document.getElementById('select-model');
  const checkContinue = document.getElementById('check-session-continue');

  // Skills Manager elements
  const skillsDialog = document.getElementById('skills-dialog');
  const btnOpenSkills = document.getElementById('btn-open-skills');
  const btnCloseSkills = document.getElementById('btn-close-skills');
  const btnCloseSkillsTop = document.getElementById('btn-close-skills-top');
  const skillsListContainer = document.getElementById('skills-list-container');

  // Conversations & System Resources elements
  const btnOpenConversations = document.getElementById('btn-open-conversations');
  const conversationsDialog = document.getElementById('conversations-dialog');
  const btnCloseConversations = document.getElementById('btn-close-conversations');
  const btnCloseConversationsTop = document.getElementById('btn-close-conversations-top');
  const conversationsListContainer = document.getElementById('conversations-list-container');
  const valSessionTitle = document.getElementById('val-session-title');
  const valRam = document.getElementById('val-ram');
  const fillRam = document.getElementById('fill-ram');
  const valDisk = document.getElementById('val-disk');
  const fillDisk = document.getElementById('fill-disk');
  const btnRefreshStats = document.getElementById('btn-refresh-stats');
  const settingsRamText = document.getElementById('settings-ram-text');
  const settingsRamFill = document.getElementById('settings-ram-fill');
  const settingsDiskText = document.getElementById('settings-disk-text');
  const settingsDiskFill = document.getElementById('settings-disk-fill');
  const settingsActiveConv = document.getElementById('settings-active-conv');
  const btnSettingsRefreshStats = document.getElementById('btn-settings-refresh-stats');

  // Tokens & Quota elements
  const valAiTokens = document.getElementById('val-ai-tokens');
  const valAiContext = document.getElementById('val-ai-context');
  const fillAiContext = document.getElementById('fill-ai-context');
  const settingsContextText = document.getElementById('settings-context-text');
  const settingsContextFill = document.getElementById('settings-context-fill');
  const settingsLastTokens = document.getElementById('settings-last-tokens');
  const settingsSessionTokens = document.getElementById('settings-session-tokens');
  const settingsInputTokens = document.getElementById('settings-input-tokens');
  const settingsOutputTokens = document.getElementById('settings-output-tokens');

    // ==========================================
    // SYSTEM USAGE & CONVERSATIONS CONTROLLER
    // ==========================================
    async function updateSystemUsage() {
      try {
        const res = await fetch('/api/system/usage');
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

    async function loadConversationsList() {
      if (!conversationsListContainer) return;
      conversationsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري تحميل سجل المحادثات...</div>';
      try {
        const res = await fetch('/api/ai/conversations');
        if (!res.ok) throw new Error('فشل جلب المحادثات');
        const data = await res.json();
        const convs = data.conversations || [];
        if (convs.length === 0) {
          conversationsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد محادثات سابقة محفوظة.</div>';
          return;
        }

        conversationsListContainer.innerHTML = '';
        convs.forEach(c => {
          const item = document.createElement('div');
          const isCurrent = currentActiveConversationId === c.id;
          item.className = 'conv-card-item' + (isCurrent ? ' active' : '');
          item.setAttribute('role', 'listitem');

          item.innerHTML = `
            <div class="conv-card-info">
              <div class="conv-card-title">${escapeHtml(c.title)}</div>
              <div class="conv-card-meta">
                <span>📅 ${escapeHtml(c.date)}</span>
                <span>🔢 ${c.steps} خطوة</span>
                ${isCurrent ? '<span style="color:var(--accent-green); font-weight:bold;">● المحادثة النشطة</span>' : ''}
              </div>
            </div>
            <button type="button" class="btn-resume-conv" data-id="${escapeHtml(c.id)}" data-title="${escapeHtml(c.title)}" aria-label="استئناف المحادثة: ${escapeHtml(c.title)}">
              ${isCurrent ? 'مفتوحة الآن' : 'استئناف 💬'}
            </button>
          `;

          const resumeBtn = item.querySelector('.btn-resume-conv');
          resumeBtn.addEventListener('click', async () => {
            await resumeConversation(c.id, c.title);
          });

          conversationsListContainer.appendChild(item);
        });
      } catch (err) {
        conversationsListContainer.innerHTML = `<div style="color:var(--accent-red); padding:12px;">تعذر تحميل السجل: ${escapeHtml(err.message)}</div>`;
      }
    }

    async function resumeConversation(convId, convTitle) {
      announce('جاري استئناف المحادثة...');
      try {
        const res = await fetch('/api/ai/conversation?id=' + encodeURIComponent(convId));
        if (!res.ok) throw new Error('فشل تحميل تفاصيل المحادثة');
        const data = await res.json();
        const messages = data.messages || [];

        currentActiveConversationId = convId;
        forceNewSession = false;

        if (valSessionTitle) {
          valSessionTitle.textContent = convTitle.length > 25 ? convTitle.slice(0, 22) + '...' : convTitle;
          valSessionTitle.title = convTitle;
        }
        if (settingsActiveConv) {
          settingsActiveConv.textContent = convTitle;
        }

        // Render conversation history
        aiChatFeed.innerHTML = '';
        if (messages.length === 0) {
          aiChatFeed.innerHTML = '<article class="chat-message ai-message"><div class="msg-content markdown-body" dir="rtl"><p>محادثة فارغة، يمكنك البدء بكتابة طلبك الآن.</p></div></article>';
        } else {
          messages.forEach(msg => {
            const isUser = msg.role === 'user';
            const card = document.createElement('article');
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

            card.innerHTML = `
              <header class="msg-header">
                <div class="msg-header-left">
                  <span class="ai-avatar" aria-hidden="true">${isUser ? '👤' : '🤖'}</span>
                  <h3 class="msg-title">${isUser ? 'أنت' : 'الوكيل الذكي'}</h3>
                </div>
                ${msg.time ? `<span class="msg-timestamp">${escapeHtml((msg.time.split('T')[1] || '').slice(0,5))}</span>` : ''}
              </header>
              ${thinkingHtml}
              <div class="msg-content markdown-body" dir="rtl">
                ${isUser ? escapeHtml(msg.text) : (renderMarkdown(msg.text) || '<p style="color:var(--text-muted); font-style:italic;">(لا يوجد نص إضافي في هذا الرد)</p>')}
              </div>
            `;
            aiChatFeed.appendChild(card);

            // Bind toggle events if thinking accordion exists
            if (!isUser && msg.thinking) {
              const tHeader = card.querySelector('.thinking-header');
              const tBody = card.querySelector('.thinking-body');
              const tFooter = card.querySelector('.thinking-footer');
              const tClose = card.querySelector('.btn-close-thinking');
              const tIcon = card.querySelector('.thinking-toggle-icon');
              const doToggle = (open) => {
                const willOpen = (typeof open === 'boolean') ? open : (tHeader.getAttribute('aria-expanded') !== 'true');
                tHeader.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                tHeader.setAttribute('aria-label', willOpen ? 'تفكير واستدلال الوكيل (مفتوح، اضغط للإخفاء)' : 'تفكير واستدلال الوكيل (مغلق، اضغط للعرض)');
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
          });
        }

        aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
        if (conversationsDialog) conversationsDialog.close();
        playSuccessChime();
        announce(`تم استئناف المحادثة بنجاح: ${convTitle}`);
        if (aiInput) aiInput.focus();
      } catch (err) {
        playBeep(400, 0.2);
        announce('حدث خطأ أثناء استئناف المحادثة: ' + err.message);
      }
    }

    if (btnOpenConversations && conversationsDialog) {
      btnOpenConversations.addEventListener('click', async () => {
        conversationsDialog.showModal();
        announce('تم فتح سجل وأرشيف المحادثات السابقة');
        await loadConversationsList();
      });
    }
    if (btnCloseConversations && conversationsDialog) {
      btnCloseConversations.addEventListener('click', () => conversationsDialog.close());
    }
    if (btnCloseConversationsTop && conversationsDialog) {
      btnCloseConversationsTop.addEventListener('click', () => conversationsDialog.close());
    }

    
    // ==========================================
    // ANTIGRAVITY QUOTA CONTROLLER
    // ==========================================
    const btnOpenQuota = document.getElementById('btn-open-quota');
    const btnOpenQuotaInline = document.getElementById('btn-open-quota-inline');
    const quotaDialog = document.getElementById('quota-dialog');
    const btnCloseQuota = document.getElementById('btn-close-quota');
    const btnCloseQuotaTop = document.getElementById('btn-close-quota-top');
    const btnForceRefreshQuota = document.getElementById('btn-force-refresh-quota');
    const quotaCardsContainer = document.getElementById('quota-cards-container');
    const valQuotaGoogle = document.getElementById('val-quota-google');
    const valQuotaClaude = document.getElementById('val-quota-claude');

    function formatQuotaResetInfo(isoStr) {
      if (!isoStr) return { dateStr: '--', countdownStr: '--', isPassed: false };
      try {
        const target = new Date(isoStr);
        if (isNaN(target.getTime())) return { dateStr: isoStr, countdownStr: '--', isPassed: false };
        const now = new Date();
        const diffMs = target.getTime() - now.getTime();

        const dateStr = target.toLocaleString('ar-EG', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        if (diffMs <= 0) {
          return { dateStr, countdownStr: 'انتهى الانتظار (تم التجديد)', isPassed: true };
        }

        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;

        let countdownStr = '';
        if (days > 0) {
          countdownStr = `متبقي ${days} يوم و ${remHours} ساعة`;
        } else if (hours > 0) {
          countdownStr = `متبقي ${hours} س و ${mins} د`;
        } else {
          countdownStr = `متبقي ${mins} دقيقة فقط`;
        }
        return { dateStr, countdownStr, isPassed: false };
      } catch(e) {
        return { dateStr: isoStr, countdownStr: '--', isPassed: false };
      }
    }

    async function loadQuotaData(force = false) {
      if (btnForceRefreshQuota && force) {
        btnForceRefreshQuota.disabled = true;
        btnForceRefreshQuota.textContent = '⏳ جاري الاستعلام...';
      }
      if (quotaCardsContainer && (!quotaCardsContainer.children.length || force)) {
        quotaCardsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري الاتصال بمحرك Antigravity لجلب الحصص الحية...</div>';
      }
      try {
        if (force) announce('جاري الاتصال المباشر بمحرك Antigravity لجلب الحصص، يرجى الانتظار ثوانٍ...');
        const res = await fetch('/api/ai/quota' + (force ? '?refresh=1' : ''));
        if (!res.ok) throw new Error('فشل جلب الحصص');
        const data = await res.json();
        const quotas = data.quotas || [];

        // Update Top Bar Indicators
        quotas.forEach(q => {
          if (q.group.includes('Gemini') && q.limit_type.includes('Five Hour')) {
            if (valQuotaGoogle) valQuotaGoogle.textContent = q.pct;
          } else if (q.group.includes('Claude') && q.limit_type.includes('Five Hour')) {
            if (valQuotaClaude) valQuotaClaude.textContent = q.pct;
          }
        });

        if (!quotaCardsContainer) return;
        if (quotas.length === 0) {
          quotaCardsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا تتوفر معلومات الحصص حالياً. اضغط على تحديث فوري.</div>';
          return;
        }

        quotaCardsContainer.innerHTML = '';
        quotas.forEach(q => {
          const card = document.createElement('div');
          card.className = 'conv-card-item';
          card.setAttribute('role', 'listitem');

          const isGoogle = q.group.includes('Gemini');
          const icon = isGoogle ? '🌐' : '🤖';
          const isFiveHour = q.limit_type.includes('Five Hour');
          const typeLabel = isFiveHour ? 'حصة الـ 5 ساعات المتجددة (Rolling 5-Hour)' : 'الحد الأسبوعي الشامل (Weekly Limit)';
          const color = q.pct_val > 50 ? 'var(--accent-green)' : (q.pct_val > 20 ? '#f1c40f' : 'var(--accent-red)');
          const resetInfo = formatQuotaResetInfo(q.reset_time);

          card.setAttribute('aria-label', `${q.group}: متبقي ${q.pct}. ${resetInfo.countdownStr}. موعد التجديد ${resetInfo.dateStr}`);

          card.innerHTML = `
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:700; font-size:0.98rem; color:var(--text-main);">
                  ${icon} ${escapeHtml(q.group)}
                </span>
                <span style="font-weight:800; font-size:1.1rem; color:${color};">
                  ${q.pct} متبقي
                </span>
              </div>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">
                ${typeLabel}
              </div>
              <div class="mini-progress-track" style="width:100%; height:8px; margin-bottom:6px;">
                <div class="mini-progress-fill" style="width:${q.pct_val}%; height:100%; background:${color};"></div>
              </div>
              <div style="font-size:0.82rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                <span>⏳ التجديد: <strong style="color:var(--accent-cyan);">${escapeHtml(resetInfo.countdownStr)}</strong></span>
                <span style="font-size:0.75rem;">(${escapeHtml(resetInfo.dateStr)})</span>
              </div>
            </div>
          `;
          quotaCardsContainer.appendChild(card);
        });

        if (force) {
          playSuccessChime();
          announce('تم تحديث الحصص الرسمية بنجاح من محرك Antigravity');
        }
      } catch (err) {
        if (quotaCardsContainer) {
          quotaCardsContainer.innerHTML = `<div style="color:var(--accent-red); padding:15px; text-align:center;">تعذر جلب الحصص: ${escapeHtml(err.message)}</div>`;
        }
      } finally {
        if (btnForceRefreshQuota) {
          btnForceRefreshQuota.disabled = false;
          btnForceRefreshQuota.textContent = '🔄 تحديث فوري';
        }
      }
    }

    if (btnOpenQuota && quotaDialog) {
      btnOpenQuota.addEventListener('click', () => {
        quotaDialog.showModal();
        announce('تم فتح نافذة حصص ونسب استهلاك النماذج المتبقية');
        loadQuotaData(false);
      });
    }

    if (btnOpenQuotaInline && quotaDialog) {
      btnOpenQuotaInline.addEventListener('click', () => {
        quotaDialog.showModal();
        announce('تم فتح نافذة حصص ونسب استهلاك النماذج المتبقية');
        loadQuotaData(false);
      });
    }

    if (btnCloseQuota && quotaDialog) {
      btnCloseQuota.addEventListener('click', () => quotaDialog.close());
    }
    if (btnCloseQuotaTop && quotaDialog) {
      btnCloseQuotaTop.addEventListener('click', () => quotaDialog.close());
    }
    if (btnForceRefreshQuota) {
      btnForceRefreshQuota.addEventListener('click', () => loadQuotaData(true));
    }

    // Auto-load quota on page init and every 60 seconds
    loadQuotaData(false);
    setInterval(() => loadQuotaData(false), 60000);

    // ==========================================
    // ACCESSIBLE AUTH WIZARD CONTROLLER (REQ-010)
    // ==========================================
    const authWizardDialog = document.getElementById('auth-wizard-dialog');
    const btnOpenAuthWizard = document.getElementById('btn-open-auth-wizard');
    const btnHeaderAuth = document.getElementById('btn-header-auth');
    const headerAuthBadge = document.getElementById('header-auth-badge');
    const drawerAuthBadge = document.getElementById('drawer-auth-badge');
    const btnCloseAuthWizard = document.getElementById('btn-close-auth-wizard');
    const btnCloseAuthWizardTop = document.getElementById('btn-close-auth-wizard-top');
    
    const authCardBadge = document.getElementById('auth-card-badge');
    const authCardDesc = document.getElementById('auth-card-desc');
    const btnStartAuthWizard = document.getElementById('btn-start-auth-wizard');
    const btnAuthLogout = document.getElementById('btn-auth-logout');

    const authStepIdle = document.getElementById('auth-step-idle');
    const authStepCode = document.getElementById('auth-step-code');
    const authStepTerms = document.getElementById('auth-step-terms');
    const authStepLoading = document.getElementById('auth-step-loading');
    const authLoadingText = document.getElementById('auth-loading-text');

    const btnOpenGoogleLoginUrl = document.getElementById('btn-open-google-login-url');
    const authCodeInput = document.getElementById('auth-code-input');
    const btnSubmitAuthCode = document.getElementById('btn-submit-auth-code');
    const btnCancelAuthWizard = document.getElementById('btn-cancel-auth-wizard');
    const btnAcceptAuthTerms = document.getElementById('btn-accept-auth-terms');
    const btnDeclineAuthTerms = document.getElementById('btn-decline-auth-terms');

    let authPollTimer = null;

    async function checkAuthStatus(silent) {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        const auth = data.auth || {};
        const wizard = data.wizard || {};

        if (auth.logged_in && auth.is_valid) {
          const emailDisplay = auth.email ? auth.email.split('@')[0] : 'متصل';
          if (headerAuthBadge) headerAuthBadge.textContent = '👤 ' + emailDisplay;
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'متصل (' + (auth.email || '') + ')';
            drawerAuthBadge.style.color = '#10b981';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'حساب جوجل مسجل ونشط: ' + (auth.email || ''));
          }
        } else if (auth.logged_in && !auth.is_valid) {
          if (headerAuthBadge) headerAuthBadge.textContent = '⚠️ الجلسة منتهية';
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'منتهي الصلاحية';
            drawerAuthBadge.style.color = '#f59e0b';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'جلسة الحساب منتهية الصلاحية، اضغط لتجديد تسجيل الدخول');
          }
        } else {
          if (headerAuthBadge) headerAuthBadge.textContent = 'تسجيل الدخول';
          if (drawerAuthBadge) {
            drawerAuthBadge.textContent = 'غير مسجل';
            drawerAuthBadge.style.color = '#06b6d4';
          }
          if (btnHeaderAuth) {
            btnHeaderAuth.setAttribute('aria-label', 'تسجيل الدخول بحساب Google');
          }
        }

        if (authWizardDialog && authWizardDialog.open) {
          updateAuthWizardUI(auth, wizard);
        }

        if (wizard.is_running && wizard.state !== 'SUCCESS' && wizard.state !== 'ERROR') {
          if (!authPollTimer) {
            authPollTimer = setInterval(() => checkAuthStatus(true), 1500);
          }
        } else {
          if (authPollTimer) {
            clearInterval(authPollTimer);
            authPollTimer = null;
          }
        }

        return data;
      } catch (err) {
        console.error('Error fetching auth status:', err);
      }
    }

    function updateAuthWizardUI(auth, wizard) {
      if (!authCardBadge || !authCardDesc) return;

      if (authStepIdle) authStepIdle.style.display = 'none';
      if (authStepCode) authStepCode.style.display = 'none';
      if (authStepTerms) authStepTerms.style.display = 'none';
      if (authStepLoading) authStepLoading.style.display = 'none';

      if (wizard && wizard.is_running) {
        if (wizard.state === 'STARTING') {
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = wizard.prompt_message || '⏳ جاري تهيئة جلسة تسجيل الدخول...';
          }
        } else if (wizard.state === 'WAITING_FOR_CODE') {
          if (authStepCode) {
            authStepCode.style.display = 'block';
            if (btnOpenGoogleLoginUrl) {
              if (wizard.auth_url) {
                btnOpenGoogleLoginUrl.href = wizard.auth_url;
                btnOpenGoogleLoginUrl.removeAttribute('aria-disabled');
                btnOpenGoogleLoginUrl.style.opacity = '1';
                btnOpenGoogleLoginUrl.style.pointerEvents = 'auto';
                btnOpenGoogleLoginUrl.textContent = 'فتح صفحة Google للمصادقة';
              } else {
                btnOpenGoogleLoginUrl.href = '#';
                btnOpenGoogleLoginUrl.setAttribute('aria-disabled', 'true');
                btnOpenGoogleLoginUrl.style.opacity = '0.6';
                btnOpenGoogleLoginUrl.style.pointerEvents = 'none';
                btnOpenGoogleLoginUrl.textContent = '⏳ جاري تحضير الرابط...';
              }
            }
          }
        } else if (wizard.state === 'WAITING_FOR_TERMS') {
          if (authStepTerms) {
            authStepTerms.style.display = 'block';
          }
        }
        authCardBadge.textContent = 'جاري المصادقة';
        authCardBadge.style.background = '#3b82f6';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = wizard.prompt_message || 'جلسة تسجيل الدخول قيد التنفيذ في الخلفية.';
        return;
      }

      if (auth.logged_in && auth.is_valid) {
        authCardBadge.textContent = 'نشط ومصرح';
        authCardBadge.style.background = '#10b981';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'تم تسجيل الدخول بنجاح بحساب: ' + (auth.email || 'معتمد') + (auth.expiry ? ' (تنتهي في: ' + auth.expiry.substring(0, 10) + ')' : '');
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تبديل الحساب أو إعادة التسجيل';
        if (btnAuthLogout) btnAuthLogout.style.display = 'inline-block';
      } else if (auth.logged_in && !auth.is_valid) {
        authCardBadge.textContent = 'الجلسة منتهية';
        authCardBadge.style.background = '#f59e0b';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'انتهت صلاحية جلسة الحساب (' + (auth.email || '') + '). يرجى إعادة تسجيل الدخول لتجديد التوكن.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تجديد تسجيل الدخول بحساب Google';
        if (btnAuthLogout) btnAuthLogout.style.display = 'inline-block';
      } else {
        authCardBadge.textContent = 'غير مسجل';
        authCardBadge.style.background = '#6b7280';
        authCardBadge.style.color = '#fff';
        authCardDesc.textContent = 'لم يتم تسجيل أي حساب Google حتى الآن. اضغط على الزر أدناه لبدء التسجيل بسهولة.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        if (btnStartAuthWizard) btnStartAuthWizard.textContent = 'تسجيل الدخول بحساب Google';
        if (btnAuthLogout) btnAuthLogout.style.display = 'none';
      }
    }

    if (btnOpenAuthWizard && authWizardDialog) {
      btnOpenAuthWizard.addEventListener('click', () => {
        authWizardDialog.showModal();
        announce('تم فتح نافذة حساب Google ومصادقة الوكيل');
        checkAuthStatus(false);
      });
    }

    if (btnHeaderAuth && authWizardDialog) {
      btnHeaderAuth.addEventListener('click', () => {
        authWizardDialog.showModal();
        announce('تم فتح نافذة حساب Google ومصادقة الوكيل');
        checkAuthStatus(false);
      });
    }

    if (btnCloseAuthWizard && authWizardDialog) {
      btnCloseAuthWizard.addEventListener('click', () => {
        if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
        authWizardDialog.close();
      });
    }

    if (btnCloseAuthWizardTop && authWizardDialog) {
      btnCloseAuthWizardTop.addEventListener('click', () => {
        if (authPollTimer) { clearInterval(authPollTimer); authPollTimer = null; }
        authWizardDialog.close();
      });
    }

    if (btnOpenGoogleLoginUrl) {
      btnOpenGoogleLoginUrl.addEventListener('click', (e) => {
        e.preventDefault();
        const href = btnOpenGoogleLoginUrl.getAttribute('href');
        if (!href || href === '#' || href === 'javascript:void(0)') {
          announce('رابط تسجيل الدخول قيد التحضير، يرجى الانتظار ثوانٍ معدودة');
          return;
        }
        announce('جاري فتح صفحة تسجيل الدخول في متصفح الهاتف الخارجي');
        fetch('/api/auth/open_browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: href })
        }).catch((err) => {
          console.error('Failed to trigger open_browser:', err);
        });
      });
    }

    if (btnStartAuthWizard) {
      btnStartAuthWizard.addEventListener('click', async () => {
        try {
          if (authStepIdle) authStepIdle.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري تهيئة رابط المصادقة من جوجل...';
          }
          if (btnOpenGoogleLoginUrl) {
            btnOpenGoogleLoginUrl.href = '#';
            btnOpenGoogleLoginUrl.setAttribute('aria-disabled', 'true');
            btnOpenGoogleLoginUrl.style.opacity = '0.6';
            btnOpenGoogleLoginUrl.style.pointerEvents = 'none';
            btnOpenGoogleLoginUrl.textContent = '⏳ جاري تحضير الرابط...';
          }
          announce('جاري بدء جلسة تسجيل الدخول');
          await fetch('/api/auth/start', { method: 'POST' });
          checkAuthStatus(false);
        } catch (err) {
          announce('حدث خطأ أثناء بدء تسجيل الدخول');
          console.error(err);
        }
      });
    }

    if (btnSubmitAuthCode) {
      btnSubmitAuthCode.addEventListener('click', async () => {
        const code = (authCodeInput ? authCodeInput.value : '').trim();
        if (!code) {
          announce('يرجى إدخال أو لصق كود المصادقة أولاً');
          if (authCodeInput) authCodeInput.focus();
          return;
        }
        try {
          if (authStepCode) authStepCode.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري إرسال الكود والتحقق من التراخيص...';
          }
          announce('جاري التحقق من الكود وتفعيل الترخيص');
          await fetch('/api/auth/input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
          });
          if (authCodeInput) authCodeInput.value = '';
          checkAuthStatus(false);
        } catch (err) {
          announce('فشل إرسال كود المصادقة');
          console.error(err);
        }
      });
    }

    if (btnAcceptAuthTerms) {
      btnAcceptAuthTerms.addEventListener('click', async () => {
        try {
          if (authStepTerms) authStepTerms.style.display = 'none';
          if (authStepLoading) {
            authStepLoading.style.display = 'block';
            if (authLoadingText) authLoadingText.textContent = '⏳ جاري اعتماد الموافقة على شروط الترخيص...';
          }
          announce('تم إرسال الموافقة على اتفاقية الترخيص');
          await fetch('/api/auth/accept_terms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: true })
          });
          checkAuthStatus(false);
        } catch (err) {
          announce('فشل إرسال الموافقة على الشروط');
          console.error(err);
        }
      });
    }

    if (btnDeclineAuthTerms) {
      btnDeclineAuthTerms.addEventListener('click', async () => {
        try {
          announce('تم رفض الشروط وإلغاء العملية');
          await fetch('/api/auth/accept_terms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: false })
          });
          checkAuthStatus(false);
        } catch (err) {
          console.error(err);
        }
      });
    }

    if (btnCancelAuthWizard) {
      btnCancelAuthWizard.addEventListener('click', async () => {
        try {
          announce('تم إلغاء عملية تسجيل الدخول');
          await fetch('/api/auth/cancel', { method: 'POST' });
          checkAuthStatus(false);
        } catch (err) {
          console.error(err);
        }
      });
    }

    if (btnAuthLogout) {
      btnAuthLogout.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من رغبتك في تسجيل الخروج ومسح بيانات الجلسة؟')) {
          return;
        }
        try {
          announce('جاري تسجيل الخروج ومسح الجلسة');
          const res = await fetch('/api/auth/logout', { method: 'POST' });
          const data = await res.json();
          announce(data.message || 'تم تسجيل الخروج بنجاح');
          checkAuthStatus(false);
          loadQuotaData(true);
        } catch (err) {
          announce('فشل تسجيل الخروج');
          console.error(err);
        }
      });
    }

    // Initialize Auth status on boot
    checkAuthStatus(true);

    // ==========================================
    // SKILLS MANAGER CONTROLLER
    // ==========================================
    async function loadSkillsList() {
      if (!skillsListContainer) return;
      skillsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري فحص المهارات...</div>';
      try {
        const res = await fetch('/api/skills/list');
        const data = await res.json();
        const skills = data.skills || [];
        if (skills.length === 0) {
          skillsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد مهارات مثبتة في ~/.gemini/skills</div>';
          return;
        }

        skillsListContainer.innerHTML = '';
        skills.forEach(skill => {
          const card = document.createElement('div');
          card.style.cssText = 'background:var(--bg-card); border:1px solid ' + (skill.enabled ? 'var(--accent-green)' : 'var(--border-main)') + '; border-radius:8px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;';
          card.setAttribute('role', 'listitem');

          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'flex:1; min-width:0;';
          infoDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <strong style="color:var(--text-main); font-size:1rem;">${escapeHtml(skill.name)}</strong>
              <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; font-weight:bold; background:${skill.enabled ? 'rgba(63,185,80,0.2); color:var(--accent-green);' : 'rgba(139,148,158,0.2); color:var(--text-muted);'}">
                ${skill.enabled ? '🟢 مفعلة' : '⚪ معطلة'}
              </span>
            </div>
            <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4; margin:0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
              ${escapeHtml(skill.description || 'مهارة مخصصة')}
            </p>
          `;

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'btn ' + (skill.enabled ? 'btn-danger' : 'btn-primary');
          toggleBtn.style.cssText = 'min-height:36px; padding:4px 14px; flex-shrink:0; font-size:0.88rem;';
          toggleBtn.setAttribute('aria-label', (skill.enabled ? 'تعطيل مهارة ' : 'تفعيل مهارة ') + skill.name);
          toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';

          toggleBtn.addEventListener('click', async () => {
            const nextState = !skill.enabled;
            toggleBtn.disabled = true;
            toggleBtn.textContent = '⏳ جاري...';
            try {
              const toggleRes = await fetch('/api/skills/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: skill.id, enable: nextState })
              });
              if (toggleRes.ok) {
                const resJson = await toggleRes.json();
                playSuccessChime();
                const actMsg = nextState ? 'تم تفعيل مهارة ' : 'تم تعطيل مهارة ';
                announce(actMsg + skill.name);
                await loadSkillsList();
                if (typeof window.syncDynamicSlashCommandsGlobally === 'function') {
                  window.syncDynamicSlashCommandsGlobally();
                }
              } else {
                let errMsg = 'تعذر تعديل المهارة من الخادم';
                try {
                  const errData = await toggleRes.json();
                  if (errData && errData.error) errMsg = errData.error;
                } catch(_) {}
                playBeep(400, 0.2);
                announce('خطأ: ' + errMsg);
                toggleBtn.disabled = false;
                toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';
              }
            } catch (err) {
              playBeep(400, 0.2);
              announce('حدث خطأ في الاتصال أثناء تعديل المهارة: ' + (err.message || ''));
              toggleBtn.disabled = false;
              toggleBtn.textContent = skill.enabled ? '🚫 تعطيل' : '✅ تفعيل';
            }
          });

          card.appendChild(infoDiv);
          card.appendChild(toggleBtn);
          skillsListContainer.appendChild(card);
        });
      } catch (e) {
        console.error('Failed to load skills list:', e);
        skillsListContainer.innerHTML = '<div style="color:var(--accent-red); padding:10px;">تعذر تحميل قائمة المهارات: ' + escapeHtml(e.message || 'خطأ غير معروف') + '</div>';
        announce('تعذر تحميل قائمة المهارات');
      }
    }

    if (btnOpenSkills && skillsDialog) {
      btnOpenSkills.addEventListener('click', async () => {
        skillsDialog.showModal();
        announce('تم فتح نافذة إدارة مهارات الوكيل');
        await loadSkillsList();
      });
    }

    if (btnCloseSkills && skillsDialog) {
      btnCloseSkills.addEventListener('click', () => skillsDialog.close());
    }
    if (btnCloseSkillsTop && skillsDialog) {
      btnCloseSkillsTop.addEventListener('click', () => skillsDialog.close());
    }

    // ==========================================
    // PLUGINS MANAGER CONTROLLER
    // ==========================================
    const pluginsDialog = document.getElementById('plugins-dialog');
    const btnOpenPlugins = document.getElementById('btn-open-plugins');
    const btnClosePlugins = document.getElementById('btn-close-plugins');
    const btnClosePluginsTop = document.getElementById('btn-close-plugins-top');
    const pluginsListContainer = document.getElementById('plugins-list-container');
    const valPluginsCountDrawer = document.getElementById('val-plugins-count-drawer');

    async function loadPluginsList() {
      if (!pluginsListContainer) return;
      pluginsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري فحص الإضافات...</div>';
      try {
        const res = await fetch('/api/plugins/list');
        const data = await res.json();
        const plugins = data.plugins || [];
        if (valPluginsCountDrawer) valPluginsCountDrawer.textContent = String(plugins.length);
        if (plugins.length === 0) {
          pluginsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد إضافات مثبتة في ~/.gemini/config/plugins</div>';
          return;
        }

        pluginsListContainer.innerHTML = '';
        plugins.forEach(plugin => {
          const card = document.createElement('div');
          card.style.cssText = 'background:var(--bg-card); border:1px solid ' + (plugin.enabled ? 'var(--accent-purple)' : 'var(--border-main)') + '; border-radius:8px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;';
          card.setAttribute('role', 'listitem');

          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'flex:1; min-width:0;';

          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';

          const title = document.createElement('strong');
          title.style.cssText = 'font-size:0.95rem; color:' + (plugin.enabled ? 'var(--accent-purple)' : 'var(--text-muted)') + ';';
          title.textContent = plugin.name;

          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.style.cssText = 'font-size:0.75rem; padding:2px 8px; border-radius:12px; background:' + (plugin.enabled ? 'rgba(188, 140, 255, 0.15)' : 'var(--bg-tertiary)') + '; color:' + (plugin.enabled ? 'var(--accent-purple)' : 'var(--text-muted)') + '; font-weight:700;';
          badge.textContent = plugin.enabled ? 'مفعلة' : 'معطلة';

          titleRow.appendChild(title);
          titleRow.appendChild(badge);

          const desc = document.createElement('div');
          desc.style.cssText = 'font-size:0.82rem; color:var(--text-muted); line-height:1.4;';
          desc.textContent = plugin.description || 'إضافة مخصصة لـ Antigravity';

          infoDiv.appendChild(titleRow);
          infoDiv.appendChild(desc);

          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'btn btn-sm ' + (plugin.enabled ? 'btn-secondary' : 'btn-primary');
          toggleBtn.style.cssText = 'min-width:85px; font-weight:700; flex-shrink:0;';
          toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
          toggleBtn.setAttribute('aria-label', (plugin.enabled ? 'تعطيل إضافة ' : 'تفعيل إضافة ') + plugin.name);

          toggleBtn.addEventListener('click', async () => {
            const nextState = !plugin.enabled;
            toggleBtn.disabled = true;
            toggleBtn.textContent = '⏳ جاري...';
            try {
              const toggleRes = await fetch('/api/plugins/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: plugin.id, enabled: nextState })
              });
              if (toggleRes.ok) {
                if (typeof playSuccessChime === 'function') playSuccessChime();
                const actMsg = nextState ? 'تم تفعيل إضافة ' : 'تم تعطيل إضافة ';
                announce(actMsg + plugin.name);
                await loadPluginsList();
              } else {
                playBeep(400, 0.2);
                announce('تعذر تعديل الإضافة من الخادم');
                toggleBtn.disabled = false;
                toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
              }
            } catch (err) {
              playBeep(400, 0.2);
              announce('حدث خطأ في الاتصال أثناء تعديل الإضافة');
              toggleBtn.disabled = false;
              toggleBtn.textContent = plugin.enabled ? '🚫 تعطيل' : '✅ تفعيل';
            }
          });

          card.appendChild(infoDiv);
          card.appendChild(toggleBtn);
          pluginsListContainer.appendChild(card);
        });
      } catch (e) {
        console.error('Failed to load plugins list:', e);
        pluginsListContainer.innerHTML = '<div style="color:var(--accent-red); padding:10px;">تعذر تحميل قائمة الإضافات</div>';
        announce('تعذر تحميل قائمة الإضافات');
      }
    }

    if (btnOpenPlugins && pluginsDialog) {
      btnOpenPlugins.addEventListener('click', async () => {
        pluginsDialog.showModal();
        announce('تم فتح نافذة إدارة إضافات Antigravity');
        await loadPluginsList();
      });
    }

    if (btnClosePlugins && pluginsDialog) {
      btnClosePlugins.addEventListener('click', () => pluginsDialog.close());
    }
    if (btnClosePluginsTop && pluginsDialog) {
      btnClosePluginsTop.addEventListener('click', () => pluginsDialog.close());
    }

    // ==========================================
    // SUBAGENTS OPERATIONS CONTROLLER
    // ==========================================
    const subagentsDialog = document.getElementById('subagents-dialog');
    const btnOpenSubagents = document.getElementById('btn-open-subagents');
    const btnCloseSubagents = document.getElementById('btn-close-subagents');
    const btnCloseSubagentsTop = document.getElementById('btn-close-subagents-top');
    const btnClearSubagents = document.getElementById('btn-clear-subagents');
    const statSubagents = document.getElementById('stat-subagents');
    const valSubagentsCount = document.getElementById('val-subagents-count');
    const subagentsTeamContainer = document.getElementById('subagents-team-container');

    window.subagentRegistry = [];

    function registerSubagent(agentInfo) {
      window.subagentRegistry.unshift(agentInfo);
      if (valSubagentsCount) {
        valSubagentsCount.textContent = window.subagentRegistry.length;
      }
      renderSubagentsList();
    }

    function updateSubagentMessage(recipient, message) {
      const found = window.subagentRegistry.find(a => a.role === recipient || a.type === recipient);
      if (found) {
        found.lastMessage = message;
        found.lastAction = 'تلقى رسالة وتوجيهات جديدة';
        renderSubagentsList();
      }
    }

    function renderSubagentsList() {
      if (!subagentsTeamContainer) return;
      if (window.subagentRegistry.length === 0) {
        subagentsTeamContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 25px;">لم يتم استدعاء وكلاء فرعيين في هذه الجلسة بعد. عند إطلاق أي وكيل فرعي ستظهر تفاصيله ومهامه هنا فوراً.</div>';
        return;
      }

      subagentsTeamContainer.innerHTML = '';
      window.subagentRegistry.forEach((agent, idx) => {
        const card = document.createElement('article');
        card.className = 'conv-card-item';
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        const ariaLabel = `الوكيل رقم ${idx + 1}: ${agent.role}. الحالة: ${agent.state}. المهمة: ${agent.prompt.slice(0, 80)}`;
        card.setAttribute('aria-label', ariaLabel);

        card.innerHTML = `
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.3rem;" aria-hidden="true">🤖</span>
                <span style="font-weight:800; font-size:1.05rem; color:var(--accent-cyan);">${escapeHtml(agent.role)}</span>
                <span style="font-size:0.8rem; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:12px; color:var(--text-muted); font-family:monospace;">${escapeHtml(agent.type)}</span>
              </div>
              <span style="font-size:0.82rem; padding:3px 10px; border-radius:10px; font-weight:700; background:${agent.state.includes('نشط') ? 'rgba(57, 197, 187, 0.2)' : 'rgba(46, 204, 113, 0.2)'}; color:${agent.state.includes('نشط') ? 'var(--accent-cyan)' : 'var(--accent-green)'};">
                ${agent.state.includes('نشط') ? '🟢 ' + agent.state : '✅ ' + agent.state}
              </span>
            </div>

            <div style="background:rgba(0,0,0,0.3); border-radius:8px; padding:10px; margin-bottom:8px; border-right:3px solid var(--accent-cyan);">
              <div style="font-size:0.85rem; font-weight:700; color:var(--accent-yellow); margin-bottom:4px;">🎯 المهمة المسندة (Prompt):</div>
              <div style="font-size:0.9rem; color:var(--text-main); line-height:1.4; word-break:break-word; max-height:120px; overflow-y:auto;">
                ${escapeHtml(agent.prompt)}
              </div>
            </div>

            ${agent.lastMessage ? `
              <div style="background:rgba(163, 113, 247, 0.1); border-radius:8px; padding:8px 10px; margin-bottom:6px; border-right:3px solid var(--accent-purple);">
                <span style="font-size:0.82rem; font-weight:700; color:var(--accent-purple);">💬 آخر رسالة تواصل: </span>
                <span style="font-size:0.86rem; color:var(--text-main);">${escapeHtml(agent.lastMessage)}</span>
              </div>
            ` : ''}

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.78rem; color:var(--text-muted); margin-top:6px; flex-wrap:wrap; gap:6px;">
              <span>🕒 وقت الإطلاق: ${agent.timestamp || ''}</span>
              <span>⚡ النشاط: ${escapeHtml(agent.lastAction || '')}</span>
            </div>

            <div style="display:flex; gap:8px; margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px;">
              <button type="button" class="btn btn-sm btn-focus-agent" data-agent-role="${escapeHtml(agent.role)}" style="background:var(--accent-cyan); color:#000; font-weight:800; padding:4px 12px; font-size:0.85rem;" aria-label="توجيه المحادثة مباشرة إلى ${escapeHtml(agent.role)}">
                💬 تحدث معه مباشرة
              </button>
              <button type="button" class="btn btn-sm btn-copy-agent-info" data-agent-idx="${idx}" style="background:rgba(255,255,255,0.06); color:var(--text-main); padding:4px 10px; font-size:0.82rem;" aria-label="نسخ بيانات ومهمة الوكيل">
                📋 نسخ المهمة
              </button>
            </div>
          </div>
        `;
        subagentsTeamContainer.appendChild(card);
      });

      // Attach click events for direct talk
      subagentsTeamContainer.querySelectorAll('.btn-focus-agent').forEach(btn => {
        btn.addEventListener('click', function() {
          const role = this.getAttribute('data-agent-role');
          focusSubagent(role);
          if (subagentsDialog) subagentsDialog.close();
        });
      });

      // Attach click events for copying
      subagentsTeamContainer.querySelectorAll('.btn-copy-agent-info').forEach(btn => {
        btn.addEventListener('click', function() {
          const idx = parseInt(this.getAttribute('data-agent-idx'));
          const ag = window.subagentRegistry[idx];
          if (ag && navigator.clipboard) {
            navigator.clipboard.writeText(`الوكيل: ${ag.role}\nالنوع: ${ag.type}\nالمهمة: ${ag.prompt}`).then(() => {
              playBeep(880, 0.08);
              announce('تم نسخ بيانات ومهمة الوكيل');
            });
          }
        });
      });
    }

    if (btnOpenSubagents && subagentsDialog) {
      btnOpenSubagents.addEventListener('click', () => {
        renderSubagentsList();
        subagentsDialog.showModal();
        announce(`تم فتح غرفة عمليات الوكلاء. عدد الوكلاء المسجلين: ${window.subagentRegistry.length}`);
      });
    }

    if (statSubagents && subagentsDialog) {
      statSubagents.addEventListener('click', () => {
        renderSubagentsList();
        subagentsDialog.showModal();
        announce(`تم فتح غرفة عمليات الوكلاء. عدد الوكلاء المسجلين: ${window.subagentRegistry.length}`);
      });
      statSubagents.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          statSubagents.click();
        }
      });
    }

    if (btnCloseSubagents && subagentsDialog) {
      btnCloseSubagents.addEventListener('click', () => subagentsDialog.close());
    }
    if (btnCloseSubagentsTop && subagentsDialog) {
      btnCloseSubagentsTop.addEventListener('click', () => subagentsDialog.close());
    }

    if (btnClearSubagents) {
      btnClearSubagents.addEventListener('click', () => {
        window.subagentRegistry = [];
        if (valSubagentsCount) valSubagentsCount.textContent = '0';
        renderSubagentsList();
        cancelSubagentFocus();
        announce('تم مسح سجل الوكلاء');
        playBeep(450, 0.1);
      });
    }

    // Direct Subagent Messaging Focus
    let activeFocusedAgent = null;
    const subagentFocusBanner = document.getElementById('subagent-focus-banner');
    const focusAgentName = document.getElementById('focus-agent-name');
    const btnCancelAgentFocus = document.getElementById('btn-cancel-agent-focus');
    const btnQuickCreateSubagent = document.getElementById('btn-quick-create-subagent');

    function focusSubagent(agentRole) {
      activeFocusedAgent = agentRole;
      if (focusAgentName) focusAgentName.textContent = agentRole;
      if (subagentFocusBanner) subagentFocusBanner.style.display = 'flex';
      if (aiInput) {
        aiInput.placeholder = `أنت الآن تتحدث مباشرة إلى [${agentRole}]. اكتب سؤالك أو تعليماتك...`;
        aiInput.focus();
      }
      playBeep(720, 0.12);
      announce(`تم توجيه المحادثة مباشرة إلى الوكيل ${agentRole}. اكتب رسالتك واضغط إرسال.`);
    }

    function cancelSubagentFocus() {
      activeFocusedAgent = null;
      if (subagentFocusBanner) subagentFocusBanner.style.display = 'none';
      if (aiInput) {
        aiInput.placeholder = 'اكتب سؤالك أو أمرك هنا... (أو /new لبدء جلسة جديدة)';
      }
      announce('تم إلغاء التوجيه المباشر والعودة للوكيل العام');
    }

    if (btnCancelAgentFocus) {
      btnCancelAgentFocus.addEventListener('click', cancelSubagentFocus);
    }

    if (btnQuickCreateSubagent) {
      btnQuickCreateSubagent.addEventListener('click', () => {
        if (subagentsDialog) subagentsDialog.close();
        if (aiInput) {
          aiInput.value = 'أنشئ وكيلاً فرعياً مخصصاً باسم: [حدد الاسم] بمهمة وتعليمات: [حدد التعليمات]';
          aiInput.focus();
          aiInput.setSelectionRange(aiInput.value.length, aiInput.value.length);
        }
        announce('تم تجهيز قالب إنشاء وكيل فرعي مخصص في حقل الإدخال. اكتب تفاصيل الوكيل واضغط إرسال.');
      });
    }
    // ==============================================================================
    // UNIFIED NATIVE CONTROLLER: APP DRAWER, MODEL PICKER & TASKS MONITOR
    // ==============================================================================
    function syncActiveModelDisplay(modelName) {
      if (!modelName) return;
      window._currentActiveModel = modelName;
      let displayName = modelName;
      if (Array.isArray(window._cachedModels)) {
        const found = window._cachedModels.find(m => m.id === modelName || m.name === modelName);
        if (found && found.name) displayName = found.name;
      }
      const hModel = document.getElementById('header-active-model-name');
      const dModel = document.getElementById('drawer-active-model-name');
      const btnHModel = document.getElementById('btn-header-model');
      if (hModel) hModel.textContent = displayName;
      if (dModel) dModel.textContent = displayName;
      if (btnHModel) {
        btnHModel.setAttribute('aria-label', `النموذج النشط حالياً: ${displayName}. اضغط لتغيير النموذج`);
      }

      // Check if Claude model (fixed effort)
      const isClaude = (modelName || '').toLowerCase().includes('claude');
      const effortGroup = document.querySelector('.drawer-effort-group');
      if (effortGroup) {
        if (isClaude) {
          effortGroup.setAttribute('aria-label', 'مستوى التفكير: مدمج وتلقائي لنموذج كلود');
        } else {
          effortGroup.setAttribute('aria-label', 'مستوى التفكير');
        }
      }
      document.querySelectorAll('.btn-effort').forEach(b => {
        if (isClaude) {
          b.setAttribute('aria-disabled', 'true');
          b.style.opacity = '0.5';
          b.style.cursor = 'not-allowed';
        } else {
          b.removeAttribute('aria-disabled');
          b.style.opacity = '1';
          b.style.cursor = 'pointer';
        }
      });
    }
    window.syncActiveModelDisplay = syncActiveModelDisplay;

    function syncReasoningEffortDisplay(effort) {
      if (!effort) return;
      const isClaude = (window._currentActiveModel || '').toLowerCase().includes('claude');
      document.querySelectorAll('.btn-effort').forEach(b => {
        const isActive = !isClaude && (b.getAttribute('data-effort') === effort);
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    window.syncReasoningEffortDisplay = syncReasoningEffortDisplay;

    // --- App Drawer Controller ---
    const drawerEl = document.getElementById('antigravity-drawer');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const btnHeaderModel = document.getElementById('btn-header-model');
    const btnDrawerChangeModel = document.getElementById('btn-drawer-change-model');
    const valTasksCountDrawer = document.getElementById('val-tasks-count-drawer');
    const valSubagentsCountDrawer = document.getElementById('val-subagents-count-drawer');

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
          setTimeout(() => btnCloseDrawer.focus(), 60);
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
          btnToggleDrawer.focus();
        }
        announce('تم إغلاق درج التطبيقات');
        playBeep(420, 0.06);
      }
    }
    window.toggleAppDrawer = toggleAppDrawer;

    async function updateDrawerStats() {
      if (valSubagentsCountDrawer) {
        const count = Array.isArray(window.subagentRegistry) ? window.subagentRegistry.length : 0;
        valSubagentsCountDrawer.textContent = count;
      }
      try {
        const res = await fetch('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = (data.tasks || []).length;
          }
        }
      } catch (e) {}
    }

    if (btnToggleDrawer) {
      btnToggleDrawer.addEventListener('click', () => toggleAppDrawer());
    }
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => toggleAppDrawer(false));
    }
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', () => toggleAppDrawer(false));
    }


    // --- Live Model Picker Dialog ---
    const modelPickerDialog = document.getElementById('model-picker-dialog');
    const modelPickerList = document.getElementById('model-picker-list');
    const btnCloseModelPicker = document.getElementById('btn-close-model-picker');
    const btnCancelModelPicker = document.getElementById('btn-cancel-model-picker');

    async function openModelPicker() {
      if (!modelPickerDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      modelPickerDialog.showModal();
      announce('تم فتح قائمة اختيار نماذج الذكاء الاصطناعي');
      if (modelPickerList) {
        modelPickerList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">⏳ جارٍ جلب النماذج المتاحة من سيرفرات جوجل...</div>';
      }
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch('/api/ai/models'),
          fetch('/api/ai/settings')
        ]);
        const models = modelsRes.ok ? await modelsRes.json() : [];
        window._cachedModels = models;
        const currentSettings = settingsRes.ok ? await settingsRes.json() : {};
        const activeModel = currentSettings.model || 'gemini-3.8-flash-medium';
        renderModelPickerItems(models, activeModel);
      } catch (err) {
        if (modelPickerList) {
          modelPickerList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--accent-red);">تعذر جلب النماذج الحية. تأكد من اتصال السيرفر.</div>';
        }
        announce('تعذر تحميل النماذج من السيرفر');
      }
    }
    window.openModelPicker = openModelPicker;

    function renderModelPickerItems(models, activeModel) {
      if (!modelPickerList) return;
      if (!Array.isArray(models) || models.length === 0) {
        modelPickerList.innerHTML = '<p style="padding:12px; text-align:center;">لم يتم العثور على نماذج متاحة حالياً.</p>';
        return;
      }
      modelPickerList.innerHTML = '';
      models.forEach((m, idx) => {
        const isCurrent = (m.id === activeModel || m.name === activeModel);
        const card = document.createElement('button');
        card.type = 'button';
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
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <strong style="font-size:0.95rem; color:${isCurrent ? 'var(--accent-cyan)' : 'var(--text-main)'};">${escapeHtml(m.name)}</strong>
            <span class="badge" style="background:${isCurrent ? 'var(--accent-green)' : 'var(--bg-tertiary)'}; color:${isCurrent ? '#000' : 'var(--text-muted)'}; font-size:0.75rem; padding:2px 8px; border-radius:12px; font-weight:700;">
              ${isCurrent ? '✓ مفعل' : 'تفعيل'}
            </span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-muted); font-family:var(--font-mono); margin-top:4px; text-align:start;">${escapeHtml(m.id)}</div>
        `;
        card.addEventListener('click', async () => {
          await switchActiveModelDirectly(m.id || m.name, m.name);
        });
        modelPickerList.appendChild(card);
        if (idx === 0) {
          setTimeout(() => card.focus(), 50);
        }
      });
    }

    async function switchActiveModelDirectly(modelId, modelName) {
      try {
        const label = modelName || modelId;
        announce(`جارٍ تفعيل نموذج ${label}...`);
        const res = await fetch('/api/ai/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId })
        });
        if (res.ok) {
          const resData = await res.json();
          const updatedEffort = resData?.settings?.effort;
          if (updatedEffort && typeof syncReasoningEffortDisplay === 'function') {
            syncReasoningEffortDisplay(updatedEffort);
          }
          syncActiveModelDisplay(label);
          if (modelPickerDialog) modelPickerDialog.close();
          playBeep(880, 0.1);
          announce(`تم تفعيل نموذج ${label} بنجاح`);
          if (window.dynamicSettingsEngine) {
            window.dynamicSettingsEngine.handleExternalSync(resData?.settings || { model: modelId });
          }
          if ('BroadcastChannel' in window) {
            try {
              const bc = new BroadcastChannel('agy_settings_sync');
              bc.postMessage({ type: 'SETTINGS_UPDATED', settings: resData?.settings || { model: modelId } });
              bc.close();
            } catch(e) {}
          }
        } else {
          announce('تعذر حفظ إعداد النموذج');
        }
      } catch (e) {
        announce('حدث خطأ أثناء تفعيل النموذج');
      }
    }
    window.switchActiveModelDirectly = switchActiveModelDirectly;

    if (btnHeaderModel) {
      btnHeaderModel.addEventListener('click', () => openModelPicker());
    }
    if (btnDrawerChangeModel) {
      btnDrawerChangeModel.addEventListener('click', () => openModelPicker());
    }
    if (btnCloseModelPicker && modelPickerDialog) {
      btnCloseModelPicker.addEventListener('click', () => modelPickerDialog.close());
    }
    if (btnCancelModelPicker && modelPickerDialog) {
      btnCancelModelPicker.addEventListener('click', () => modelPickerDialog.close());
    }

    // --- Scheduled Tasks & Timers Monitor Dialog ---
    const tasksMonitorDialog = document.getElementById('tasks-monitor-dialog');
    const tasksMonitorList = document.getElementById('tasks-monitor-list');
    const btnCloseTasksMonitor = document.getElementById('btn-close-tasks-monitor');
    const btnDismissTasksMonitor = document.getElementById('btn-dismiss-tasks-monitor');
    const btnRefreshTasksMonitor = document.getElementById('btn-refresh-tasks-monitor');
    const btnOpenTasks = document.getElementById('btn-open-tasks');

    async function openTasksMonitor() {
      if (!tasksMonitorDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      tasksMonitorDialog.showModal();
      announce('تم فتح نافذة متابعة المهام والمؤقتات المجدولة');
      await refreshTasksMonitor();
    }
    window.openTasksMonitor = openTasksMonitor;

    // --- In-App OTA Update Controller ---
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

    let currentUpdateDownloadUrl = '';
    let lastAnnouncedProgressMilestone = 0;

    function openUpdateDialog() {
      if (!updateDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      updateDialog.showModal();
      announce('تم فتح نافذة تحديث التطبيق');

      const currentVer = (window.AntigravityBridge && typeof window.AntigravityBridge.getAppVersion === 'function')
        ? window.AntigravityBridge.getAppVersion()
        : '1.1.0';
      if (updateCurrentVersion) {
        updateCurrentVersion.textContent = currentVer;
      }

      checkAndShowInstallPermissionWarning();
      triggerUpdateCheck();
    }
    window.openUpdateDialog = openUpdateDialog;

    function checkAndShowInstallPermissionWarning() {
      if (!updatePermissionBox) return;
      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        const canInstall = window.AntigravityBridge.canInstallUnknownApps();
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
        fetch('https://api.github.com/repos/ahanafy41/antigravity-companion/releases/latest')
          .then(res => res.json())
          .then(data => {
            const tag = (data.tag_name || '').replace(/^v/i, '');
            const curr = (updateCurrentVersion && updateCurrentVersion.textContent) || '1.1.0';
            let downloadUrl = '';
            if (data.assets && Array.isArray(data.assets)) {
              const apkAsset = data.assets.find(a => (a.name || '').endsWith('.apk'));
              if (apkAsset) downloadUrl = apkAsset.browser_download_url;
            }
            window.onUpdateCheckResult({
              hasUpdate: tag !== '' && tag !== curr,
              latestVersion: tag,
              currentVersion: curr,
              downloadUrl: downloadUrl,
              releaseName: data.name || tag,
              releaseNotes: data.body || '',
              apkSize: 0
            });
          })
          .catch(err => {
            window.onUpdateCheckError({ error: err.message || 'خطأ في الاتصال' });
          });
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

    function startDownloadingUpdate() {
      if (!currentUpdateDownloadUrl) {
        announce('رابط التنزيل غير متوفر');
        return;
      }

      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        if (!window.AntigravityBridge.canInstallUnknownApps()) {
          checkAndShowInstallPermissionWarning();
          announce('يرجى السماح بتثبيت التطبيقات من الإعدادات قبل التثبيت');
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
        window.AntigravityBridge.startUpdateDownload(currentUpdateDownloadUrl);
      } else {
        let p = 0;
        const iv = setInterval(() => {
          p += 25;
          window.onUpdateProgress(p, p * 100000, 4000000);
          if (p >= 100) {
            clearInterval(iv);
            window.onUpdateDownloadComplete();
          }
        }, 600);
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
          window.AntigravityBridge.openInstallPermissionSettings();
          announce('فتح إعدادات تثبيت التطبيقات');
        }
      });
    }


    async function refreshTasksMonitor() {
      if (!tasksMonitorList) return;
      tasksMonitorList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">⏳ جارٍ فحص المهام والمؤقتات النشطة...</div>';
      try {
        const res = await fetch('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          const tasks = data.tasks || [];
          const activeCount = typeof data.active_count === 'number' ? data.active_count : tasks.filter(t => t.status === 'active').length;
          renderTasksList(tasks);
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = activeCount;
          }
        } else {
          tasksMonitorList.innerHTML = '<p style="color:var(--accent-red); text-align:center;">تعذر جلب المهام من السيرفر</p>';
        }
      } catch (err) {
        tasksMonitorList.innerHTML = '<p style="color:var(--accent-red); text-align:center;">خطأ في الاتصال بالخادم</p>';
      }
    }

    function renderTasksList(tasks) {
      if (!tasksMonitorList) return;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        tasksMonitorList.innerHTML = `
          <div style="padding:24px 16px; text-align:center; color:var(--text-muted); border:1px dashed var(--border-main); border-radius:8px;">
            <p style="margin:0 0 6px 0; font-size:1.05rem; font-weight:700;">لا توجد مؤقتات أو مهام مجدولة تعمل في الخلفية حالياً</p>
            <span style="font-size:0.85rem;">يتم إنشاء المهام تلقائياً عبر أداة <code>schedule</code> المدمجة في Antigravity.</span>
          </div>
        `;
        return;
      }
      tasksMonitorList.innerHTML = '';
      tasks.forEach(t => {
        const item = document.createElement('div');
        item.className = 'task-monitor-item';
        item.style.cssText = 'padding:12px; border:1px solid var(--border-main); border-radius:8px; background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;';
        
        const isCompleted = t.status === 'completed';
        const isCancelled = t.status === 'cancelled';
        const isActive = !isCompleted && !isCancelled;
        
        let statusBadge = '';
        if (isActive) {
          const remText = typeof t.remaining_seconds === 'number' ? `باقي: ${t.remaining_seconds}ث` : 'نشطة';
          statusBadge = `<span class="badge" style="background:#1b3820; font-size:0.8rem; padding:3px 8px; border-radius:4px; color:#56d364; font-weight:bold;">⏳ قيد التشغيل (${escapeHtml(remText)})</span>`;
        } else if (isCompleted) {
          statusBadge = `<span class="badge" style="background:#13233a; font-size:0.8rem; padding:3px 8px; border-radius:4px; color:#58a6ff; font-weight:bold;">✓ مكتملة</span>`;
        } else {
          statusBadge = `<span class="badge" style="background:#3a1515; font-size:0.8rem; padding:3px 8px; border-radius:4px; color:#ff7b72; font-weight:bold;">✕ تم الإلغاء</span>`;
        }

        const actionBtnHtml = isActive
          ? `<button type="button" class="btn btn-sm btn-danger btn-kill-task" data-task-id="${escapeHtml(t.id)}" aria-label="إلغاء المهمة ${escapeHtml(t.id)}">🛑 إلغاء</button>`
          : `<button type="button" class="btn btn-sm btn-kill-task" data-task-id="${escapeHtml(t.id)}" data-action="delete" style="background:var(--bg-tertiary); color:var(--text-muted);" aria-label="حذف من السجل">🗑️ حذف</button>`;

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:200px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="color:var(--accent-cyan); font-size:0.95rem;">${escapeHtml(t.id || 'Task')}</strong>
              ${statusBadge}
            </div>
            <div style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(t.prompt || t.description || 'مهمة في الخلفية')}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">${t.cron ? 'Cron: ' + escapeHtml(t.cron) : (t.duration ? 'المدة: ' + t.duration + ' ثانية' : '')}</div>
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
      if (!confirm(confirmMsg)) return;
      try {
        announce(action === 'delete' ? 'جارٍ حذف المهمة...' : `جارٍ إلغاء المهمة ${taskId}...`);
        const res = await fetch('/api/ai/tasks/manage', {
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

    if (btnOpenTasks) {
      btnOpenTasks.addEventListener('click', () => openTasksMonitor());
    }
    if (btnCloseTasksMonitor && tasksMonitorDialog) {
      btnCloseTasksMonitor.addEventListener('click', () => tasksMonitorDialog.close());
    }
    if (btnDismissTasksMonitor && tasksMonitorDialog) {
      btnDismissTasksMonitor.addEventListener('click', () => tasksMonitorDialog.close());
    }
    if (btnRefreshTasksMonitor) {
      btnRefreshTasksMonitor.addEventListener('click', () => refreshTasksMonitor());
    }

    // --- Reasoning Effort & Drawer Extra Actions ---
    const drawerEffortButtons = document.querySelectorAll('.btn-effort');
    drawerEffortButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        if (window._currentActiveModel && window._currentActiveModel.toLowerCase().includes('claude')) {
          announce('مستوى التفكير مدمج وتلقائي لنموذج كلود ولا يتطلب تعديلاً');
          playBeep(440, 0.1);
          return;
        }
        const effort = btn.getAttribute('data-effort');
        if (!effort) return;
        try {
          announce(`جارٍ ضبط مستوى التفكير على ${effort}...`);
          const res = await fetch('/api/ai/settings', {
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
            if (window.dynamicSettingsEngine && data?.settings) {
              window.dynamicSettingsEngine.handleExternalSync(data.settings);
            }
          }
        } catch (e) {
          announce('تعذر حفظ مستوى التفكير');
        }
      });
    });

    const btnDrawerNewChat = document.getElementById('btn-drawer-new-chat');
    if (btnDrawerNewChat && btnNewAiChat) {
      btnDrawerNewChat.addEventListener('click', () => {
        toggleAppDrawer(false);
        btnNewAiChat.click();
      });
    }

    const btnSaveChat = document.getElementById('btn-save-chat');
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
        const a = document.createElement('a');
        const d = new Date();
        const dateStr = d.toISOString().slice(0, 10);
        a.href = url;
        a.download = `antigravity-session-${dateStr}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        announce('تم تصدير وتنزيل المحادثة بنجاح');
      });
    }

    const btnClearChat = document.getElementById('btn-clear-chat');
    if (btnClearChat && btnNewAiChat) {
      btnClearChat.addEventListener('click', () => {
        toggleAppDrawer(false);
        btnNewAiChat.click();
      });
    }

    if (drawerEl) {
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (drawerEl && drawerEl.classList.contains('open')) {
          e.preventDefault();
          toggleAppDrawer(false);
          return;
        }
      }
    });

    // ==========================================
    // PWA INSTALLATION & SERVICE WORKER
    // ==========================================
    const btnInstallApp = document.getElementById('btn-install-app');
    let deferredInstallPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (btnInstallApp) {
        btnInstallApp.style.display = 'inline-flex';
        announce('يتوفر خيار تثبيت تطبيق Antigravity على هاتفك');
      }
    });

    if (btnInstallApp) {
      btnInstallApp.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
          announce('يمكنك تثبيت التطبيق من قائمة خيارات المتصفح (إضافة إلى الشاشة الرئيسية)');
          return;
        }
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          announce('تم بدء تثبيت التطبيق بنجاح');
          btnInstallApp.style.display = 'none';
        }
        deferredInstallPrompt = null;
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (typeof dynamicSettingsEngine !== 'undefined' && dynamicSettingsEngine.fetchRemoteData) {
      dynamicSettingsEngine.fetchRemoteData();
    }
    updateSystemUsage();
    setInterval(updateSystemUsage, 25000);

    // Live Screen Visibility Sync: tells server if user is viewing this screen
    function reportVisibility(vis) {
      try {
        fetch('/api/client/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visible: !!vis })
        }).catch(() => {});
      } catch(e) {}
    }

    let isAppExplicitlyMinimized = false;

    window.setAppVisibility = function(vis) {
      isAppExplicitlyMinimized = !vis;
      reportVisibility(vis);
    };

    document.addEventListener('visibilitychange', () => {
      if (isAppExplicitlyMinimized) return;
      reportVisibility(document.visibilityState === 'visible');
    });

    window.addEventListener('focus', () => {
      if (isAppExplicitlyMinimized) return;
      reportVisibility(true);
    });
    window.addEventListener('blur', () => {
      if (isAppExplicitlyMinimized) return;
      reportVisibility(false);
    });

    // Keep server informed while screen is open & periodically poll tasks and conversation
    setInterval(async () => {
      if (isAppExplicitlyMinimized) return;
      if (document.visibilityState === 'visible') {
        reportVisibility(true);
      }
      try {
        const res = await fetch('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          const activeCount = typeof data.active_count === 'number' ? data.active_count : (data.tasks || []).filter(t => t.status === 'active').length;
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = activeCount;
          }
          if (tasksMonitorDialog && tasksMonitorDialog.open) {
            renderTasksList(data.tasks || []);
          }
        }
      } catch (e) {}

      // Auto-sync any asynchronous agent responses (e.g. from background timer tasks)
      if (currentActiveConversationId && !isAiGenerating) {
        try {
          await syncActiveConversationMessages();
        } catch(e) {}
      }
    }, 3500);

    // Report immediately on load
    reportVisibility(document.visibilityState === 'visible');

  // Wire autocomplete triggers if input exists and autocomplete loaded
  if (aiInput) {
    if (typeof window.attachSlashAutocomplete === 'function') {
      window.attachSlashAutocomplete(aiInput);
    }
    if (typeof window.attachAtAutocomplete === 'function') {
      window.attachAtAutocomplete(aiInput);
    }
  }

  // Global exports
  window.updateSystemUsage = updateSystemUsage;
  window.loadConversationsList = loadConversationsList;
  window.loadQuotaData = loadQuotaData;
  window.checkAuthStatus = checkAuthStatus;
  window.openAuthWizard = openAuthWizard;
  window.loadSkillsList = loadSkillsList;
  window.loadPluginsList = loadPluginsList;
  window.loadSubagentsList = loadSubagentsList;
  window.syncActiveModelDisplay = syncActiveModelDisplay;
  window.syncReasoningEffortDisplay = syncReasoningEffortDisplay;
  window.toggleAppDrawer = toggleAppDrawer;
  window.openModelPicker = openModelPicker;
  window.openTasksMonitor = openTasksMonitor;
  window.refreshTasksMonitor = refreshTasksMonitor;
})();
