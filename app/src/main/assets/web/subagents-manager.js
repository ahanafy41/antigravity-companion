/**
 * subagents-manager.js - Subagents Operations & Multi-Agent Coordination Controller
 * Tracks active subagents, prompts, direct messaging focus, and screen-reader announcements.
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

  window.subagentRegistry = window.subagentRegistry || [];

  function registerSubagent(agentInfo) {
    if (!agentInfo) return;
    const role = agentInfo.role || 'وكيل فرعي';
    const type = agentInfo.type || 'subagent';
    const existing = window.subagentRegistry.find(a => a.role === role && a.type === type);
    if (existing) {
      Object.assign(existing, agentInfo);
    } else {
      window.subagentRegistry.unshift(agentInfo);
    }
    const valSubagentsCount = document.getElementById('val-subagents-count');
    if (valSubagentsCount) {
      valSubagentsCount.textContent = window.subagentRegistry.length;
    }
    const valSubDrawer = document.getElementById('val-subagents-count-drawer');
    if (valSubDrawer) {
      valSubDrawer.textContent = window.subagentRegistry.length;
    }
    if (typeof window.renderSubagentsList === 'function') {
      window.renderSubagentsList();
    }
  }
  window.registerSubagent = registerSubagent;

  function updateSubagentMessage(recipient, message) {
    const found = window.subagentRegistry.find(a => a.role === recipient || a.type === recipient);
    if (found) {
      found.lastMessage = message;
      found.lastAction = 'تلقى رسالة وتوجيهات جديدة';
      if (typeof window.renderSubagentsList === 'function') {
        window.renderSubagentsList();
      }
    }
  }
  window.updateSubagentMessage = updateSubagentMessage;

  function focusSubagent(agentRole) {
    window.activeFocusedAgent = agentRole;
    const focusAgentName = document.getElementById('focus-agent-name');
    const subagentFocusBanner = document.getElementById('subagent-focus-banner');
    const aiInput = document.getElementById('ai-prompt-input');

    if (focusAgentName) focusAgentName.textContent = agentRole;
    if (subagentFocusBanner) subagentFocusBanner.style.display = 'flex';
    if (aiInput) {
      aiInput.placeholder = `أنت الآن تتحدث مباشرة إلى [${agentRole}]. اكتب سؤالك أو تعليماتك...`;
      if (typeof aiInput.focus === 'function') aiInput.focus();
    }
    playBeep(720, 0.12);
    announce(`تم توجيه المحادثة مباشرة إلى الوكيل ${agentRole}. اكتب رسالتك واضغط إرسال.`);
  }
  window.focusSubagent = focusSubagent;

  function cancelSubagentFocus() {
    window.activeFocusedAgent = null;
    const subagentFocusBanner = document.getElementById('subagent-focus-banner');
    const aiInput = document.getElementById('ai-prompt-input');

    if (subagentFocusBanner) subagentFocusBanner.style.display = 'none';
    if (aiInput) {
      aiInput.placeholder = 'اكتب سؤالك أو أمرك هنا... (أو /new لبدء جلسة جديدة)';
    }
    announce('تم إلغاء التوجيه المباشر والعودة للوكيل العام');
  }
  window.cancelSubagentFocus = cancelSubagentFocus;

  function initSubagentsManager() {
    const subagentsDialog = document.getElementById('subagents-dialog');
    const btnOpenSubagents = document.getElementById('btn-open-subagents');
    const btnCloseSubagents = document.getElementById('btn-close-subagents');
    const btnCloseSubagentsTop = document.getElementById('btn-close-subagents-top');
    const btnClearSubagents = document.getElementById('btn-clear-subagents');
    const statSubagents = document.getElementById('stat-subagents');
    const valSubagentsCount = document.getElementById('val-subagents-count');
    const subagentsTeamContainer = document.getElementById('subagents-team-container');

    const subagentFocusBanner = document.getElementById('subagent-focus-banner');
    const btnCancelAgentFocus = document.getElementById('btn-cancel-agent-focus');
    const btnQuickCreateSubagent = document.getElementById('btn-quick-create-subagent');
    const aiInput = document.getElementById('ai-prompt-input');

    function renderSubagentsList() {
      if (!subagentsTeamContainer) return;
      if (window.subagentRegistry.length === 0) {
        subagentsTeamContainer.innerHTML = '<div class="main-style-106">لم يتم استدعاء وكلاء فرعيين في هذه الجلسة بعد. عند إطلاق أي وكيل فرعي ستظهر تفاصيله ومهامه هنا فوراً.</div>';
        return;
      }

      subagentsTeamContainer.innerHTML = '';
      window.subagentRegistry.forEach((agent, idx) => {
        const card = document.createElement('article');
        card.className = 'conv-card-item';
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        const stateStr = agent.state || 'نشط';
        const promptStr = agent.prompt || '';
        const ariaLabel = `الوكيل رقم ${idx + 1}: ${agent.role}. الحالة: ${stateStr}. المهمة: ${promptStr.slice(0, 80)}`;
        card.setAttribute('aria-label', ariaLabel);

        card.innerHTML = `
          <div class="main-style-180">
            <div class="main-style-216">
              <div class="main-style-10">
                <span aria-hidden="true" class="main-style-217">🤖</span>
                <span class="main-style-218">${escapeHtml(agent.role || '')}</span>
                <span class="main-style-219">${escapeHtml(agent.type || '')}</span>
              </div>
              <span class="${stateStr.includes('نشط') ? "main-style-220" : "main-style-223"}">
                ${stateStr.includes('نشط') ? '🟢 ' + stateStr : '✅ ' + stateStr}
              </span>
            </div>

            <div class="main-style-224">
              <div class="main-style-225">🎯 المهمة المسندة (Prompt):</div>
              <div class="main-style-226">
                ${escapeHtml(promptStr)}
              </div>
            </div>

            ${agent.lastMessage ? `
              <div class="main-style-227">
                <span class="main-style-228">💬 آخر رسالة تواصل: </span>
                <span class="main-style-229">${escapeHtml(agent.lastMessage)}</span>
              </div>
            ` : ''}

            <div class="main-style-230">
              <span>🕒 وقت الإطلاق: ${agent.timestamp || ''}</span>
              <span>⚡ النشاط: ${escapeHtml(agent.lastAction || '')}</span>
            </div>

            <div class="main-style-231">
              <button type="button" class="btn btn-sm btn-focus-agent main-style-232" data-agent-role="${escapeHtml(agent.role || '')}" aria-label="توجيه المحادثة مباشرة إلى ${escapeHtml(agent.role || '')}">
                💬 تحدث معه مباشرة
              </button>
              <button type="button" class="btn btn-sm btn-copy-agent-info main-style-233" data-agent-idx="${idx}" aria-label="نسخ بيانات ومهمة الوكيل">
                📋 نسخ المهمة
              </button>
            </div>
          </div>
        `;
        subagentsTeamContainer.appendChild(card);
      });

      subagentsTeamContainer.querySelectorAll('.btn-focus-agent').forEach(btn => {
        btn.addEventListener('click', function() {
          const role = this.getAttribute('data-agent-role');
          focusSubagent(role);
          if (subagentsDialog) subagentsDialog.close();
        });
      });

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
    window.renderSubagentsList = renderSubagentsList;

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
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSubagentsManager);
    } else {
      initSubagentsManager();
    }
  }

  return {
    registerSubagent: window.registerSubagent,
    updateSubagentMessage: window.updateSubagentMessage,
    focusSubagent: window.focusSubagent,
    cancelSubagentFocus: window.cancelSubagentFocus,
    renderSubagentsList: window.renderSubagentsList
  };
}));
