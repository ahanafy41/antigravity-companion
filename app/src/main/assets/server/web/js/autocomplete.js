// ==============================================================================
// Autocomplete System for Slash Commands (/) and Mentions (@)
// Accessible, Multi-Trigger & TalkBack Screen Reader Optimized
// ==============================================================================

    // Dynamic commands list populated live from Antigravity API
    window.WELL_KNOWN_SLASH_COMMANDS = [];

    async function syncDynamicSlashCommandsGlobally() {
      try {
        const res = await fetch('/api/ai/commands');
        if (!res.ok) return;
        const data = await res.json();
        const commands = data.commands || [];
        if (Array.isArray(commands) && commands.length > 0) {
          window.WELL_KNOWN_SLASH_COMMANDS = commands;
        }
      } catch (err) {
        console.warn('Dynamic slash commands sync failed:', err);
      }
    }
    window.syncDynamicSlashCommandsGlobally = syncDynamicSlashCommandsGlobally;
    syncDynamicSlashCommandsGlobally();

    // مزامنة وقائمة بروتوكولات MCP العالمية
    window.INSTALLED_MCP_SERVERS = [];

    window.getMcpIcon = function(name) {
      const lower = (name || '').toLowerCase();
      if (lower.includes('fetch')) return '🌐';
      if (lower.includes('search') || lower.includes('brave')) return '🔍';
      if (lower.includes('git')) return '🐙';
      if (lower.includes('puppet') || lower.includes('browser')) return '🎭';
      if (lower.includes('fs') || lower.includes('file')) return '📁';
      if (lower.includes('sql') || lower.includes('db') || lower.includes('data')) return '🗄️';
      if (lower.includes('memory') || lower.includes('graph')) return '🧠';
      return '🔌';
    };

    window.syncInstalledMcpGlobally = async function() {
      try {
        const res = await fetch('/api/mcp/list');
        if (!res.ok) return [];
        const data = await res.json();
        const installed = data.installed || [];
        const catalog = data.catalog || [];
        window.INSTALLED_MCP_SERVERS = installed.map(srv => {
          const catItem = catalog.find(c => c.id === srv.name);
          const icon = (catItem && catItem.icon) ? catItem.icon : window.getMcpIcon(srv.name);
          const desc = (catItem && catItem.description) ? catItem.description : (srv.command || 'بروتوكول MCP');
          const title = (catItem && catItem.name) ? catItem.name : srv.name;
          return {
            name: srv.name,
            title: title,
            enabled: !!srv.enabled,
            type: srv.type || 'stdio',
            command: srv.command || '',
            icon: icon,
            desc: desc
          };
        });
        return window.INSTALLED_MCP_SERVERS;
      } catch (err) {
        console.warn('MCP servers sync failed:', err);
        return [];
      }
    };
    window.syncInstalledMcpGlobally();

    // محرك الإكمال التلقائي والنافذة المنبثقة لقائمة أوامر السلاش والمهارات (Accessible & Multi-Trigger)
    window.attachSlashAutocomplete = function(inputElem, onSelectCallback) {
      if (!inputElem) return;
      let popup = null;
      let selectedIdx = 0;
      let currentFiltered = [];
      let currentSlashIndex = -1;
      let autoFocusTimer = null;

      function announceSlash(txt) {
        const ann = document.getElementById('sr-announcer');
        if (ann) {
          ann.textContent = '';
          setTimeout(() => { ann.textContent = txt; }, 50);
        }
      }

      function closePopup() {
        if (autoFocusTimer) {
          clearTimeout(autoFocusTimer);
          autoFocusTimer = null;
        }
        if (popup && popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
        popup = null;
        selectedIdx = 0;
        currentFiltered = [];
        currentSlashIndex = -1;
        inputElem.removeAttribute('aria-expanded');
        inputElem.removeAttribute('aria-controls');
        inputElem.removeAttribute('aria-activedescendant');
      }

      function selectItem(item) {
        if (!item) return;
        const val = inputElem.value;
        const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
        const textBefore = val.slice(0, cursor);
        const slashIdx = (currentSlashIndex >= 0 && currentSlashIndex < cursor) ? currentSlashIndex : textBefore.lastIndexOf('/');

        if (slashIdx !== -1) {
          const prefix = val.slice(0, slashIdx);
          let textAfter = val.slice(cursor);
          if (textAfter.startsWith(' ')) {
            textAfter = textAfter.slice(1);
          }
          const insertText = item.cmd + ' ';
          inputElem.value = prefix + insertText + textAfter;
          const newPos = prefix.length + insertText.length;
          if (typeof inputElem.setSelectionRange === 'function') {
            inputElem.setSelectionRange(newPos, newPos);
          }
        } else {
          inputElem.value = item.cmd + ' ' + val;
        }

        closePopup();
        announceSlash(`تم اختيار أمر ${item.cmd}`);
        inputElem.focus();
        inputElem.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(item);
        }
      }

      function renderItems() {
        if (!popup) return;
        const listContainer = popup.querySelector('.slash-items-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        if (currentFiltered.length === 0) {
          listContainer.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem; text-align:center;">لا توجد أوامر أو مهارات مطابقة</div>';
          return;
        }

        if (selectedIdx >= currentFiltered.length) selectedIdx = 0;
        if (selectedIdx < 0) selectedIdx = currentFiltered.length - 1;

        currentFiltered.forEach((item, idx) => {
          const isSelected = (idx === selectedIdx);
          const isSkill = item.source === 'skill' || item.cmd.startsWith('/universal') || item.cmd.startsWith('/task') || item.cmd.startsWith('/study') || item.cmd.startsWith('/jieshuo');
          const isHelper = item.source === 'helper' || item.cmd.startsWith('@');
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'slash-menu-item' + (isSelected ? ' selected' : '');
          row.id = 'slash-opt-' + idx;
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(isSelected));
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-label', `${item.cmd}، ${item.desc}${isSkill ? '، مهارة' : ''}`);

          let icon = '⚡';
          if (isSkill) icon = '🧠';
          else if (isHelper) icon = '🔌';

          row.innerHTML = `
            <div class="slash-item-icon" aria-hidden="true">${icon}</div>
            <div class="slash-item-body">
              <div class="slash-item-title-row">
                <span class="slash-item-cmd">${item.cmd}</span>
                ${isSkill ? '<span style="font-size:0.75rem; background:rgba(0,240,255,0.15); color:var(--accent-cyan); padding:1px 6px; border-radius:4px; font-weight:bold;">مهارة</span>' : ''}
                ${isHelper ? '<span style="font-size:0.75rem; background:rgba(163,113,247,0.15); color:var(--accent-purple); padding:1px 6px; border-radius:4px; font-weight:bold;">أداة</span>' : ''}
              </div>
              <div class="slash-item-desc">${item.desc}</div>
            </div>
            ${isSelected ? '<span class="option-badge" style="background:var(--accent-cyan); color:#000; font-size:0.75rem; font-weight:bold; padding:2px 6px; border-radius:4px;">Enter ↵</span>' : ''}
          `;

          row.addEventListener('click', (e) => {
            e.preventDefault();
            selectItem(item);
          });

          row.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextIdx = (idx + 1) % currentFiltered.length;
              selectedIdx = nextIdx;
              const nextEl = listContainer.querySelector('#slash-opt-' + nextIdx);
              if (nextEl) nextEl.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (idx === 0) {
                inputElem.focus();
              } else {
                const prevIdx = (idx - 1 + currentFiltered.length) % currentFiltered.length;
                selectedIdx = prevIdx;
                const prevEl = listContainer.querySelector('#slash-opt-' + prevIdx);
                if (prevEl) prevEl.focus();
              }
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectItem(item);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closePopup();
              announceSlash('تم إغلاق قائمة الأوامر');
              inputElem.focus();
            }
          });

          row.addEventListener('focus', () => {
            selectedIdx = idx;
            inputElem.setAttribute('aria-activedescendant', row.id);
          });

          listContainer.appendChild(row);

          if (isSelected) {
            inputElem.setAttribute('aria-activedescendant', row.id);
          }
        });
      }

      function getSlashQuery() {
        const val = inputElem.value;
        const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
        const textBefore = val.slice(0, cursor);
        const slashIdx = textBefore.lastIndexOf('/');
        if (slashIdx === -1) return null;
        if (slashIdx > 0) {
          const prevChar = textBefore.charAt(slashIdx - 1);
          if (!/\s/.test(prevChar)) return null;
        }
        const query = textBefore.slice(slashIdx + 1);
        if (/\s/.test(query)) return null;
        return { query, slashIndex: slashIdx, cursor: cursor };
      }

      function checkAndOpenPopup(options = {}) {
        if (document.getElementById('at-autocomplete-popup')) {
          closePopup();
          return;
        }

        const res = getSlashQuery();
        if (!res) {
          closePopup();
          return;
        }

        currentSlashIndex = res.slashIndex;
        const q = res.query.toLowerCase().trim();

        currentFiltered = window.WELL_KNOWN_SLASH_COMMANDS.filter(c => {
          if (!q) return true;
          const searchKey = q.startsWith('/') ? q : ('/' + q);
          return c.cmd.toLowerCase().includes(searchKey) || c.desc.toLowerCase().includes(q.replace(/^\//, ''));
        });

        const isNewPopup = !popup;

        if (!popup) {
          const existingAt = document.getElementById('at-autocomplete-popup');
          if (existingAt && existingAt.parentNode) existingAt.parentNode.removeChild(existingAt);

          popup = document.createElement('div');
          popup.className = 'slash-menu-popup';
          popup.id = 'slash-autocomplete-popup';
          popup.setAttribute('role', 'dialog');
          popup.setAttribute('aria-label', 'قائمة أوامر السلاش والمهارات');

          popup.innerHTML = `
            <div class="slash-menu-header" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700;">⚡ أوامر السلاش والمهارات (${currentFiltered.length})</span>
              <button type="button" id="btn-close-slash-popup" class="btn btn-sm" aria-label="إغلاق قائمة الأوامر والعودة لحقل الكتابة" style="background:transparent; border:1px solid var(--border-main); color:var(--text-muted); border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer;">إلغاء ✕</button>
            </div>
            <div class="slash-items-list" role="listbox" aria-label="الخيارات المتاحة"></div>
          `;

          const parentBox = inputElem.closest('.ai-input-section') || inputElem.closest('.bottom-input-section') || inputElem.parentElement;
          parentBox.appendChild(popup);
          inputElem.setAttribute('aria-expanded', 'true');
          inputElem.setAttribute('aria-controls', popup.id);

          const btnClose = popup.querySelector('#btn-close-slash-popup');
          if (btnClose) {
            btnClose.addEventListener('click', () => {
              closePopup();
              announceSlash('تم إغلاق قائمة الأوامر');
              inputElem.focus();
            });
          }
        }

        const countSpan = popup.querySelector('.slash-menu-header span');
        if (countSpan) {
          countSpan.textContent = `⚡ أوامر السلاش والمهارات (${currentFiltered.length})`;
        }
        selectedIdx = 0;
        renderItems();

        if (isNewPopup) {
          announceSlash(`قائمة أوامر السلاش مفتوحة، ${currentFiltered.length} خيار. اضغط السهم لأسفل أو اسحب للتنقل.`);
          if (autoFocusTimer) clearTimeout(autoFocusTimer);
          autoFocusTimer = setTimeout(() => {
            if (popup && document.activeElement === inputElem) {
              const firstOpt = popup.querySelector('.slash-menu-item');
              if (firstOpt) firstOpt.focus();
            }
          }, 140);
        } else if (options.immediateFocus) {
          const firstOpt = popup.querySelector('.slash-menu-item');
          if (firstOpt) firstOpt.focus();
        }
      }

      inputElem.addEventListener('input', () => checkAndOpenPopup());
      inputElem.addEventListener('click', () => checkAndOpenPopup());
      inputElem.addEventListener('keyup', function(e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
          checkAndOpenPopup();
        }
      });

      inputElem.addEventListener('keydown', function(e) {
        if (!popup) {
          if (e.key === '/') {
            setTimeout(() => checkAndOpenPopup({ immediateFocus: false }), 20);
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const firstOpt = popup.querySelector('.slash-menu-item');
          if (firstOpt) firstOpt.focus();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (currentFiltered.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            selectItem(currentFiltered[selectedIdx]);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closePopup();
          announceSlash('تم إغلاق قائمة الأوامر');
        }
      });

      inputElem.addEventListener('blur', function() {
        setTimeout(() => {
          if (popup && !popup.contains(document.activeElement)) {
            closePopup();
          }
        }, 220);
      });
    };

    // محرك الإكمال التلقائي واستدعاء بروتوكولات MCP بعلامة الات (@) (Accessible & Multi-Trigger)
    window.attachAtAutocomplete = function(inputElem, onSelectCallback) {
      if (!inputElem) return;
      let popup = null;
      let selectedIdx = 0;
      let currentFiltered = [];
      let currentAtIndex = -1;
      let autoFocusTimer = null;

      function safeEscape(s) {
        return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replaceAll('"', '&quot;');
      }

      function announceAt(txt) {
        const ann = document.getElementById('sr-announcer');
        if (ann) {
          ann.textContent = '';
          setTimeout(() => { ann.textContent = txt; }, 50);
        }
      }

      function closePopup() {
        if (autoFocusTimer) {
          clearTimeout(autoFocusTimer);
          autoFocusTimer = null;
        }
        if (popup && popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
        popup = null;
        selectedIdx = 0;
        currentFiltered = [];
        currentAtIndex = -1;
        inputElem.removeAttribute('aria-expanded');
        inputElem.removeAttribute('aria-controls');
        inputElem.removeAttribute('aria-activedescendant');
      }

      function selectItem(item) {
        if (!item) return;
        const val = inputElem.value;
        const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
        const textBefore = val.slice(0, cursor);
        const atIdx = (currentAtIndex >= 0 && currentAtIndex < cursor) ? currentAtIndex : textBefore.lastIndexOf('@');

        if (atIdx !== -1) {
          const prefix = val.slice(0, atIdx);
          let textAfter = val.slice(cursor);
          if (textAfter.startsWith(' ')) {
            textAfter = textAfter.slice(1);
          }
          const insertText = '@' + item.name + ' ';
          inputElem.value = prefix + insertText + textAfter;
          const newPos = prefix.length + insertText.length;
          if (typeof inputElem.setSelectionRange === 'function') {
            inputElem.setSelectionRange(newPos, newPos);
          }
        } else {
          inputElem.value = val + '@' + item.name + ' ';
        }

        closePopup();
        announceAt('تم استدعاء بروتوكول @' + item.name);
        inputElem.focus();
        inputElem.dispatchEvent(new Event('input', { bubbles: true }));

        if (typeof onSelectCallback === 'function') {
          onSelectCallback(item);
        }
      }

      function renderItems() {
        if (!popup) return;
        const listContainer = popup.querySelector('.at-items-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        if (currentFiltered.length === 0) {
          listContainer.innerHTML = '<div style="padding:12px 14px; color:var(--text-muted); font-size:0.85rem; text-align:center;">لا توجد بروتوكولات MCP مطابقة</div>';
          return;
        }

        if (selectedIdx >= currentFiltered.length) selectedIdx = 0;
        if (selectedIdx < 0) selectedIdx = currentFiltered.length - 1;

        currentFiltered.forEach((item, idx) => {
          const isSelected = (idx === selectedIdx);
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'at-menu-item' + (isSelected ? ' selected' : '');
          row.id = 'at-opt-' + idx;
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(isSelected));
          row.setAttribute('tabindex', '0');
          row.setAttribute('aria-label', `@${item.name}، ${item.enabled ? 'مفعل' : 'معطل'}، ${item.desc || item.title || ''}`);

          const statusHtml = item.enabled
            ? '<span class="at-item-status-badge" style="background:rgba(63,185,80,0.2); color:var(--accent-green);">🟢 مفعل</span>'
            : '<span class="at-item-status-badge" style="background:rgba(139,148,158,0.2); color:var(--text-muted);">⚪ معطل</span>';

          row.innerHTML = `
            <div class="at-item-icon" aria-hidden="true">${item.icon || '🔌'}</div>
            <div class="at-item-body">
              <div class="at-item-title-row">
                <span class="at-item-name">@${safeEscape(item.name)}</span>
                ${statusHtml}
                ${item.type ? `<span style="font-size:0.72rem; color:var(--text-muted); font-family:monospace; background:rgba(255,255,255,0.06); padding:1px 4px; border-radius:3px;">${safeEscape(item.type)}</span>` : ''}
              </div>
              <div class="at-item-desc">${safeEscape(item.desc || item.title || item.command || '')}</div>
            </div>
            ${isSelected ? '<span class="option-badge" style="background:var(--accent-purple); color:#000; font-size:0.75rem; font-weight:bold; padding:2px 6px; border-radius:4px;">Enter ↵</span>' : ''}
          `;

          row.addEventListener('click', (e) => {
            e.preventDefault();
            selectItem(item);
          });

          row.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextIdx = (idx + 1) % currentFiltered.length;
              selectedIdx = nextIdx;
              const nextEl = listContainer.querySelector('#at-opt-' + nextIdx);
              if (nextEl) nextEl.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (idx === 0) {
                inputElem.focus();
              } else {
                const prevIdx = (idx - 1 + currentFiltered.length) % currentFiltered.length;
                selectedIdx = prevIdx;
                const prevEl = listContainer.querySelector('#at-opt-' + prevIdx);
                if (prevEl) prevEl.focus();
              }
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectItem(item);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopImmediatePropagation();
              closePopup();
              announceAt('تم إغلاق قائمة بروتوكولات MCP');
              inputElem.focus();
            }
          });

          row.addEventListener('focus', () => {
            selectedIdx = idx;
            inputElem.setAttribute('aria-activedescendant', row.id);
          });

          listContainer.appendChild(row);

          if (isSelected) {
            inputElem.setAttribute('aria-activedescendant', row.id);
          }
        });
      }

      function getAtQuery() {
        const val = inputElem.value;
        const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
        const textBefore = val.slice(0, cursor);
        const atIdx = textBefore.lastIndexOf('@');
        if (atIdx === -1) return null;
        if (atIdx > 0) {
          const prevChar = textBefore.charAt(atIdx - 1);
          if (!/\s/.test(prevChar)) return null;
        }
        const query = textBefore.slice(atIdx + 1);
        if (/\s/.test(query)) return null;
        return { query, atIndex: atIdx, cursor };
      }

      function checkAndOpenPopup(options = {}) {
        if (document.getElementById('slash-autocomplete-popup')) {
          closePopup();
          return;
        }

        const res = getAtQuery();
        if (!res) {
          closePopup();
          return;
        }

        currentAtIndex = res.atIndex;
        const q = res.query.toLowerCase().trim();

        if (!window.INSTALLED_MCP_SERVERS || window.INSTALLED_MCP_SERVERS.length === 0) {
          if (typeof window.syncInstalledMcpGlobally === 'function') {
            window.syncInstalledMcpGlobally().then(() => {
              if (popup) checkAndOpenPopup(options);
            });
          }
        }

        const servers = window.INSTALLED_MCP_SERVERS || [];

        currentFiltered = servers.filter(s => {
          if (!q) return true;
          const n = (s.name || '').toLowerCase();
          const t = (s.title || '').toLowerCase();
          const d = (s.desc || '').toLowerCase();
          return n.includes(q) || t.includes(q) || d.includes(q);
        });

        const isNewPopup = !popup;

        if (!popup) {
          const slashPop = document.getElementById('slash-autocomplete-popup');
          if (slashPop && slashPop.parentNode) slashPop.parentNode.removeChild(slashPop);

          popup = document.createElement('div');
          popup.className = 'at-menu-popup';
          popup.id = 'at-autocomplete-popup';
          popup.setAttribute('role', 'dialog');
          popup.setAttribute('aria-label', 'قائمة استدعاء بروتوكولات MCP');

          popup.innerHTML = `
            <div class="at-menu-header" style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700;">🔌 بروتوكولات MCP (@) (${currentFiltered.length})</span>
              <button type="button" id="btn-close-at-popup" class="btn btn-sm" aria-label="إغلاق قائمة البروتوكولات والعودة لحقل الكتابة" style="background:transparent; border:1px solid var(--border-main); color:var(--text-muted); border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer;">إلغاء ✕</button>
            </div>
            <div class="at-items-list" role="listbox" aria-label="بروتوكولات MCP المتاحة"></div>
          `;

          const parentBox = inputElem.closest('.ai-input-section') || inputElem.closest('.bottom-input-section') || inputElem.parentElement;
          parentBox.appendChild(popup);
          inputElem.setAttribute('aria-expanded', 'true');
          inputElem.setAttribute('aria-controls', popup.id);

          const btnClose = popup.querySelector('#btn-close-at-popup');
          if (btnClose) {
            btnClose.addEventListener('click', () => {
              closePopup();
              announceAt('تم إغلاق قائمة بروتوكولات MCP');
              inputElem.focus();
            });
          }
        }

        const countSpan = popup.querySelector('.at-menu-header span');
        if (countSpan) {
          countSpan.textContent = `🔌 بروتوكولات MCP (@) (${currentFiltered.length})`;
        }
        selectedIdx = 0;
        renderItems();

        if (isNewPopup) {
          announceAt(`قائمة بروتوكولات MCP مفتوحة، ${currentFiltered.length} بروتوكول متاح. اضغط السهم لأسفل أو اسحب للتنقل.`);
          if (autoFocusTimer) clearTimeout(autoFocusTimer);
          autoFocusTimer = setTimeout(() => {
            if (popup && document.activeElement === inputElem) {
              const firstOpt = popup.querySelector('.at-menu-item');
              if (firstOpt) firstOpt.focus();
            }
          }, 140);
        } else if (options.immediateFocus) {
          const firstOpt = popup.querySelector('.at-menu-item');
          if (firstOpt) firstOpt.focus();
        }
      }

      inputElem.addEventListener('input', () => checkAndOpenPopup());
      inputElem.addEventListener('click', () => checkAndOpenPopup());
      inputElem.addEventListener('keyup', function(e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
          checkAndOpenPopup();
        }
      });

      inputElem.addEventListener('keydown', function(e) {
        if (!popup) {
          if (e.key === '@') {
            setTimeout(() => checkAndOpenPopup({ immediateFocus: false }), 20);
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const firstOpt = popup.querySelector('.at-menu-item');
          if (firstOpt) firstOpt.focus();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (currentFiltered.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            selectItem(currentFiltered[selectedIdx]);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closePopup();
          announceAt('تم إغلاق قائمة بروتوكولات MCP');
          inputElem.focus();
        }
      });

      inputElem.addEventListener('blur', function() {
        setTimeout(() => {
          if (popup && !popup.contains(document.activeElement)) {
            closePopup();
          }
        }, 220);
      });
    };
