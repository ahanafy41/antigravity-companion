// ==============================================================================
// Accessible Dialogs Manager (14 Dialogs)
// Focus Trapping, Backdrop Dismissal, Close Behaviors & ARIA Coordination
// ==============================================================================

(function() {
  'use strict';

  // Map to store previous focused elements for proper focus restoration
  const previousActiveElements = new Map();

  const DIALOG_IDS = [
    'files-dialog',
    'quota-dialog',
    'auth-wizard-dialog',
    'settings-dialog',
    'conversations-dialog',
    'skills-dialog',
    'plugins-dialog',
    'mcp-dialog',
    'mcp-auth-dialog',
    'subagents-dialog',
    'model-picker-dialog',
    'tasks-monitor-dialog',
    'update-dialog',
    'dlg-nexus-interactive'
  ];

  function getDialog(dialogOrId) {
    if (typeof dialogOrId === 'string') {
      return document.getElementById(dialogOrId);
    }
    return dialogOrId;
  }

  function getFocusableElements(container) {
    if (!container) return [];
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(selector)).filter(el => {
      return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
    });
  }

  function trapFocus(dialog) {
    if (!dialog || dialog._hasTrapListener) return;
    dialog._hasTrapListener = true;

    dialog.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      const focusables = getFocusableElements(dialog);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !dialog.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !dialog.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  function openDialog(dialogOrId, triggerEl) {
    const dialog = getDialog(dialogOrId);
    if (!dialog) return;

    const caller = triggerEl || document.activeElement;
    if (caller) {
      previousActiveElements.set(dialog, caller);
    }

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
      } catch(e) {}
    } else {
      dialog.setAttribute('open', '');
    }

    trapFocus(dialog);

    // Shift focus to the first interactive element or dialog title
    setTimeout(() => {
      const focusables = getFocusableElements(dialog);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        dialog.focus();
      }
    }, 50);
  }

  function closeDialog(dialogOrId) {
    const dialog = getDialog(dialogOrId);
    if (!dialog) return;

    if (dialog.open) {
      try {
        dialog.close();
      } catch(e) {
        dialog.removeAttribute('open');
      }
    }

    const prevEl = previousActiveElements.get(dialog);
    if (prevEl && typeof prevEl.focus === 'function') {
      setTimeout(() => {
        try { prevEl.focus(); } catch(e) {}
      }, 50);
    }
  }

  function setupDialogs() {
    DIALOG_IDS.forEach(id => {
      const dialog = document.getElementById(id);
      if (!dialog) return;

      trapFocus(dialog);

      // Backdrop click dismissal (clicking directly on the <dialog> outside .dialog-content)
      dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
          closeDialog(dialog);
        }
      });

      // Escape key / native cancel event
      dialog.addEventListener('cancel', function(e) {
        const prevEl = previousActiveElements.get(dialog);
        if (prevEl && typeof prevEl.focus === 'function') {
          setTimeout(() => {
            try { prevEl.focus(); } catch(err) {}
          }, 50);
        }
      });
    });

    // Close buttons mapping for all 14 dialogs
    const closeButtonsConfig = [
      { btnId: 'btn-close-files-top', dialogId: 'files-dialog' },
      { btnId: 'btn-close-files', dialogId: 'files-dialog' },
      { btnId: 'btn-close-quota-top', dialogId: 'quota-dialog' },
      { btnId: 'btn-close-quota', dialogId: 'quota-dialog' },
      { btnId: 'btn-close-auth-wizard-top', dialogId: 'auth-wizard-dialog' },
      { btnId: 'btn-cancel-auth-wizard', dialogId: 'auth-wizard-dialog' },
      { btnId: 'btn-close-auth-wizard', dialogId: 'auth-wizard-dialog' },
      { btnId: 'btn-close-dialog-top', dialogId: 'settings-dialog' },
      { btnId: 'btn-close-dialog', dialogId: 'settings-dialog' },
      { btnId: 'btn-close-conversations-top', dialogId: 'conversations-dialog' },
      { btnId: 'btn-close-conversations', dialogId: 'conversations-dialog' },
      { btnId: 'btn-close-skills-top', dialogId: 'skills-dialog' },
      { btnId: 'btn-close-skills', dialogId: 'skills-dialog' },
      { btnId: 'btn-close-plugins-top', dialogId: 'plugins-dialog' },
      { btnId: 'btn-close-plugins', dialogId: 'plugins-dialog' },
      { btnId: 'btn-close-mcp-top', dialogId: 'mcp-dialog' },
      { btnId: 'btn-close-mcp', dialogId: 'mcp-dialog' },
      { btnId: 'btn-close-mcp-auth-top', dialogId: 'mcp-auth-dialog' },
      { btnId: 'btn-close-mcp-auth', dialogId: 'mcp-auth-dialog' },
      { btnId: 'btn-close-subagents-top', dialogId: 'subagents-dialog' },
      { btnId: 'btn-close-subagents', dialogId: 'subagents-dialog' },
      { btnId: 'btn-close-model-picker', dialogId: 'model-picker-dialog' },
      { btnId: 'btn-cancel-model-picker', dialogId: 'model-picker-dialog' },
      { btnId: 'btn-close-tasks-monitor', dialogId: 'tasks-monitor-dialog' },
      { btnId: 'btn-dismiss-tasks-monitor', dialogId: 'tasks-monitor-dialog' },
      { btnId: 'btn-close-update-dialog', dialogId: 'update-dialog' },
      { btnId: 'btn-dismiss-update-dialog', dialogId: 'update-dialog' },
      { btnId: 'btn-nexus-cancel-top', dialogId: 'dlg-nexus-interactive' },
      { btnId: 'btn-nexus-cancel', dialogId: 'dlg-nexus-interactive' }
    ];

    closeButtonsConfig.forEach(({ btnId, dialogId }) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => closeDialog(dialogId));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDialogs);
  } else {
    setupDialogs();
  }

  // Global exports
  window.openDialog = openDialog;
  window.closeDialog = closeDialog;
  window.trapFocus = trapFocus;
})();
