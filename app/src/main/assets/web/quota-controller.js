/**
 * quota-controller.js - Antigravity AI Quota & Rolling Limits Controller
 * Tracks remaining percentages, 5-hour rolling limits, and reset countdowns with screen reader support.
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
    if (typeof window.playSuccessChime === 'function') {
      window.playSuccessChime();
    }
  }

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
  window.formatQuotaResetInfo = formatQuotaResetInfo;

  function initQuotaController() {
    const btnOpenQuota = document.getElementById('btn-open-quota');
    const btnOpenQuotaInline = document.getElementById('btn-open-quota-inline');
    const quotaDialog = document.getElementById('quota-dialog');
    const btnCloseQuota = document.getElementById('btn-close-quota');
    const btnCloseQuotaTop = document.getElementById('btn-close-quota-top');
    const btnForceRefreshQuota = document.getElementById('btn-force-refresh-quota');
    const quotaCardsContainer = document.getElementById('quota-cards-container');
    const valQuotaGoogle = document.getElementById('val-quota-google');
    const valQuotaClaude = document.getElementById('val-quota-claude');

    async function loadQuotaData(force = false) {
      if (btnForceRefreshQuota && force) {
        btnForceRefreshQuota.disabled = true;
        btnForceRefreshQuota.textContent = '⏳ جاري الاستعلام...';
      }
      if (quotaCardsContainer && (!quotaCardsContainer.children.length || force)) {
        quotaCardsContainer.innerHTML = '<div class="main-style-176">جاري الاتصال بمحرك Antigravity لجلب الحصص الحية...</div>';
      }
      try {
        if (force) announce('جاري الاتصال المباشر بمحرك Antigravity لجلب الحصص، يرجى الانتظار ثوانٍ...');
        if (typeof window.mainV1Fetch !== 'function') return;
        const res = await window.mainV1Fetch('/api/ai/quota' + (force ? '?refresh=1' : ''));
        if (!res || !res.ok) throw new Error('فشل جلب الحصص');
        const data = await res.json();
        const quotas = data.quotas || [];

        // Update Top Bar Indicators
        quotas.forEach(q => {
          if (q.group && q.group.includes('Gemini') && q.limit_type && q.limit_type.includes('Five Hour')) {
            if (valQuotaGoogle) valQuotaGoogle.textContent = q.pct;
          } else if (q.group && q.group.includes('Claude') && q.limit_type && q.limit_type.includes('Five Hour')) {
            if (valQuotaClaude) valQuotaClaude.textContent = q.pct;
          }
        });

        if (!quotaCardsContainer) return;
        if (quotas.length === 0) {
          quotaCardsContainer.innerHTML = '<div class="main-style-176">لا تتوفر معلومات الحصص حالياً. اضغط على تحديث فوري.</div>';
          return;
        }

        quotaCardsContainer.innerHTML = '';
        quotas.forEach(q => {
          const card = document.createElement('div');
          card.className = 'conv-card-item';
          card.setAttribute('role', 'listitem');

          const isGoogle = q.group && q.group.includes('Gemini');
          const icon = isGoogle ? '🌐' : '🤖';
          const isFiveHour = q.limit_type && q.limit_type.includes('Five Hour');
          const typeLabel = isFiveHour ? 'حصة الـ 5 ساعات المتجددة (Rolling 5-Hour)' : 'الحد الأسبوعي الشامل (Weekly Limit)';
          const color = q.pct_val > 50 ? 'var(--accent-green)' : (q.pct_val > 20 ? '#f1c40f' : 'var(--accent-red)');
          const resetInfo = formatQuotaResetInfo(q.reset_time);

          card.setAttribute('aria-label', `${q.group}: متبقي ${q.pct}. ${resetInfo.countdownStr}. موعد التجديد ${resetInfo.dateStr}`);

          card.innerHTML = `
            <div class="main-style-180">
              <div class="main-style-181">
                <span class="main-style-182">
                  ${icon} ${escapeHtml(q.group)}
                </span>
                <span class="${color === "#f1c40f" ? "main-style-185" : (color === 'var(--accent-green)') ? "main-style-183" : "main-style-184"}">
                  ${q.pct} متبقي
                </span>
              </div>
              <div class="main-style-186">
                ${typeLabel}
              </div>
              <div class="mini-progress-track main-style-187">
                <progress class="mini-progress-fill" value="${Number(q.pct_val) || 0}" max="100" aria-label="الحصة الباقية"></progress>
              </div>
              <div class="main-style-188">
                <span>⏳ التجديد: <strong class="main-style-12">${escapeHtml(resetInfo.countdownStr)}</strong></span>
                <span class="main-style-189">(${escapeHtml(resetInfo.dateStr)})</span>
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
          quotaCardsContainer.innerHTML = `<div class="main-style-190">تعذر جلب الحصص: ${escapeHtml(err.message)}</div>`;
        }
      } finally {
        if (btnForceRefreshQuota) {
          btnForceRefreshQuota.disabled = false;
          btnForceRefreshQuota.textContent = '🔄 تحديث فوري';
        }
      }
    }
    window.loadQuotaData = loadQuotaData;

    function openQuotaDialog() {
      if (!quotaDialog) return;
      if (typeof quotaDialog.showModal === 'function') {
        quotaDialog.showModal();
      }
      announce('تم فتح نافذة حصص ونسب استهلاك النماذج المتبقية');
      loadQuotaData(false);
    }
    window.openQuotaDialog = openQuotaDialog;

    if (btnOpenQuota && quotaDialog) {
      btnOpenQuota.addEventListener('click', openQuotaDialog);
    }
    if (btnOpenQuotaInline && quotaDialog) {
      btnOpenQuotaInline.addEventListener('click', openQuotaDialog);
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

    // Auto load on start and periodic polling
    loadQuotaData(false);
    setInterval(() => loadQuotaData(false), 60000);
  }

  // Auto-init on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initQuotaController);
    } else {
      initQuotaController();
    }
  }

  return {
    formatQuotaResetInfo,
    loadQuotaData: window.loadQuotaData,
    openQuotaDialog: window.openQuotaDialog
  };
}));
