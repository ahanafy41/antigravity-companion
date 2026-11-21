/**
 * Antigravity Companion App - Accessible Live Canvas Runner Engine
 * Clean Architecture Modular Component
 *
 * Provides safe on-page execution of AI-generated mini-apps and widgets
 * without nested iframes, enforcing TalkBack/Jieshuo linear accessibility,
 * scoped CSS transformation, resource teardown lifecycles, and defensive focus restoration.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CanvasRunner = factory();
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

  /**
   * Transforms raw CSS to encapsulate it within a container selector
   * Replaces html, body, and :root with the scope selector, and prefixes standard rules.
   * Exempts @keyframes and @media blocks from broken selector prefixes.
   */
  function transformAppStyles(cssText, scopeSelector) {
    if (!cssText || typeof cssText !== 'string') return '';
    const scope = scopeSelector || '#canvas-mount-point';

    // 1. Replace root and body level selectors
    let transformed = cssText
      .replace(/(^|[\s,;{}])(html\s*,\s*body|html|body|:root)(?=[\s,{])/gi, `$1${scope}`);

    // 2. Prefix individual style rules while respecting @-rules
    const parts = transformed.split(/(@keyframes[^{]+{[^}]+}\s*})/gi);
    return parts.map((part) => {
      if (/^@keyframes/i.test(part.trim())) {
        return part; // Leave keyframes untouched
      }
      return part.replace(/([^{}]+)({[^{}]*})/g, (match, selector, rules) => {
        const trimmedSel = selector.trim();
        if (!trimmedSel || trimmedSel.startsWith('@') || trimmedSel.startsWith('from') || trimmedSel.startsWith('to') || /^\d+%/.test(trimmedSel)) {
          return match;
        }
        const scopedSubSelectors = trimmedSel.split(',').map((s) => {
          const sub = s.trim();
          if (!sub) return '';
          if (sub.startsWith(scope)) return sub;
          return `${scope} ${sub}`;
        }).filter(Boolean).join(', ');

        return `${scopedSubSelectors} ${rules}`;
      });
    }).join('');
  }

  function createCanvasRunner(options) {
    const opts = options || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : globalThis);
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const escapeHtml = opts.escapeHtml || defaultEscapeHtml;
    const announcer = opts.announcer || null;
    const playSuccessChime = opts.playSuccessChime || function () {};

    let mountEl = opts.mountElement || null;
    let dialogEl = opts.dialogElement || null;
    let titleEl = opts.titleElement || null;
    let btnSave = opts.btnSave || null;
    let btnEditInChat = opts.btnEditInChat || null;
    let btnReset = opts.btnReset || null;
    let btnClose = opts.btnClose || null;

    let currentApp = null;
    let previousFocusedElement = null;
    let trackedTimers = new Set();
    let trackedIntervals = new Set();
    let destroyHooks = [];
    let abortController = null;
    let lastAnnouncement = '';
    let announceToggle = false;
    let lastAnnounceTime = 0;

    function captureFocus() {
      if (doc && doc.activeElement) {
        previousFocusedElement = doc.activeElement;
      }
    }

    function restoreFocus() {
      if (!doc) return;
      if (previousFocusedElement && typeof doc.contains === 'function' && doc.contains(previousFocusedElement)) {
        try {
          previousFocusedElement.focus();
        } catch (_) {}
      } else {
        const fallback = (typeof doc.getElementById === 'function' ? doc.getElementById('message-input') : null) || doc.body;
        if (fallback && typeof fallback.focus === 'function') {
          try {
            fallback.focus();
          } catch (_) {}
        }
      }
      previousFocusedElement = null;
    }

    function announce(text, isAssertive) {
      if (!text || typeof text !== 'string') return;
      const now = Date.now();
      if (now - lastAnnounceTime < 200) {
        // Throttling rapid updates to prevent TalkBack queue stalling
        setTimeout(() => announce(text, isAssertive), 220);
        return;
      }
      lastAnnounceTime = now;

      let speechText = text.trim();
      if (speechText === lastAnnouncement) {
        announceToggle = !announceToggle;
        speechText += announceToggle ? '\u200B' : ' ';
      }
      lastAnnouncement = text.trim();

      if (announcer && typeof announcer.announce === 'function') {
        announcer.announce(speechText, isAssertive);
      } else if (typeof win.audioAnnouncer !== 'undefined' && win.audioAnnouncer.announce) {
        win.audioAnnouncer.announce(speechText);
      }
    }

    function onDestroy(callback) {
      if (typeof callback === 'function') {
        destroyHooks.push(callback);
      }
    }

    function teardown() {
      // 1. Clear all in-flight timers and intervals
      for (const tId of trackedTimers) {
        try { win.clearTimeout(tId); } catch (_) {}
      }
      trackedTimers.clear();

      for (const iId of trackedIntervals) {
        try { win.clearInterval(iId); } catch (_) {}
      }
      trackedIntervals.clear();

      // 2. Run developer registered teardown callbacks
      for (const hook of destroyHooks) {
        try { hook(); } catch (err) {
          if (win.console && win.console.warn) win.console.warn('[CanvasRunner] Error in onDestroy hook:', err);
        }
      }
      destroyHooks = [];

      // 3. Abort event listeners
      if (abortController) {
        try { abortController.abort(); } catch (_) {}
        abortController = null;
      }

      // 4. Detach mounted DOM
      if (mountEl) {
        mountEl.innerHTML = '';
      }

      currentApp = null;

      // 5. Close dialog
      if (dialogEl && typeof dialogEl.close === 'function' && dialogEl.open) {
        try { dialogEl.close(); } catch (_) {}
      }

      // 6. Defensive focus restoration
      restoreFocus();
    }

    function launch(appData, launchOptions) {
      const opts = launchOptions || {};
      if (!appData || (!appData.code && !appData.html)) {
        announce('تعذر تشغيل التطبيق: كود التطبيق غير متوفر', true);
        return false;
      }

      captureFocus();
      teardown(); // Reset previous run if any

      currentApp = {
        id: appData.id || `app_${Date.now()}`,
        title: appData.title || appData.name || 'تطبيق كانفاس تفاعلي',
        description: appData.description || '',
        code: appData.code || appData.html || ''
      };

      if (typeof win.AbortController === 'function') {
        abortController = new win.AbortController();
      } else if (typeof AbortController === 'function') {
        abortController = new AbortController();
      } else {
        abortController = { signal: {}, abort: () => {} };
      }
      const signal = abortController ? abortController.signal : null;

      // Ensure DOM nodes are bound
      if (!mountEl && doc) mountEl = doc.getElementById('canvas-mount-point');
      if (!dialogEl && doc) dialogEl = doc.getElementById('canvas-runner-dialog');
      if (!titleEl && doc) titleEl = doc.getElementById('canvas-runner-title');
      if (!btnSave && doc) btnSave = doc.getElementById('btn-canvas-save');

      if (titleEl) {
        titleEl.textContent = currentApp.title;
      }
      if (btnSave) {
        btnSave.textContent = '💾 حفظ في التطبيقات';
        btnSave.disabled = false;
        btnSave.setAttribute('aria-label', `حفظ تطبيق ${currentApp.title} في التطبيقات`);
      }

      // Parse and extract markup, styles, and scripts
      const rawHtml = currentApp.code;
      let bodyContent = rawHtml;
      let extractedStyles = '';
      let extractedScripts = [];

      // Extract styles
      bodyContent = bodyContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
        extractedStyles += css + '\n';
        return '';
      });

      // Extract scripts
      bodyContent = bodyContent.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => {
        extractedScripts.push(js);
        return '';
      });

      // Transform styles
      const scopedCss = transformAppStyles(extractedStyles, '#canvas-mount-point');

      if (mountEl) {
        mountEl.innerHTML = `
          <style class="canvas-scoped-styles">${scopedCss}</style>
          <div class="canvas-app-wrapper" role="region" aria-label="${escapeHtml(currentApp.title)}">
            ${bodyContent}
          </div>
        `;
      }

      // Build SDK bridge
      const companionSdk = {
        getTitle: () => (currentApp ? currentApp.title : ''),
        announce: (text, isAssertive) => announce(text, isAssertive),
        onDestroy: (fn) => onDestroy(fn),
        addEventListener: (type, listener, extraOpts) => {
          if (typeof win.addEventListener === 'function') {
            const combinedOpts = Object.assign({}, extraOpts, { signal: signal });
            win.addEventListener(type, listener, combinedOpts);
          }
        },
        setTimeout: (fn, delay) => {
          const tId = win.setTimeout(() => {
            trackedTimers.delete(tId);
            try { fn(); } catch (err) { win.console.error(err); }
          }, delay);
          trackedTimers.add(tId);
          return tId;
        },
        clearTimeout: (tId) => {
          trackedTimers.delete(tId);
          return win.clearTimeout(tId);
        },
        setInterval: (fn, delay) => {
          const iId = win.setInterval(() => {
            try { fn(); } catch (err) { win.console.error(err); }
          }, delay);
          trackedIntervals.add(iId);
          return iId;
        },
        clearInterval: (iId) => {
          trackedIntervals.delete(iId);
          return win.clearInterval(iId);
        }
      };

      win.CompanionApp = companionSdk;

      // Open dialog
      if (dialogEl && typeof dialogEl.showModal === 'function' && !dialogEl.open) {
        try {
          dialogEl.showModal();
        } catch (_) {
          dialogEl.open = true;
        }
      }

      // Execute extracted scripts safely
      for (const scriptCode of extractedScripts) {
        if (!scriptCode.trim()) continue;
        try {
          const wrapped = new win.Function('CompanionApp', 'window', 'document', `
            try {
              ${scriptCode}
            } catch (err) {
              if (window.console) window.console.error('[CanvasApp Error]:', err);
              CompanionApp.announce('حدث خطأ داخل التطبيق: ' + (err.message || ''));
            }
          `);
          wrapped(companionSdk, win, doc);
        } catch (evalErr) {
          if (win.console) win.console.error('[Canvas Evaluation Error]:', evalErr);
          announce('تعذر تنفيذ كود التطبيق البرمجي', true);
        }
      }

      // Focus management
      setTimeout(() => {
        if (titleEl && typeof titleEl.focus === 'function') {
          titleEl.setAttribute('tabindex', '-1');
          titleEl.focus();
        } else if (btnClose && typeof btnClose.focus === 'function') {
          btnClose.focus();
        }
      }, 50);

      announce(`تم تشغيل تطبيق ${currentApp.title} في الكانفاس التفاعلي`);
      return true;
    }

    function reset() {
      if (currentApp) {
        const appToRelaunch = Object.assign({}, currentApp);
        launch(appToRelaunch);
        announce('تمت إعادة تعيين التطبيق');
      }
    }

    function getCurrentApp() {
      return currentApp;
    }

    // Attach native toolbar event listeners if elements are present
    function bindToolbarEvents(callbacks) {
      const cb = callbacks || {};
      if (btnClose) {
        btnClose.addEventListener('click', () => {
          teardown();
          announce('تم إغلاق الكانفاس');
        });
      }
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          reset();
        });
      }
      if (btnSave) {
        btnSave.addEventListener('click', async () => {
          if (!currentApp) return;
          if (typeof cb.onSaveApp === 'function') {
            btnSave.disabled = true;
            btnSave.textContent = '⏳ جاري الحفظ...';
            try {
              const res = await cb.onSaveApp(currentApp);
              btnSave.textContent = '✅ تم الحفظ';
              btnSave.setAttribute('aria-label', `تم حفظ تطبيق ${currentApp.title} بنجاح`);
              playSuccessChime();
              announce('تم حفظ التطبيق في قائمة التطبيقات بنجاح');
            } catch (err) {
              btnSave.disabled = false;
              btnSave.textContent = '💾 إعادة محاولة الحفظ';
              announce(`تعذر حفظ التطبيق: ${err.message || ''}`, true);
            }
          }
        });
      }
      if (btnEditInChat) {
        btnEditInChat.addEventListener('click', () => {
          if (!currentApp) return;
          const appInfo = Object.assign({}, currentApp);
          teardown();
          if (typeof cb.onEditInChat === 'function') {
            cb.onEditInChat(appInfo);
          } else {
            // Default edit in chat handler
            const input = doc.getElementById('ai-prompt-input') || doc.getElementById('message-input');
            if (input) {
              input.value = `@تعديل_تطبيق: ${appInfo.title} (ID: ${appInfo.id})\n`;
              input.focus();
            }
            announce(`جاهز لتعديل تطبيق ${appInfo.title} في الشات`);
          }
        });
      }
    }

    return {
      launch: launch,
      teardown: teardown,
      reset: reset,
      getCurrentApp: getCurrentApp,
      captureFocus: captureFocus,
      restoreFocus: restoreFocus,
      announce: announce,
      onDestroy: onDestroy,
      bindToolbarEvents: bindToolbarEvents
    };
  }

  return {
    create: createCanvasRunner,
    transformAppStyles: transformAppStyles
  };
});
