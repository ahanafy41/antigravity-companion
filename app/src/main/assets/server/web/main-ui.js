(async function () {
await window.mainV1.ready;
    function escapeHtml(s) {
      return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // Dynamic commands list populated live from Antigravity API
    window.WELL_KNOWN_SLASH_COMMANDS = [];

    // Pre-seeded Fast-Boot Model Catalog
    window._cachedModels = window._cachedModels || [
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
      { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
      { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
      { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
      { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
    ];

    async function syncDynamicSlashCommandsGlobally() {
      try {
        const res = await window.mainV1Fetch('/api/ai/commands');
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
        const res = await window.mainV1Fetch('/api/mcp/list');
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
        announceSlash(`تم اختيار أمر ${escapeHtml(item.cmd)}`);
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
          listContainer.innerHTML = '<div class="main-style-128">لا توجد أوامر أو مهارات مطابقة</div>';
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
          row.setAttribute('aria-label', `${escapeHtml(item.cmd)}، ${escapeHtml(item.desc)}${isSkill ? '، مهارة' : ''}`);

          let icon = '⚡';
          if (isSkill) icon = '🧠';
          else if (isHelper) icon = '🔌';

          row.innerHTML = `
            <div class="slash-item-icon" aria-hidden="true">${icon}</div>
            <div class="slash-item-body">
              <div class="slash-item-title-row">
                <span class="slash-item-cmd">${escapeHtml(item.cmd)}</span>
                ${isSkill ? '<span class="main-style-129">مهارة</span>' : ''}
                ${isHelper ? '<span class="main-style-130">أداة</span>' : ''}
              </div>
              <div class="slash-item-desc">${escapeHtml(item.desc)}</div>
            </div>
            ${isSelected ? '<span class="option-badge main-style-131">Enter ↵</span>' : ''}
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

        if (!currentFiltered.length) { closePopup(); return; }
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
            <div class="slash-menu-header main-style-132">
              <span class="main-style-133">⚡ أوامر السلاش والمهارات (${currentFiltered.length})</span>
              <button type="button" id="btn-close-slash-popup" class="btn btn-sm main-style-134" aria-label="إغلاق قائمة الأوامر والعودة لحقل الكتابة">إلغاء ✕</button>
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
      let queryGeneration = 0;
      let selectedIdx = 0;
      let currentFiltered = [];
      let currentAtIndex = -1;
      let autoFocusTimer = null;

      function safeEscape(s) {
        return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function announceAt(txt) {
        const ann = document.getElementById('sr-announcer');
        if (ann) {
          ann.textContent = '';
          setTimeout(() => { ann.textContent = txt; }, 50);
        }
      }

      function closePopup() {
        queryGeneration++;
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
          const insertText = item.path ? '@' + JSON.stringify(item.path) + ' ' : '@' + item.name + ' ';
          inputElem.value = prefix + insertText + textAfter;
          const newPos = prefix.length + insertText.length;
          if (typeof inputElem.setSelectionRange === 'function') {
            inputElem.setSelectionRange(newPos, newPos);
          }
        } else {
          inputElem.value = val + (item.path ? '@' + JSON.stringify(item.path) + ' ' : '@' + item.name + ' ');
        }

        closePopup();
        announceAt(item.path ? 'أُدرج مسار ' + item.name : 'تم اختيار بروتوكول @' + item.name);
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
          listContainer.innerHTML = '<div class="main-style-135">لا توجد بروتوكولات MCP مطابقة</div>';
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
            ? '<span class="at-item-status-badge main-style-136">🟢 مفعل</span>'
            : '<span class="at-item-status-badge main-style-137">⚪ معطل</span>';

          row.innerHTML = `
            <div class="at-item-icon" aria-hidden="true">${safeEscape(item.icon || '')}</div>
            <div class="at-item-body">
              <div class="at-item-title-row">
                <span class="at-item-name">@${safeEscape(item.name)}</span>
                ${statusHtml}
                ${item.type ? `<span class="main-style-138">${safeEscape(item.type)}</span>` : ''}
              </div>
              <div class="at-item-desc">${safeEscape(item.desc || item.title || item.command || '')}</div>
            </div>
            ${isSelected ? '<span class="option-badge main-style-139">Enter ↵</span>' : ''}
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
              announceAt('تم إغلاق قائمة الملفات والمجلدات وMCP');
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
        if (/\s/.test(query) && !query.startsWith('"')) return null;
        if (query.startsWith('"') && query.slice(1).includes('"')) return null;
        return { query, atIndex: atIdx, cursor };
      }

      async function checkAndOpenPopup(options = {}) {
        const generation = ++queryGeneration;
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

        const servers = window.INSTALLED_MCP_SERVERS || [];

        const filteredServers = servers.filter(s => !q || [s.name, s.title, s.desc].some(text => (text || '').toLowerCase().includes(q)));
        let files = [];
        try { files = await window.mainV1.mentions(res.query); }
        catch (error) { announceAt('تعذر اقتراح الملفات: ' + error.message); }
        if (generation !== queryGeneration || getAtQuery()?.query !== res.query) return;
        currentFiltered = [...filteredServers, ...files];
        if (!currentFiltered.length) { closePopup(); return; }

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
            <div class="at-menu-header main-style-132">
              <span class="main-style-133">🔌 الملفات والمجلدات وMCP (@) (${currentFiltered.length})</span>
              <button type="button" id="btn-close-at-popup" class="btn btn-sm main-style-134" aria-label="إغلاق قائمة البروتوكولات والعودة لحقل الكتابة">إلغاء ✕</button>
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
              announceAt('تم إغلاق قائمة الملفات والمجلدات وMCP');
              inputElem.focus();
            });
          }
        }

        const countSpan = popup.querySelector('.at-menu-header span');
        if (countSpan) {
          countSpan.textContent = `🔌 الملفات والمجلدات وMCP (@) (${currentFiltered.length})`;
        }
        selectedIdx = 0;
        renderItems();

        if (isNewPopup) {
          announceAt(`قائمة الملفات والمجلدات وMCP مفتوحة، ${currentFiltered.length} بروتوكول متاح. اضغط السهم لأسفل أو اسحب للتنقل.`);
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
          announceAt('تم إغلاق قائمة الملفات والمجلدات وMCP');
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


// ==============================================================================
// Accessible AI Studio & Dual-Engine Controller
// Features: Live Tool Execution Steps, File Explorer, Model Settings, TalkBack Audio
// ==============================================================================
(function() {
  'use strict';

  function initAiStudio() {
    const aiViewport = document.getElementById('ai-studio-viewport');
    const aiChatFeed = document.getElementById('ai-chat-feed');
    const aiForm = document.getElementById('ai-chat-form');
    const aiInput = document.getElementById('ai-prompt-input');
    const btnAiSend = document.getElementById('btn-ai-send');
    const btnAiAbort = document.getElementById('btn-ai-abort');
    const settingsDialog = document.getElementById('settings-dialog');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnCloseDialog = document.getElementById('btn-close-dialog');
    const btnCloseDialogTop = document.getElementById('btn-close-dialog-top');
    const selectModel = document.getElementById('select-model');
    const checkContinue = document.getElementById('check-session-continue');
    const btnNewAiChat = document.getElementById('btn-new-ai-chat');
    const btnAiNewBottom = document.getElementById('btn-ai-new-bottom');
    const announcer = document.getElementById('sr-announcer');

    // File Explorer elements
    const btnOpenFiles = document.getElementById('btn-open-files');
    const btnOpenFilesBottom = document.getElementById('btn-open-files-bottom');
    const filesDialog = document.getElementById('files-dialog');
    const btnCloseFiles = document.getElementById('btn-close-files');
    const btnCloseFilesTop = document.getElementById('btn-close-files-top');
    const filesListContainer = document.getElementById('files-list-container');
    const fileViewerContainer = document.getElementById('file-viewer-container');
    const fileViewerContent = document.getElementById('file-viewer-content');
    const fileViewerTitle = document.getElementById('file-viewer-title');
    const btnBackToFiles = document.getElementById('btn-back-to-files');

    // Skills Manager elements
    const skillsDialog = document.getElementById('skills-dialog');
    const btnOpenSkills = document.getElementById('btn-open-skills');
    const btnCloseSkills = document.getElementById('btn-close-skills');
    const btnCloseSkillsTop = document.getElementById('btn-close-skills-top');
    const skillsListContainer = document.getElementById('skills-list-container');

    // MCP Manager elements
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
    const mcpCustomArgs = document.getElementById('mcp-custom-args');
    const mcpCustomEnv = document.getElementById('mcp-custom-env');
    // Artifacts & Work Documents elements
    const btnHeaderArtifacts = document.getElementById('btn-header-artifacts');
    const headerArtifactsBadge = document.getElementById('header-artifacts-badge');
    const btnOpenArtifactsDrawer = document.getElementById('btn-open-artifacts-drawer');
    const valArtifactsCountDrawer = document.getElementById('val-artifacts-count-drawer');
    const artifactsDialog = document.getElementById('artifacts-dialog');
    const btnCloseArtifacts = document.getElementById('btn-close-artifacts');
    const btnCloseArtifactsTop = document.getElementById('btn-close-artifacts-top');
    const artifactsListContainer = document.getElementById('artifacts-list-container');
    const artifactViewerDialog = document.getElementById('artifact-viewer-dialog');
    const artifactViewerTitle = document.getElementById('artifact-viewer-title');
    const artifactViewerSummary = document.getElementById('artifact-viewer-summary');
    const artifactViewerContent = document.getElementById('artifact-viewer-content');
    const btnDownloadArtifact = document.getElementById('btn-download-artifact');
    const btnCopyArtifactContent = document.getElementById('btn-copy-artifact-content');
    const btnViewerProceed = document.getElementById('btn-viewer-proceed');
    const btnCloseViewer = document.getElementById('btn-close-viewer');
    const btnCloseViewerTop = document.getElementById('btn-close-viewer-top');
    const knownArtifacts = new Map();
    let currentViewerArtifact = null;
    let artifactViewerRequestId = 0;

    // Conversation History & System Resources elements
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
    let currentActiveConversationId = null;
    // AI Tokens & Quota elements
    const valAiTokens = document.getElementById('val-ai-tokens');
    const valAiContext = document.getElementById('val-ai-context');
    const fillAiContext = document.getElementById('fill-ai-context');
    const settingsContextText = document.getElementById('settings-context-text');
    const settingsContextFill = document.getElementById('settings-context-fill');
    const settingsLastTokens = document.getElementById('settings-last-tokens');
    const settingsSessionTokens = document.getElementById('settings-session-tokens');
    const settingsInputTokens = document.getElementById('settings-input-tokens');
    const settingsOutputTokens = document.getElementById('settings-output-tokens');

    if (!aiViewport) return;

    let isAiGenerating = false;
    let forceNewSession = false;
    let aiAbortController = null;
    let audioCtx = null;

    function playBeep(freq, dur) {
      try {
        const prefs = (window.mainV1 && typeof window.mainV1.preferences === 'function') ? window.mainV1.preferences() : {};
        if (prefs.tones_enabled === false || prefs.sound === false) return;
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = freq;
        g.gain.value = 0.14;
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
      } catch(e) {}
    }

    function playStartChime() {
      playBeep(440, 0.08);
      setTimeout(() => playBeep(587, 0.1), 80);
    }

    function playToolChime() {
      if (window.mainV1.preferences().haptics !== false) navigator.vibrate?.(25);
      playBeep(659, 0.06);
      setTimeout(() => playBeep(784, 0.08), 60);
    }

    function playSuccessChime() {
      playBeep(523, 0.08);
      setTimeout(() => playBeep(659, 0.08), 80);
      setTimeout(() => playBeep(784, 0.12), 160);
    }

    function announce(text) {
      if (!announcer) return;
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = text; }, 60);
      try {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = /[\u0600-\u06FF]/.test(text) ? 'ar-SA' : 'en-US';
          window.speechSynthesis.speak(u);
        }
      } catch(e) {}
    }



    // Pure Accessible Agent Mode - AI Studio is always active
    if (aiViewport) aiViewport.style.display = 'flex';

    // Friendly Arabic labels for tools with semantic intent support
    function getToolLabel(toolName, params) {
      if (!params || typeof params !== 'object') params = {};
      const action = params.toolAction || params.action || '';
      const summary = params.toolSummary || params.summary || '';
      const intent = action || summary;

      if (toolName === 'run_command' || toolName === 'command') {
        const cmd = params.CommandLine || params.command || params.cmd || '';
        const shortCmd = cmd.length > 500 ? (cmd.slice(0, 500) + '...') : cmd;
        if (intent) return intent + (shortCmd ? ` (${shortCmd})` : '');
        return 'تشغيل أمر الطرفية: ' + shortCmd;
      } else if (toolName === 'read_file' || toolName === 'view_file' || toolName === 'read_resource') {
        const p = params.Path || params.path || params.AbsolutePath || params.TargetFile || params.Uri || params.uri || '';
        const name = p ? (p.split(/[\/\\]/).pop() || p) : '';
        if (intent) return `${intent}: ${name || 'ملف'}`;
        return name ? `قراءة الملف: ${name}` : 'قراءة وفحص ملف';
      } else if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'write_to_file' || toolName === 'replace_file_content') {
        const p = params.Path || params.path || params.TargetFile || params.AbsolutePath || '';
        const name = p ? (p.split(/[\/\\]/).pop() || p) : '';
        const desc = params.Description || params.description || '';
        const prefix = (toolName.includes('edit') || toolName.includes('replace')) ? 'تعديل الملف: ' : 'كتابة وإنشاء الملف: ';
        if (intent) return `${intent}: ${name || 'ملف'}` + (desc ? ` (${desc})` : '');
        return prefix + (name || 'ملف') + (desc ? ` (${desc})` : '');
      } else if (toolName === 'list_dir' || toolName === 'find_by_name') {
        return intent || 'فحص محتويات المجلد';
      } else if (toolName === 'invoke_subagent') {
        const subagents = params.Subagents || [];
        const roles = subagents.map(s => s.Role || s.TypeName).join(', ');
        return '🤖 إطلاق فريق وكلاء متخصصين: ' + (roles || 'وكيل جديد');
      } else if (toolName === 'send_message') {
        const recipient = params.Recipient || 'وكيل فرعي';
        return `💬 تواصل وتنسيق مع ${recipient}`;
      } else if (toolName === 'manage_subagents' || toolName === 'manage_task') {
        return intent || '⚙️ إدارة ومتابعة مهام الوكلاء';
      } else if (toolName === 'search_web' || toolName === 'web_search') {
        return '🌐 بحث حي في الويب: ' + (params.query || params.Query || intent || '');
      } else if (toolName === 'read_url_content' || toolName === 'fetch' || toolName === 'browser_read') {
        return '🌐 قراءة وتلخيص صفحة ويب: ' + (params.Url || params.url || params.url_content || '');
      }
      return intent || ('تنفيذ أداة: ' + toolName);
    }

    // Robust Accessible GFM Markdown Parser with marked & DOMPurify support
    function renderMarkdown(md) {
      if (!md) return '';

      const cleanMd = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 1. High-Performance GFM Parsing via marked.js and DOMPurify if available
      if (typeof window !== 'undefined' && window.marked && window.DOMPurify) {
        try {
          const alertMap = {
            'NOTE': { label: 'ملاحظة', icon: 'ℹ️', cls: 'markdown-alert-note' },
            'TIP': { label: 'تلميح مفيد', icon: '💡', cls: 'markdown-alert-tip' },
            'IMPORTANT': { label: 'هام جداً', icon: '📌', cls: 'markdown-alert-important' },
            'WARNING': { label: 'تحذير', icon: '⚠️', cls: 'markdown-alert-warning' },
            'CAUTION': { label: 'تنبيه أمان', icon: '🛑', cls: 'markdown-alert-caution' }
          };

          let processed = cleanMd.replace(
            /(?:^|\n)>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?((?:>[^\n]*(?:\n|$))*)/gi,
            function(match, type, body) {
              const upperType = type.toUpperCase();
              const alertInfo = alertMap[upperType] || { label: upperType, icon: 'ℹ️', cls: 'markdown-alert-note' };
              const cleanBody = (body || '')
                .split('\n')
                .map(l => l.replace(/^>\s?/, ''))
                .join('\n')
                .trim();
              let formattedBody = cleanBody;
              if (window.marked) {
                try {
                  if (typeof window.marked.parseInline === 'function') {
                    formattedBody = window.marked.parseInline(cleanBody);
                  } else if (typeof window.marked.parse === 'function') {
                    formattedBody = window.marked.parse(cleanBody);
                  }
                } catch(e){}
              }
              return `\n\n<div class="markdown-alert ${alertInfo.cls}" role="region" aria-label="${alertInfo.label}">` +
                     `<div class="markdown-alert-title"><span aria-hidden="true">${alertInfo.icon}</span> <span>${alertInfo.label}</span></div>` +
                     `<div class="markdown-alert-content">${formattedBody}</div></div>\n\n`;
            }
          );

          const renderer = new window.marked.Renderer();
          renderer.code = function(code, lang) {
            const rawCode = (typeof code === 'object' && code.text) ? code.text : String(code || '');
            const langName = ((typeof code === 'object' && code.lang) ? code.lang : lang) || 'code';
            const escaped = escapeHtml(rawCode);
            return '<div class="code-card" role="region" aria-label="كود برمجي ' + escapeHtml(langName) + '">' +
              '<div class="code-card-header">' +
                '<span>' + escapeHtml(langName) + '</span>' +
                '<button type="button" class="btn-icon-sm btn-copy-code" data-code="' + encodeURIComponent(rawCode) + '" aria-label="نسخ الكود">📋 نسخ الكود</button>' +
              '</div>' +
              '<pre tabindex="0"><code>' + escaped + '</code></pre>' +
            '</div>';
          };

          const defaultTable = window.marked.Renderer.prototype.table;
          renderer.table = function(token) {
            const rendered = defaultTable.call(this, token);
            return '<div class="table-responsive-wrapper" role="region" aria-label="جدول بيانات">' + rendered + '</div>';
          };

          renderer.heading = function(token) {
            const depth = (typeof token === 'object' && token.depth) ? token.depth : 1;
            const parsedText = (typeof token === 'object' && token.tokens && this.parser)
              ? this.parser.parseInline(token.tokens)
              : ((typeof token === 'object' && token.text) ? token.text : token);
            const hLevel = Math.min(6, Math.max(3, Number(depth) + 2));
            return '<h' + hLevel + ' class="ai-heading-' + hLevel + '" dir="auto">' + parsedText + '</h' + hLevel + '>';
          };

          const defaultParagraph = window.marked.Renderer.prototype.paragraph;
          renderer.paragraph = function(token) {
            const rendered = defaultParagraph.call(this, token);
            return rendered.replace('<p>', '<p dir="auto">');
          };

          renderer.listitem = function(token) {
            const parsedText = (typeof token === 'object' && token.tokens && this.parser)
              ? this.parser.parse(token.tokens)
              : ((typeof token === 'object' && token.text) ? token.text : token);
            const isTask = (typeof token === 'object' && token.task);
            const isChecked = (typeof token === 'object' && token.checked);
            if (isTask) {
              return '<li class="task-list-item" dir="auto">' +
                '<input type="checkbox" disabled ' + (isChecked ? 'checked ' : '') + 'aria-label="' + (isChecked ? 'مكتمل' : 'غير مكتمل') + '"> ' +
                '<span>' + parsedText + '</span>' +
              '</li>';
            }
            return '<li dir="auto">' + parsedText + '</li>';
          };

          const html = window.marked.parse(processed, {
            renderer: renderer,
            gfm: true,
            breaks: true
          });

          return window.DOMPurify.sanitize(html, {
            ADD_TAGS: ['bdi', 'audio'],
            ADD_ATTR: ['target', 'rel', 'controls', 'autoplay', 'preload', 'data-code', 'dir', 'role', 'aria-label', 'aria-controls', 'tabindex', 'checked', 'disabled']
          });
        } catch (e) {
          console.warn('Marked parse failed, using fallback:', e);
        }
      }

      // 2. Enhanced Accessible Fallback Parser
      const codeBlocks = [];
      let text = cleanMd.replace(/`{3,4}([a-zA-Z0-9_\-\+\s]*)\n([\s\S]*?)`{3,4}/g, function(match, lang, code) {
        const placeholder = '___CODE_BLOCK_' + codeBlocks.length + '___';
        const cleanCode = code.trim();
        const cleanLang = (lang || '').trim() || 'code';
        codeBlocks.push(
          '<div class="code-card" role="region" aria-label="كود برمجي ' + escapeHtml(cleanLang) + '">' +
            '<div class="code-card-header">' +
              '<span>' + escapeHtml(cleanLang) + '</span>' +
              '<button type="button" class="btn-icon-sm btn-copy-code" data-code="' + encodeURIComponent(cleanCode) + '" aria-label="نسخ الكود">📋 نسخ الكود</button>' +
            '</div>' +
            '<pre tabindex="0"><code>' + escapeHtml(cleanCode) + '</code></pre>' +
          '</div>'
        );
        return '\n\n' + placeholder + '\n\n';
      });

      // Escape HTML entities in text
      text = text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Inline formatting
      text = text.replace(/`([^`]+)`/g, '<bdi class="code-inline">$1</bdi>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="main-style-140">$1</a>');
      text = text.replace(/(^|[\s\(\[\{])(https?:\/\/[^\s<>\)\]\}]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="main-style-140">$2</a>');

      const rawBlocks = text.split(/\n{2,}/);
      const outputHtml = [];

      for (let i = 0; i < rawBlocks.length; i++) {
        let block = rawBlocks[i].trim();
        if (!block) continue;

        const cbMatch = block.match(/^___CODE_BLOCK_(\d+)___$/);
        if (cbMatch) {
          const idx = parseInt(cbMatch[1], 10);
          if (codeBlocks[idx]) outputHtml.push(codeBlocks[idx]);
          continue;
        }

        const lines = block.split('\n');

        // Check for table in block
        if (lines.length >= 2 && lines[0].trim().startsWith('|') && lines[0].trim().endsWith('|')) {
          const headerCols = lines[0].split('|').slice(1, -1).map(c => c.trim());
          const rows = [];
          for (let k = 1; k < lines.length; k++) {
            const rowLine = lines[k].trim();
            if (/^\|[-:\s|]+\|$/.test(rowLine)) continue;
            if (rowLine.startsWith('|') && rowLine.endsWith('|')) {
              rows.push(rowLine.split('|').slice(1, -1).map(c => c.trim()));
            }
          }
          let tableHtml = '<div class="table-responsive-wrapper" role="region" aria-label="جدول بيانات"><table role="table"><thead><tr>';
          headerCols.forEach(col => { tableHtml += '<th scope="col">' + col + '</th>'; });
          tableHtml += '</tr></thead><tbody>';
          rows.forEach(r => {
            tableHtml += '<tr>';
            r.forEach(c => { tableHtml += '<td>' + c + '</td>'; });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table></div>';
          outputHtml.push(tableHtml);
          continue;
        }

        let currentParagraph = [];
        let listItems = [];

        function flushParagraph() {
          if (currentParagraph.length > 0) {
            outputHtml.push('<p dir="auto">' + currentParagraph.join('<br>') + '</p>');
            currentParagraph = [];
          }
        }

        function flushList() {
          if (listItems.length > 0) {
            outputHtml.push('<ul role="list">' + listItems.join('') + '</ul>');
            listItems = [];
          }
        }

        for (let j = 0; j < lines.length; j++) {
          const rawLine = lines[j];
          const trimmedLine = rawLine.trim();
          if (!trimmedLine) continue;

          const hMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
          if (hMatch) {
            flushParagraph();
            flushList();
            const hLevel = Math.min(6, Math.max(4, hMatch[1].length + 3));
            outputHtml.push('<h' + hLevel + ' class="ai-heading-' + hLevel + '" dir="auto">' + hMatch[2].trim() + '</h' + hLevel + '>');
            continue;
          }

          const listMatch = trimmedLine.match(/^[\-\*•]\s+(.+)$/) || trimmedLine.match(/^\d+[\.\)]\s+(.+)$/);
          if (listMatch) {
            flushParagraph();
            listItems.push('<li>' + listMatch[1].trim() + '</li>');
            continue;
          }

          flushList();
          currentParagraph.push(trimmedLine);
        }

        flushParagraph();
        flushList();
      }

      return outputHtml.join('');
    }

    // Global copy handlers & file link interceptor
    document.addEventListener('click', (e) => {
      const fileLink = e.target.closest('a[href^="file://"], a[href*="/brain/"]');
      if (fileLink) {
        e.preventDefault();
        const rawHref = fileLink.getAttribute('href') || '';
        const cleanPath = rawHref.replace(/^file:\/\//, '').replace(/^["']|["']$/g, '');
        const cleanName = cleanPath.split('/').pop().replace(/^["']|["']$/g, '');
        openArtifactViewer(cleanName, cleanPath, '', false, currentActiveConversationId || '');
        return;
      }
      const copyCodeBtn = e.target.closest('.btn-copy-code');
      if (copyCodeBtn) {
        const code = decodeURIComponent(copyCodeBtn.getAttribute('data-code') || '');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => {
            playBeep(880, 0.08);
            announce('تم نسخ الكود البرمجي');
            copyCodeBtn.textContent = '✓ تم النسخ';
            setTimeout(() => { copyCodeBtn.textContent = '📋 نسخ الكود'; }, 2000);
          });
        }
        return;
      }
      const copyMsgBtn = e.target.closest('.btn-copy-msg');
      if (copyMsgBtn) {
        const card = copyMsgBtn.closest('.chat-message');
        const contentEl = card ? card.querySelector('.msg-content') : null;
        if (contentEl && navigator.clipboard) {
          navigator.clipboard.writeText(contentEl.innerText).then(() => {
            playBeep(880, 0.08);
            announce('تم نسخ الرسالة');
            copyMsgBtn.textContent = '✓ تم النسخ';
            setTimeout(() => { copyMsgBtn.textContent = '📋 نسخ'; }, 2000);
          });
        }
      }
    });

    // Send AI Prompt (Always continuous - supports messaging while working)
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
          userMsgContent = `<div class="main-style-142">🎯 موجه إلى: ${escapeHtml(activeFocusedAgent)}</div><br>` + userMsgContent;
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
          const res = await window.mainV1Fetch('/api/ai/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: finalPromptToSend })
          });
          const resData = await res.json().catch(() => ({}));
          if (res.ok && resData.queued) {
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
        userMsgContent = `<div class="main-style-142">🎯 موجه إلى: ${escapeHtml(activeFocusedAgent)}</div><br>` + userMsgContent;
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
        const response = await window.mainV1Fetch('/api/ai/stream', {
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

                // 0) Session Init event
                if (data.type === 'init' && data.conversation_id) {
                  currentActiveConversationId = data.conversation_id;
                  loadArtifactsList();
                }

                // A) Live tool step event
                if (data.type === 'tool_step') {
                  playToolChime();
                  const toolDesc = escapeHtml(getToolLabel(data.tool, data.params || {}));

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

                  // Check if there is an existing step for this tool/step_index to update in-place
                  let stepLi = null;
                  if (data.step_index !== undefined && data.step_index !== null) {
                    stepLi = stepsList.querySelector(`.step-item[data-step-index="${data.step_index}"]`);
                  }
                  if (!stepLi && data.state !== 'ACTIVE') {
                    const activeSteps = stepsList.querySelectorAll('.step-item.active');
                    for (let i = activeSteps.length - 1; i >= 0; i--) {
                      if (!data.tool || activeSteps[i].dataset.tool === data.tool) {
                        stepLi = activeSteps[i];
                        break;
                      }
                    }
                  }
                  if (!stepLi && data.state === 'DONE') {
                    const lastStep = stepsList.querySelector('.step-item:last-child');
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
                    stepsList.appendChild(stepLi);
                  } else {
                    if (data.step_index !== undefined && data.step_index !== null) {
                      stepLi.dataset.stepIndex = data.step_index;
                    }
                    if (data.tool) stepLi.dataset.tool = data.tool;
                  }

                  stepLi.className = 'step-item ' + (data.state === 'ACTIVE' ? 'active' : (isError ? 'error' : 'done'));

                  const stateIcon = data.state === 'ACTIVE' ? '⚙️' : (isError ? '❌' : '✓');
                  const stateLabel = data.state === 'ACTIVE' ? 'جارٍ التنفيذ...' : (isError ? 'تعثر' : 'اكتمل');

                  if (data.tool === 'invoke_subagent') {
                    stepLi.style.background = 'rgba(57, 197, 187, 0.12)';
                    stepLi.style.border = '1px solid var(--accent-cyan)';
                    stepLi.innerHTML = '<span class="step-icon">👥</span> ' +
                      '<span><strong class="main-style-12">' + escapeHtml(toolDesc) + '</strong></span>';
                  } else if (data.tool === 'send_message') {
                    stepLi.style.background = 'rgba(163, 113, 247, 0.12)';
                    stepLi.innerHTML = '<span class="step-icon">💬</span> ' +
                      '<span><strong class="main-style-144">' + escapeHtml(toolDesc) + '</strong></span>';
                  } else {
                    const finalDesc = toolDesc || (stepLi.querySelector('.step-label') ? stepLi.querySelector('.step-label').textContent : 'تنفيذ أداة');
                    stepLi.innerHTML = '<span class="step-icon">' + stateIcon + '</span> ' +
                      '<span class="step-label">' + escapeHtml(finalDesc) + ' <small style="opacity:0.8;">(' + stateLabel + ')</small></span>';
                  }

                  // Render Real Tool Output & Execution Results (Complete Uncut Output)
                  if (data.output && String(data.output).trim()) {
                    let outDetails = stepLi.querySelector('.step-output-details');
                    if (!outDetails) {
                      outDetails = document.createElement('details');
                      outDetails.className = 'step-output-details';
                      outDetails.open = false;
                      const summary = document.createElement('summary');
                      summary.className = 'step-output-summary';
                      summary.textContent = '📄 مخرجات الأداة ونتيجة التنفيذ الكاملة (اضغط للعرض)';
                      summary.setAttribute('aria-label', 'مخرجات الأداة ونتيجة التنفيذ الكاملة (مطوية، اضغط للعرض أو الإخفاء)');
                      const pre = document.createElement('pre');
                      pre.className = 'step-output-content';
                      pre.setAttribute('tabindex', '0');
                      pre.setAttribute('role', 'region');
                      pre.setAttribute('aria-label', 'مخرجات ونتائج الأداة الكاملة');
                      outDetails.append(summary, pre);
                      stepLi.appendChild(outDetails);
                    }
                    const pre = outDetails.querySelector('pre');
                    if (pre) {
                      const outStr = String(data.output).trim();
                      pre.textContent = outStr;
                    }
                  }

                  if (data.state === 'ACTIVE') {
                    announce('جارٍ تنفيذ: ' + toolDesc);
                  } else if (isDone) {
                    announce('تم تنفيذ: ' + toolDesc + ' بنجاح');
                  } else if (isError) {
                    announce('تعثر تنفيذ: ' + toolDesc);
                  }
                  scrollChatIfNearBottom();
                }
                // B) Thought / Reasoning event (Live Thinking Stream)
                else if (data.type === 'thought' && data.text) {
                  const wasEmpty = !accumulatedThinking;
                  const newThinkingText = String(data.text).trim();
                  if (!accumulatedThinking.includes(newThinkingText)) {
                    accumulatedThinking += (accumulatedThinking ? '\n\n' : '') + newThinkingText;
                  }
                  if (thinkingAccordion) {
                    thinkingAccordion.style.display = 'block';
                    thinkingBody.removeAttribute('hidden');
                    if (thinkingFooter) thinkingFooter.removeAttribute('hidden');
                    thinkingHeader.setAttribute('aria-expanded', 'true');
                    thinkingHeader.setAttribute('aria-label', 'تفكير واستدلال الوكيل (جارٍ التفكير المباشر...)');
                    if (thinkingIcon) thinkingIcon.textContent = '▲';
                  }
                  if (thinkingBody) thinkingBody.innerHTML = renderMarkdown(accumulatedThinking);
                  if (thinkingBadge) thinkingBadge.textContent = accumulatedThinking.length + ' حرف تفكير حي';
                  if (wasEmpty) announce('بدأ الوكيل في التفكير والتحليل المنطقي المباشر');
                }
                // C) Content chunk event
                else if (data.type === 'chunk' && data.text) {
                  if (accumulatedThinking && thinkingBadge && !thinkingBadge.dataset.finished) {
                    thinkingBadge.dataset.finished = 'true';
                    thinkingBadge.textContent = 'اكتمل التفكير (' + accumulatedThinking.length + ' حرف)';
                    if (thinkingHeader) thinkingHeader.setAttribute('aria-label', 'تفكير واستدلال الوكيل (مكتمل، اضغط للإخفاء أو العرض)');
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
                  const errorMsg = '[خطأ: ' + (data.message || '') + ']';
                  if (!accumulatedText.includes(errorMsg)) {
                    accumulatedText += (accumulatedText ? '\n' : '') + errorMsg;
                    scheduleAiRender(true);
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
                  const feed = aiChatFeed || document.getElementById('ai-chat-feed');
                  if (feed) {
                    feed.appendChild(artCard);
                    scrollChatIfNearBottom();
                  }
                  announce(`تم إنشاء وثيقة عمل جديدة: ${art.name}. ${art.summary || ''}`);
                }
                // F) Permission Request from Safe Mode middleware
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
                      <div id="${permTitleId}" class="prompt-title-row main-style-145">
                        <span aria-hidden="true" class="main-style-146">🔐</span>
                        <span>مطلوب إذنك لتنفيذ هذا الإجراء:</span>
                      </div>
                      <div id="${permQuestionId}" class="main-style-147">
                        ${escapeHtml(data.question)}
                      </div>
                      <div class="prompt-options-grid main-style-148" role="group" aria-label="خيارات الموافقة">
                        <button type="button" class="btn btn-choice-yes perm-btn main-style-149" data-perm-key="y" aria-label="موافقة على العملية (نعم - مفتاح Y)">
                          <span>✅ موافقة (Yes - Y)</span>
                        </button>
                        <button type="button" class="btn btn-choice-no perm-btn main-style-150" data-perm-key="n" aria-label="رفض العملية (لا - مفتاح N)">
                          <span>❌ رفض (No - N)</span>
                        </button>
                        <button type="button" class="btn btn-choice-always perm-btn main-style-151" data-perm-key="a" aria-label="موافقة دائماً على هذا النوع (مفتاح A)">
                          <span>🔄 موافقة دائماً (A)</span>
                        </button>
                      </div>
                    `;

                    targetContainer.appendChild(card);
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const sendDecision = async (key) => {
                      try {
                        await window.mainV1Fetch('/api/ai/permission', {
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
                // F) Permission Result confirmation
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
              '<div class="connection-notice main-style-152">' +
                '⚠️ حدث انقطاع مؤقت في تدفق الشبكة (' + escapeHtml(err.message) + '). الإجابة المكتملة محفوظة في سجل الجلسة، وجارٍ استعادتها تلقائياً...' +
              '</div>';
            // Auto-recovery: query conversation transcript after 2.5s to fetch completed response
            setTimeout(async () => {
              if (currentActiveConversationId) {
                try {
                  const res = await window.mainV1Fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId));
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
            aiContentDiv.innerHTML = '<p class="main-style-153">⚠️ تعذر الاتصال بالوكيل: ' + escapeHtml(err.message) + '</p>';
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
          window.mainV1Fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId))
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
        const cancelled = await window.mainV1Fetch('/api/ai/abort', { method: 'POST' });
        if (!cancelled.ok) { announce((await cancelled.json()).error); return; }
        isAiGenerating = false;
        announce('تم إيقاف المهمة الجارية بنجاح');
      });
    }


    if (btnNewAiChat) {
      btnNewAiChat.addEventListener('click', async () => {
        const closed = await window.mainV1Fetch('/api/ai/chat/reset', { method: 'POST' });
        if (!closed.ok) { announce((await closed.json()).error); return; }
        if (aiAbortController) aiAbortController.abort();
        forceNewSession = true;
        currentActiveConversationId = null;
        knownArtifacts.clear();
        updateArtifactsUI(0);
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

    // ==========================================================================
    // File Explorer Modal
    // ==========================================================================
    async function loadDirectory(path) {
      try {
        const url = '/api/fs/list' + (path ? '?path=' + encodeURIComponent(path) : '');
        const res = await window.mainV1Fetch(url);
        if (res.ok) {
          const data = await res.json();
          renderFilesList(data.current_dir, data.items || [], data.parent_dir);
        }
      } catch(e) {
        announce('تعذر تحميل الملفات');
      }
    }

    function renderFilesList(currentDir, items, parentDir) {
      if (!filesListContainer) return;
      fileViewerContainer.style.display = 'none';
      filesListContainer.style.display = 'block';

      let html = '<div class="files-nav-bar main-style-154">';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/data/data/com.termux/files/home" aria-label="الانتقال إلى مجلد تيرماكس الرئيسي">🏠 تيرماكس</button>';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/storage/emulated/0" aria-label="الانتقال إلى ذاكرة الهاتف الداخلية">📱 الذاكرة</button>';
      html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="/storage/emulated/0/Download" aria-label="الانتقال إلى التنزيلات">📥 التنزيلات</button>';
      if (parentDir) {
        html += '<button type="button" class="btn btn-sm btn-quick-nav" data-nav="' + escapeHtml(parentDir) + '" aria-label="الصعود للمجلد الأعلى">⬆️ لأعلى</button>';
      }
      html += '<button type="button" id="btn-create-new-project" class="btn btn-sm btn-primary" aria-label="إنشاء مشروع أو مجلد جديد هنا">➕ مشروع جديد</button>';
      html += '<button type="button" id="btn-set-active-project" class="btn btn-sm main-style-155" aria-label="تعيين هذا المجلد كمشروع العمل النشط للوكيل">🎯 تعيين كمشروع نشط</button>';
      html += '</div>';

      html += '<div id="new-project-panel" role="region" aria-label="نموذج إنشاء مشروع جديد" class="main-style-156">' +
        '<label for="input-new-project-name" class="main-style-157">اسم المشروع أو المجلد الجديد:</label>' +
        '<div class="main-style-158">' +
          '<input type="text" id="input-new-project-name" class="ai-prompt-input main-style-159" placeholder="اكتب اسم المشروع هنا" aria-label="اسم المشروع أو المجلد الجديد">' +
          '<button type="button" id="btn-submit-create-proj" class="btn btn-sm btn-primary" aria-label="تأكيد إنشاء المشروع">إنشاء وتعيين</button>' +
          '<button type="button" id="btn-cancel-create-proj" class="btn btn-sm" aria-label="إلغاء إنشاء المشروع">إلغاء</button>' +
        '</div>' +
      '</div>';

      html += '<div class="files-header-path main-style-160">المسار: <code>' + escapeHtml(currentDir) + '</code></div>';
      html += '<ul class="files-list" role="list">';

      if (items.length === 0) {
        html += '<li class="main-style-161">المجلد فارغ</li>';
      }

      items.forEach(item => {
        const icon = item.is_dir ? '📁' : '📄';
        html += '<li class="file-item" role="listitem">' +
          '<button type="button" class="btn-file-open" data-path="' + escapeHtml(item.path) + '" data-isdir="' + (item.is_dir ? '1' : '0') + '" aria-label="' + (item.is_dir ? 'مجلد ' : 'ملف ') + escapeHtml(item.name) + '">' +
            '<span>' + icon + ' ' + escapeHtml(item.name) + '</span>' +
            '<span class="file-meta">' + (item.is_dir ? 'مجلد' : Math.round(item.size / 1024) + ' KB') + '</span>' +
          '</button>' +
        '</li>';
      });
      html += '</ul>';
      filesListContainer.innerHTML = html;

      // Attach quick nav listeners
      filesListContainer.querySelectorAll('.btn-quick-nav').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetNav = btn.getAttribute('data-nav');
          if (targetNav) loadDirectory(targetNav);
        });
      });

      const btnCreateProj = document.getElementById('btn-create-new-project');
      const newProjPanel = document.getElementById('new-project-panel');
      const inputNewProjName = document.getElementById('input-new-project-name');
      const btnSubmitCreateProj = document.getElementById('btn-submit-create-proj');
      const btnCancelCreateProj = document.getElementById('btn-cancel-create-proj');

      if (btnCreateProj && newProjPanel && inputNewProjName) {
        btnCreateProj.addEventListener('click', () => {
          newProjPanel.style.display = 'block';
          inputNewProjName.value = '';
          inputNewProjName.focus();
          announce('اكتب اسم المشروع أو المجلد الجديد ثم اضغط إنشاء وتعيين');
        });

        if (btnCancelCreateProj) {
          btnCancelCreateProj.addEventListener('click', () => {
            newProjPanel.style.display = 'none';
            btnCreateProj.focus();
            announce('تم إلغاء إنشاء المشروع');
          });
        }

        async function submitNewProject() {
          const rawName = inputNewProjName.value.trim();
          if (!rawName) {
            announce('يرجى كتابة اسم المشروع أولاً');
            inputNewProjName.focus();
            return;
          }
          const cleanName = rawName.replace(new RegExp('[\\\\/:*?"<>|]', 'g'), '_');
          announce('جارٍ إنشاء المشروع ' + cleanName + '...');
          try {
            const res = await window.mainV1Fetch('/api/fs/mkdir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parent_dir: currentDir, name: cleanName })
            });
            let targetPath = currentDir + (currentDir.endsWith('/') ? '' : '/') + cleanName;
            if (!res.ok) { announce((await res.json()).error); return; }
            const resData = await res.json();
            if (resData && resData.path) targetPath = resData.path;
            if (filesDialog) filesDialog.close();
            if (aiInput) {
              aiInput.value = 'اعتبر المجلد ' + targetPath + ' هو مجلد المشروع النشط للعمل.';
              aiInput.focus();
            }
            announce('أُنشئ المجلد وأُضيف طلب اختياره إلى المسودة: ' + cleanName);
            playSuccessChime();
          } catch(err) {
            announce('حدث خطأ أثناء إنشاء المشروع');
          }
        }

        if (btnSubmitCreateProj) {
          btnSubmitCreateProj.addEventListener('click', submitNewProject);
        }

        inputNewProjName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitNewProject();
          } else if (e.key === 'Escape') {
            newProjPanel.style.display = 'none';
            btnCreateProj.focus();
          }
        });
      }

      const btnSetActiveProj = document.getElementById('btn-set-active-project');
      if (btnSetActiveProj) {
        btnSetActiveProj.addEventListener('click', async () => {
          const selected = await window.mainV1Fetch('/api/fs/select', {method: 'POST', body: JSON.stringify({path: currentDir})});
          if (!selected.ok) { announce((await selected.json()).error); return; }
          if (filesDialog) filesDialog.close();
          currentActiveConversationId = null; forceNewSession = true;
          announce('اختير مجلد العمل للدور التالي: ' + currentDir);
          aiInput?.focus();
        });
      }
    }

    let currentActiveFilePath = '';

    async function openFileContent(filePath) {
      try {
        const res = await window.mainV1Fetch('/api/fs/read?path=' + encodeURIComponent(filePath));
        if (res.ok) {
          const data = await res.json();
          currentActiveFilePath = data.path || filePath;
          filesListContainer.style.display = 'none';
          fileViewerContainer.style.display = 'block';
          fileViewerTitle.textContent = '📄 ' + data.name;
          fileViewerContent.textContent = data.content || '(الملف فارغ)';
          announce('تم فتح محتوى الملف: ' + data.name);
          playBeep(700, 0.08);
        }
      } catch(e) {
        announce('تعذر قراءة محتوى الملف');
      }
    }

    const btnSendFileToPrompt = document.getElementById('btn-send-file-to-prompt');
    const btnCopyFilePath = document.getElementById('btn-copy-file-path');

    if (btnSendFileToPrompt) {
      btnSendFileToPrompt.addEventListener('click', () => {
        if (!currentActiveFilePath) return;
        if (filesDialog) filesDialog.close();
        if (aiInput) {
          const fileName = currentActiveFilePath.split('/').pop() || currentActiveFilePath;
          aiInput.value = (aiInput.value ? aiInput.value + ' ' : '') + currentActiveFilePath;
          aiInput.focus();
          announce('تم إدراج مسار الملف ' + fileName + ' في حقل طلب الوكيل');
          playSuccessChime();
        }
      });
    }

    if (btnCopyFilePath) {
      btnCopyFilePath.addEventListener('click', () => {
        if (!currentActiveFilePath) return;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(currentActiveFilePath).then(() => {
            playBeep(880, 0.08);
            announce('تم نسخ مسار الملف الكامل');
            btnCopyFilePath.textContent = '✓ تم النسخ';
            setTimeout(() => { btnCopyFilePath.textContent = '📋 نسخ المسار'; }, 2000);
          });
        }
      });
    }

    if (filesListContainer) {
      filesListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-file-open');
        if (btn) {
          const path = btn.getAttribute('data-path');
          const isDir = btn.getAttribute('data-isdir') === '1';
          if (isDir) {
            loadDirectory(path);
          } else {
            openFileContent(path);
          }
        }
      });
    }

    if (btnBackToFiles) {
      btnBackToFiles.addEventListener('click', () => {
        fileViewerContainer.style.display = 'none';
        filesListContainer.style.display = 'block';
      });
    }

    if (filesDialog) {
      const openFilesModal = async () => {
        await loadDirectory();
        filesDialog.showModal();
        announce('تم فتح مستعرض ملفات المشروع');
      };
      if (btnOpenFiles) btnOpenFiles.addEventListener('click', openFilesModal);
      if (btnOpenFilesBottom) btnOpenFilesBottom.addEventListener('click', openFilesModal);
    }
    if (btnCloseFiles && filesDialog) {
      btnCloseFiles.addEventListener('click', () => filesDialog.close());
    }
    if (btnCloseFilesTop && filesDialog) {
      btnCloseFilesTop.addEventListener('click', () => filesDialog.close());
    }

    // ==========================================================================
    // DYNAMIC SCHEMA-DRIVEN SETTINGS & REALTIME LIVE SYNC ENGINE
    // ==========================================================================
    class DynamicSettingsEngine {
      constructor() {
        this.dialog = document.getElementById('settings-dialog');
        this.form = document.getElementById('dynamic-settings-form');
        this.fieldsContainer = document.getElementById('dynamic-settings-fields');
        this.skeleton = document.getElementById('dynamic-settings-skeleton');
        this.syncBadge = document.getElementById('settings-sync-badge');
        this.btnSave = document.getElementById('btn-save-settings');
        this.btnReset = document.getElementById('btn-reset-settings');
        this.btnClose = document.getElementById('btn-close-dialog');
        this.btnCloseTop = document.getElementById('btn-close-dialog-top');

        this.state = {};
        this.initialState = {};
        this.baseline = null;
        this.saveRequest = null;
        this.remoteRequest = null;
        this.remoteGeneration = 0;
        this.models = [];
          this.agents = [];
        this.dirtyFields = new Set();
        this.broadcast = null;
        this.syncPollInterval = null;

        this.initBroadcast();
        this.bindEvents();
      }

      initBroadcast() {
        if ('BroadcastChannel' in window) {
          this.broadcast = window.mainV1.settingsBroadcast;
          if (!this.broadcast) return;
          this.broadcast.onmessage = (e) => {
            if (e.data && e.data.type === 'SETTINGS_UPDATED') {
              this.handleExternalSync();
            }
          };
        }
      }

      getSchema() {
        return [
          {
            section: 'general',
            legend: 'إعدادات النموذج',
            fields: [
              {
                id: 'field-model',
                key: 'model',
                type: 'select_models',
                label: 'النموذج النشط',
                hint: 'نموذج الذكاء الاصطناعي المستخدم للجلسة.',
                default: ''
              },
              {
                id: 'field-agent', key: 'agent', type: 'select', label: 'الوكيل النشط',
                hint: 'وكيل من قائمة CLI الفعلية.',
                options: [{value: '', label: 'الوكيل الافتراضي'}, ...this.agents.map(a => ({value: a.id || a.name, label: a.name || a.id}))]
              },
              {
                id: 'field-mode',
                key: 'mode',
                type: 'select',
                label: 'نمط التنفيذ',
                hint: 'تنفيذ الأوامر مباشرة أو تخطيط مسبق.',
                options: [
                  { value: 'accept-edits', label: 'تنفيذ مباشر (accept-edits)' },
                  { value: 'plan', label: 'تخطيط مسبق (plan)' }
                ],
                default: 'accept-edits'
              },
              {
                id: 'field-effort',
                key: 'effort',
                type: 'select',
                label: 'مستوى التفكير',
                hint: 'عمق التفكير للنماذج الداعمة.',
                options: [
                  { value: 'medium', label: 'متوسط (افتراضي)' },
                  { value: 'low', label: 'منخفض (إجابات سريعة)' },
                  { value: 'high', label: 'عميق (مهام معقدة)' },
                  { value: 'xhigh', label: 'أعمق (xhigh)' },
                  { value: 'max', label: 'أقصى عمق' }
                ],
                default: 'medium'
              }
            ]
          },
          {
            section: 'sandbox_permissions',
            legend: 'الأمان والصلاحيات',
            fields: [
              {
                id: 'field-autopilot',
                key: 'autopilot',
                type: 'switch',
                label: 'الطيار الآلي',
                hint: 'تشغيل الأدوات المعتمدة بدون طلب تأكيد لكل خطوة.',
                colorBorder: 'var(--accent-cyan)',
                default: true
              },
              {
                id: 'field-sandbox',
                key: 'sandbox',
                type: 'switch',
                label: 'عزل الطرفية (Sandbox)',
                hint: 'تشغيل الأوامر داخل بيئة معزولة.',
                colorBorder: 'var(--accent-red)',
                default: false
              },
              {
                id: 'field-allow-non-workspace',
                key: 'allowNonWorkspaceAccess',
                type: 'switch',
                label: 'الوصول خارج المجلد',
                hint: 'السماح بفحص الملفات خارج مجلد العمل الحالي.',
                colorBorder: 'var(--accent-purple)',
                default: true
              },
              {
                id: 'field-perm-commands',
                key: 'allow_commands',
                type: 'switch',
                label: 'تشغيل الأوامر (Terminal)',
                hint: 'السماح بتنفيذ أوامر التيرمنال.',
                colorBorder: 'var(--accent-green)',
                default: true
              },
              {
                id: 'field-perm-file-write',
                key: 'allow_write',
                type: 'switch',
                label: 'تعديل الملفات',
                hint: 'السماح بإنشاء وتعديل الملفات.',
                colorBorder: '#58a6ff',
                default: true
              },
              {
                id: 'field-perm-web-access',
                key: 'allow_web',
                type: 'switch',
                label: 'تصفح الويب',
                hint: 'السماح بالبحث وقراءة صفحات الإنترنت.',
                colorBorder: 'var(--accent-cyan)',
                default: true
              },
              {
                id: 'field-perm-subagents',
                key: 'allow_subagent',
                type: 'switch',
                label: 'الوكلاء الفرعيون',
                hint: 'السماح بتشغيل وكلاء في الخلفية.',
                colorBorder: 'var(--accent-purple)',
                default: true
              },
              {
                id: 'field-perm-schedule',
                key: 'allow_schedule',
                type: 'switch',
                label: 'المؤقتات والمهام المجدولة',
                hint: 'السماح بجدولة المؤقتات ومهام الخلفية.',
                colorBorder: 'var(--accent-red)',
                default: false
              },
              {
                id: 'field-whitelist-rules',
                type: 'whitelist_manager',
                label: 'الأوامر المصرح بها دائماً'
              }
            ]
          },
          {
            section: 'trusted_workspaces',
            legend: 'مجلدات العمل الموثوقة',
            fields: [
              {
                id: 'field-trusted-workspaces',
                key: 'trustedWorkspaces',
                type: 'array_chips',
                label: 'مجلدات العمل',
                hint: 'المسارات المصرح للوكيل بالعمل داخلها.',
                default: []
              }
            ]
          },
          {
            section: 'accessibility_feedback',
            legend: 'إمكانية الوصول والتنبيهات',
            fields: [
              {
                id: 'field-voice-tones',
                key: 'tones_enabled',
                type: 'switch',
                label: 'نغمات التنبيه التفاعلية',
                hint: 'تشغيل نغمة صوتية عند بدء وانتهاء تنفيذ الأوامر.',
                default: true
              },
              {
                id: 'field-voice-haptic',
                key: 'haptic_enabled',
                type: 'switch',
                label: 'الاهتزاز اللمسي',
                hint: 'اهتزاز خفيف لتأكيد الإجراءات على الهواتف الداعمة.',
                default: true
              },
              {
                id: 'field-voice-speech',
                key: 'speech_enabled',
                type: 'switch',
                label: 'النطق الصوتي للمتصفح (Speech)',
                hint: 'قراءة الردود صوتياً بمحرك المتصفح. ⚠️ يُفضل إيقافه إن كنت تستخدم TalkBack أو Jieshuo.',
                default: false
              }
            ]
          },
          {
            section: 'system_resources',
            legend: 'استهلاك النظام والتحديثات',
            fields: [
              {
                id: 'field-quota-metric',
                type: 'resource_summary',
                label: 'استهلاك الموارد'
              },
              {
                id: 'field-system-update',
                type: 'system_update',
                label: 'تحديث Antigravity CLI'
              }
            ]
          }
        ];
      }

      async fetchRemoteData(discardDraft = false) {
        if (this.remoteRequest) return this.remoteRequest;
        this.setSyncStatus('syncing', 'Syncing...');
        const generation = this.remoteGeneration;
        const pending = (async () => {
          const responses = await Promise.allSettled([
            window.mainV1Fetch('/api/ai/models'), window.mainV1Fetch('/api/ai/settings'),
            window.mainV1Fetch('/api/ai/agents')
          ]);
          const [modelsRes, settingsRes, agentsRes] = responses.map(response => response.status === 'fulfilled' ? response.value : null);
          const readCatalog = async (response, key) => {
            if (!response?.ok) throw new Error('تعذر جلب القائمة');
            const listing = await response.json();
            const entries = key ? listing?.[key] : listing;
            if (!Array.isArray(entries)) throw new Error('قائمة غير صالحة');
            return entries;
          };
          const catalogs = await Promise.allSettled([readCatalog(modelsRes), readCatalog(agentsRes, 'agents')]);
          if (!settingsRes?.ok) throw new Error('تعذر جلب الإعدادات');
          const raw = await settingsRes.json();
          if (generation !== this.remoteGeneration) return false;
          if (catalogs[0].status === 'fulfilled') {
            this.models = catalogs[0].value;
            if (Array.isArray(catalogs[0].value) && catalogs[0].value.length > 0) {
              window._cachedModels = catalogs[0].value;
            }
          }
          if (catalogs[1].status === 'fulfilled') this.agents = catalogs[1].value;
          const normalized = this.normalizeSettings(raw);
          if (discardDraft) this.dirtyFields.clear();
          if (discardDraft || (!this.dirtyFields.size && !this.saveRequest)) {
            this.initialState = JSON.parse(JSON.stringify(normalized));
            this.baseline = {revision: settingsRes.headers.get('X-Settings-Revision'),
              policyRevision: settingsRes.headers.get('X-Policy-Revision'), permissions: raw.permissions};
          }
          Object.keys(normalized).forEach(key => {
            if (!this.dirtyFields.has(key)) this.state[key] = normalized[key];
          });
          this.setSyncStatus(this.dirtyFields.size ? 'idle' : 'saved', this.dirtyFields.size ? 'تغييرات لم تُحفظ' : '● Live Synced');
          if (typeof syncActiveModelDisplay === 'function' && this.state.model) syncActiveModelDisplay(this.state.model);
          if (typeof syncReasoningEffortDisplay === 'function' && this.state.effort) syncReasoningEffortDisplay(this.state.effort);
          return true;
        })().catch(err => {
          if (generation !== this.remoteGeneration) return false;
          console.error('Failed fetching settings schema:', err);
          this.setSyncStatus('idle', this.dirtyFields.size ? 'تعذر الاتصال؛ تغييرات لم تُحفظ' : 'Offline / Cache');
          return false;
        }).finally(() => { if (this.remoteRequest === pending) this.remoteRequest = null; });
        this.remoteRequest = pending;
        return pending;
      }

      normalizeSettings(raw) {
        const perms = raw.permissions?.allow || [];
        const isSafe = raw.safe_mode !== undefined ? !!raw.safe_mode : (raw.autopilot !== undefined ? !raw.autopilot : true);
        return {
          model: raw.model || '',
          agent: raw.agent || '',
          allow_schedule: raw.allow_schedule !== undefined ? !!raw.allow_schedule : (perms.includes('schedule') || perms.includes('schedule(*)')),
          effort: raw.effort || 'medium',
          autopilot: raw.autopilot !== undefined ? !!raw.autopilot : !isSafe,
          safe_mode: isSafe,
          allow_commands: raw.allow_commands !== undefined ? !!raw.allow_commands : (perms.includes('command') || perms.includes('command(*)')),
          allow_write: raw.allow_write !== undefined ? !!raw.allow_write : (perms.includes('file_write') || perms.includes('write_file(*)')),
          allow_web: raw.allow_web !== undefined ? !!raw.allow_web : (perms.includes('web_access') || perms.includes('read_url(*)')),
          allow_subagent: raw.allow_subagent !== undefined ? !!raw.allow_subagent : (perms.includes('subagents') || perms.includes('invoke_subagent(*)')),
          mode: raw.mode || 'accept-edits',
          sandbox: !!raw.sandbox,
          allowNonWorkspaceAccess: raw.allowNonWorkspaceAccess !== undefined ? !!raw.allowNonWorkspaceAccess : true,
          whitelist: Array.isArray(raw.whitelist) ? [...raw.whitelist] : [...perms],
          tones_enabled: raw.tones_enabled !== undefined ? !!raw.tones_enabled : true,
          haptic_enabled: raw.haptic_enabled !== undefined ? !!raw.haptic_enabled : true,
          speech_enabled: raw.speech_enabled !== undefined ? !!raw.speech_enabled : false,
          trustedWorkspaces: Array.isArray(raw.trustedWorkspaces) ? [...raw.trustedWorkspaces] : []
        };
      }

      render() {
        if (!this.fieldsContainer) return;
        this.fieldsContainer.innerHTML = '';
        const schema = this.getSchema();

        schema.forEach(sec => {
          const fieldset = document.createElement('fieldset');
          fieldset.className = 'form-section-fieldset';
          fieldset.id = `fieldset-${sec.section}`;

          const legend = document.createElement('legend');
          legend.className = 'form-section-legend';
          legend.textContent = sec.legend;
          fieldset.appendChild(legend);

          sec.fields.forEach(f => {
            const fieldEl = this.buildFieldElement(f);
            if (fieldEl) fieldset.appendChild(fieldEl);
          });

          this.fieldsContainer.appendChild(fieldset);
        });

        if (this.skeleton) this.skeleton.style.display = 'none';
        this.fieldsContainer.style.display = 'block';
      }

      buildFieldElement(f) {
        const container = document.createElement('div');
        container.className = 'form-group';
        const unsupported = false;

        if (f.type === 'select_models') {
          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = document.createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          this.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id || m.name;
            opt.setAttribute('data-id', m.id || '');
            opt.textContent = m.name + (m.tag ? ` (${m.tag})` : '');
            if (this.state.model && (this.state.model === m.name || this.state.model === m.id)) {
              opt.selected = true;
            }
            select.appendChild(opt);
          });

          select.addEventListener('change', (e) => {
            this.state.model = e.target.value;
            this.dirtyFields.add('model');
            announce(`Selected Model: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = document.createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'select') {
          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-label';
          label.textContent = f.label;

          const select = document.createElement('select');
          select.id = f.id;
          select.className = 'form-control';
          select.setAttribute('aria-describedby', `${f.id}-hint`);

          f.options.forEach(optData => {
            const opt = document.createElement('option');
            opt.value = optData.value;
            opt.textContent = optData.label;
            if (this.state[f.key] === optData.value) opt.selected = true;
            select.appendChild(opt);
          });

          select.addEventListener('change', (e) => {
            this.state[f.key] = e.target.value;
            this.dirtyFields.add(f.key);
            announce(`${f.label}: ${e.target.value}`);
            this.debouncedSave();
          });

          const hint = document.createElement('p');
          hint.id = `${f.id}-hint`;
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          container.appendChild(label);
          container.appendChild(select);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'switch') {
          container.className = 'form-switch-row';
          if (f.colorBorder) container.style.borderRight = `3px solid ${f.colorBorder}`;

          const textCol = document.createElement('div');
          textCol.className = 'form-switch-text';

          const label = document.createElement('label');
          label.htmlFor = f.id;
          label.className = 'form-switch-title';
          label.textContent = f.label;

          const desc = document.createElement('div');
          desc.id = `${f.id}-desc`;
          desc.className = 'form-switch-desc';
          desc.textContent = f.hint;

          textCol.appendChild(label);
          textCol.appendChild(desc);

          const switchBox = document.createElement('label');
          switchBox.className = 'switch-control';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.id = f.id;
          input.checked = !!this.state[f.key];
          input.disabled = !!f.disabled;
          input.setAttribute('role', 'switch');
          input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
          input.setAttribute('aria-describedby', `${f.id}-desc`);

          const slider = document.createElement('span');
          slider.className = 'switch-slider';

          input.addEventListener('change', (e) => {
            const val = e.target.checked;
            this.state[f.key] = val;
            this.dirtyFields.add(f.key);
            input.setAttribute('aria-checked', val ? 'true' : 'false');
            announce(`${f.label} is now ${val ? 'Enabled' : 'Disabled'}`);
            this.debouncedSave();
          });

          switchBox.appendChild(input);
          switchBox.appendChild(slider);

          container.appendChild(textCol);
          container.appendChild(switchBox);
          return container;
        }

        if (f.type === 'array_chips') {
          const label = document.createElement('label');
          label.htmlFor = `${f.id}-input`;
          label.className = 'form-label';
          label.textContent = f.label;

          const chipContainer = document.createElement('div');
          chipContainer.id = `${f.id}-list`;
          chipContainer.className = 'chip-array-container';
          chipContainer.setAttribute('role', 'list');
          chipContainer.setAttribute('aria-label', f.label);

          const renderChips = () => {
            chipContainer.innerHTML = '';
            const items = this.state[f.key] || [];
            if (items.length === 0) {
              chipContainer.innerHTML = '<span class="main-style-162">No paths defined.</span>';
              return;
            }
            items.forEach((itemVal, idx) => {
              const chip = document.createElement('span');
              chip.className = 'chip-item';
              chip.setAttribute('role', 'listitem');
              chip.textContent = itemVal;

              const removeBtn = document.createElement('button');
              removeBtn.type = 'button';
              removeBtn.className = 'chip-btn-remove';
              removeBtn.innerHTML = '&times;';
              removeBtn.setAttribute('aria-label', `Remove workspace ${itemVal}`);
              removeBtn.addEventListener("click", () => {
                this.state[f.key].splice(idx, 1);
                this.dirtyFields.add(f.key);
                renderChips();
                announce(`Removed workspace ${itemVal}`);
              });

              chip.appendChild(removeBtn);
              chipContainer.appendChild(chip);
            });
          };

          const addBox = document.createElement('div');
          addBox.className = 'chip-add-box';

          const addInput = document.createElement('input');
          addInput.type = 'text';
          addInput.id = `${f.id}-input`;
          addInput.className = 'chip-add-input';
          addInput.placeholder = '/data/data/com.termux/files/home/my-project';
          addInput.setAttribute('aria-label', 'New workspace path to trust');

          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'chip-add-btn';
          addBtn.textContent = '➕ Add Path';
          addBtn.addEventListener("click", () => {
            const val = addInput.value.trim();
            if (val) {
              if (!this.state[f.key]) this.state[f.key] = [];
              if (!this.state[f.key].includes(val)) {
                this.state[f.key].push(val);
                this.dirtyFields.add(f.key);
                renderChips();
                announce(`Added trusted workspace ${val}`);
                addInput.value = '';
              }
            }
          });

          addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBtn.click();
            }
          });

          addBox.appendChild(addInput);
          addBox.appendChild(addBtn);

          const hint = document.createElement('p');
          hint.className = 'form-hint';
          hint.textContent = f.hint;

          renderChips();
          container.appendChild(label);
          container.appendChild(chipContainer);
          container.appendChild(addBox);
          container.appendChild(hint);
          return container;
        }

        if (f.type === 'resource_summary') {
          container.innerHTML = `
            <div class="main-style-163">
              <span class="main-style-164">Model Tokens & Quotas</span>
              <button type="button" id="btn-dyn-open-quota" class="btn-icon-sm main-style-165" aria-label="Open official quota details">📊 Quota Details</button>
            </div>
            <div class="main-style-166">
              <div class="main-style-118">
                <span>Context Window Used:</span>
                <strong id="dyn-context-text">0 / 1,048,576 tokens (0%)</strong>
              </div>
              <div class="mini-progress-track main-style-167"><div class="mini-progress-fill main-style-168" id="dyn-context-fill"></div></div>
            </div>
          `;

          setTimeout(() => {
            const btnQ = container.querySelector('#btn-dyn-open-quota');
            const qDlg = document.getElementById('quota-dialog');
            if (btnQ && qDlg) {
              btnQ.addEventListener("click", () => {
                if (this.dialog) this.dialog.close();
                qDlg.showModal();
                announce('Opened Quota Details modal');
                if (typeof loadQuotaData === 'function') loadQuotaData();
              });
            }
          }, 0);

          return container;
        }

        if (f.type === 'whitelist_manager') {
          container.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-label';
          label.textContent = f.label || 'Auto-Approved Commands Whitelist';

          const hint = document.createElement('p');
          hint.className = 'form-hint';
          hint.textContent = 'أوامر التيرمنال المصرح بها دائماً دون الحاجة لطلب إذن. يمكنك حذف أي أمر لإعادة طلب الإذن قبل تنفيذه.';

          const listContainer = document.createElement('div');
          listContainer.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:8px;';

          const renderWhitelist = () => {
            listContainer.innerHTML = '';
            const rules = this.state.whitelist || [];
            if (rules.length === 0) {
              listContainer.innerHTML = '<div class="main-style-169">لا توجد أوامر مخصصة مصرح بها دائماً حالياً.</div>';
              return;
            }
            rules.forEach(ruleStr => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; background:var(--bg-card); border:1px solid var(--border-main); border-radius:6px;';

              const codeSpan = document.createElement('code');
              codeSpan.style.cssText = 'font-size:0.8rem; color:var(--accent-cyan); word-break:break-all; font-family:var(--font-mono);';
              codeSpan.textContent = ruleStr;

              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'btn-icon-sm';
              delBtn.style.cssText = 'background:rgba(255, 123, 114, 0.15); color:var(--accent-red); border:1px solid var(--accent-red); border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; flex-shrink:0;';
              delBtn.setAttribute('aria-label', `حذف التصريح الدائم للأمر ${ruleStr}`);
              delBtn.textContent = '❌ حذف';
              delBtn.addEventListener("click", async () => {
                try {
                  if (this._debounceTimer) clearTimeout(this._debounceTimer);
                  if (this.saveRequest) await this.saveRequest;
                  delBtn.disabled = true;
                  const res = await window.mainV1Fetch('/api/ai/permissions/whitelist/remove', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ rule: ruleStr })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    this.state.whitelist = data.whitelist || [];
                    if (data.baseline) this.baseline = data.baseline;
                    if (data.settings && data.settings.revision) this.state.revision = data.settings.revision;
                    renderWhitelist();
                    announce(`تم حذف التصريح الدائم للأمر ${ruleStr}`);
                    if (this.dirtyFields.size) {
                      this.debouncedSave();
                    }
                  }
                } catch (e) {
                  console.error(e);
                }
              });

              row.appendChild(codeSpan);
              row.appendChild(delBtn);
              listContainer.appendChild(row);
            });
          };

          const addBox = document.createElement('div');
          addBox.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
          const addInput = document.createElement('input');
          addInput.type = 'text';
          addInput.className = 'form-control';
          addInput.placeholder = 'مثال: command(git *) أو command(ls)';
          addInput.setAttribute('aria-label', 'إضافة أمر مصرح به دائماً');
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'btn btn-secondary';
          addBtn.style.cssText = 'flex-shrink:0;';
          addBtn.textContent = '➕ إضافة تصريح';
          addBtn.addEventListener('click', async () => {
            const val = (addInput.value || '').trim();
            if (val) {
              try {
                if (this._debounceTimer) clearTimeout(this._debounceTimer);
                if (this.saveRequest) await this.saveRequest;
                addBtn.disabled = true;
                const res = await window.mainV1Fetch('/api/ai/permissions/whitelist/add', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ rule: val })
                });
                if (res.ok) {
                  const data = await res.json();
                  this.state.whitelist = data.whitelist || [];
                  if (data.baseline) this.baseline = data.baseline;
                  if (data.settings && data.settings.revision) this.state.revision = data.settings.revision;
                  renderWhitelist();
                  announce(`تمت إضافة التصريح الدائم: ${val}`);
                  addInput.value = '';
                  if (this.dirtyFields.size) {
                    this.debouncedSave();
                  }
                }
              } catch (e) {
                console.error(e);
              } finally {
                addBtn.disabled = false;
              }
            }
          });
          addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBtn.click();
            }
          });
          addBox.appendChild(addInput);
          addBox.appendChild(addBtn);

          renderWhitelist();
          container.appendChild(label);
          container.appendChild(hint);
          container.appendChild(listContainer);
          container.appendChild(addBox);
          return container;
        }

        if (f.type === 'system_update') {
          container.className = 'form-group';
          container.style.cssText = 'background:rgba(255,255,255,0.02); border:1px solid var(--border-main); border-radius:8px; padding:12px; margin-top:10px;';
          container.innerHTML = `
            <div class="main-style-163">
              <span class="main-style-170">🚀 Antigravity CLI Version & System Update</span>
              <span id="dyn-cli-ver-badge" class="badge main-style-171">فحص...</span>
            </div>
            <p class="form-hint main-style-172">يمكنك التحقق من وجود إصدار أحدث لأداة Antigravity CLI وتحديثها في الخلفية بضغطة واحدة.</p>
            <div class="main-style-173">
              <button type="button" id="btn-dyn-update-cli" class="btn btn-primary main-style-174" aria-label="تحديث Antigravity CLI إلى أحدث إصدار">
                🔄 تحديث Antigravity CLI الآن
              </button>
              <span id="dyn-update-status" role="status" aria-live="polite" class="main-style-175"></span>
            </div>
          `;

          setTimeout(async () => {
            const verBadge = container.querySelector('#dyn-cli-ver-badge');
            const btnUpdate = container.querySelector('#btn-dyn-update-cli');
            const statusSpan = container.querySelector('#dyn-update-status');
            try {
              const res = await window.mainV1Fetch('/api/system/version');
              if (res.ok) {
                const vData = await res.json();
                if (verBadge) verBadge.textContent = vData.version || 'v1.x';
              }
            } catch (e) {}

            if (btnUpdate) {
              btnUpdate.addEventListener("click", async () => {
                if (btnUpdate.disabled) return;
                btnUpdate.disabled = true;
                if (statusSpan) statusSpan.textContent = '⏳ جاري تنزيل وتثبيت التحديث...';
                announce('جاري تنزيل وتثبيت تحديث Antigravity CLI في الخلفية');
                try {
                  const uRes = await window.mainV1Fetch('/api/system/update', { method: 'POST' });
                  const uData = await uRes.json();
                  if (uRes.ok && uData.status === 'unchanged') {
                    if (statusSpan) statusSpan.textContent = 'انتهى الأمر؛ نسخة CLI لم تتغير.';
                    announce('انتهى الأمر؛ نسخة CLI لم تتغير.');
                  } else if (uRes.ok && uData.status === 'ok') {
                    if (statusSpan) statusSpan.textContent = '✓ تم التحديث بنجاح! يرجى إعادة تشغيل الجلسة.';
                    announce('تم تحديث Antigravity CLI بنجاح');
                  } else {
                    if (statusSpan) statusSpan.textContent = 'الإصدار الحالي هو الأحدث، أو تعذر الاتصال بالسيرفر.';
                    announce(statusSpan.textContent);
                  }
                } catch (err) {
                  if (statusSpan) statusSpan.textContent = 'تعذر إجراء التحديث.';
                  announce('تعذر إجراء التحديث');
                } finally {
                  btnUpdate.disabled = false;
                }
              });
            }
          }, 0);

          return container;
        }

        return null;
      }

      setSyncStatus(status, text) {
        if (!this.syncBadge) return;
        this.syncBadge.className = `sync-badge sync-badge-${status}`;
        this.syncBadge.textContent = text;
      }

      async handleExternalSync() {
        window.mainV1.invalidateSettings();
        this.remoteGeneration++;
        this.remoteRequest = null;
        const refreshed = await this.fetchRemoteData();
        if (refreshed && this.dialog?.open) {
          const focused = document.activeElement;
          const focusedId = focused?.id;
          const textDraft = focused?.tagName === 'INPUT' && focused.type === 'text' ? focused.value : null;
          const selection = textDraft !== null ? [focused.selectionStart, focused.selectionEnd] : null;
          this.render();
          if (focusedId && document.activeElement === document.body) {
            const replacement = document.getElementById(focusedId);
            if (replacement && textDraft !== null) replacement.value = textDraft;
            replacement?.focus();
            if (replacement && selection) replacement.setSelectionRange(...selection);
          }
        }
      }

      async save(closeDialog = false) {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        if (this.saveRequest) {
          const saved = await this.saveRequest;
          if (!saved) return;
          if (this.dirtyFields.size) return this.save(closeDialog);
          if (closeDialog && this.dialog) this.dialog.close();
          return;
        }
        const writable = [
          'model', 'agent', 'effort', 'mode', 'sandbox', 'autopilot', 'safe_mode',
          'allowNonWorkspaceAccess', 'allow_commands', 'allow_write', 'allow_web',
          'allow_subagent', 'allow_schedule', 'tones_enabled', 'haptic_enabled',
          'speech_enabled', 'trustedWorkspaces', 'whitelist'
        ];
        const payload = JSON.parse(JSON.stringify(Object.fromEntries([...this.dirtyFields]
          .filter(key => writable.includes(key)).map(key => [key, this.state[key]]))));
        if (!Object.keys(payload).length) {
          this.setSyncStatus('saved', 'لا تغيير للحفظ');
          if (closeDialog && this.dialog) this.dialog.close();
          return;
        }
        this.setSyncStatus('syncing', 'Saving...');
        this.remoteGeneration++;
        const pending = (async () => {
          const res = await window.mainV1Fetch('/api/ai/settings', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload), settingsBaseline: this.baseline
          });
          const outcome = await res.json();
          const confirmed = outcome.savedFields || [];
          if (confirmed.length) this.remoteGeneration++;
          const accepted = outcome.settings ? this.normalizeSettings(outcome.settings) : {};
          confirmed.forEach(key => {
            this.initialState[key] = accepted[key];
            if (JSON.stringify(this.state[key]) === JSON.stringify(payload[key])) this.dirtyFields.delete(key);
          });
          if (outcome.baseline && confirmed.length) {
            this.baseline ||= {};
            if (outcome.baseline.revision) this.baseline.revision = outcome.baseline.revision;
            if (outcome.baseline.policyRevision) this.baseline.policyRevision = outcome.baseline.policyRevision;
            if (outcome.baseline.permissions) this.baseline.permissions = outcome.baseline.permissions;
          }
          if (!res.ok) throw new Error(res.status === 409 ? (confirmed.length ? 'حُفظ بعض التغييرات؛ تعارض الحفظ في الباقي؛ أعد تحميل الإعدادات لمراجعة تغييراتك' : 'تعارض الحفظ؛ أعد تحميل الإعدادات لمراجعة تغييراتك') :
            (confirmed.length ? 'حُفظ بعض التغييرات وبقي بعضها دون حفظ' : `تعذر الحفظ؛ رمز الخطأ ${res.status}`));
          this.setSyncStatus(this.dirtyFields.size ? 'idle' : 'saved', this.dirtyFields.size ? 'تغييرات لم تُحفظ' : '● Settings Applied');
          if (closeDialog && !this.dirtyFields.size) {
            if (typeof playSuccessChime === 'function') playSuccessChime();
            announce('Antigravity settings saved and applied successfully');
            if (this.dialog) this.dialog.close();
          }
          return true;
        })().catch(err => {
          console.error('Settings save failed:', err);
          this.setSyncStatus('idle', err.message);
          announce(err.message);
          return false;
        }).finally(() => { if (this.saveRequest === pending) this.saveRequest = null; });
        this.saveRequest = pending;
        return pending;
      }

      debouncedSave() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.save(false);
        }, 350);
      }

      bindEvents() {
        if (this.btnSave) {
          this.btnSave.addEventListener('click', () => this.save(true));
        }

        if (this.btnReset) {
          this.btnReset.addEventListener('click', async () => {
            if (this.saveRequest) await this.saveRequest;
            window.mainV1.invalidateSettings();
            this.remoteGeneration++;
            this.remoteRequest = null;
            const reloaded = await this.fetchRemoteData(true);
            this.render();
            announce(reloaded ? 'Settings reset to loaded state' : 'تعذر تحميل الإعدادات؛ بقيت تغييراتك دون مساس');
          });
        }

        const btnOpen = document.getElementById('btn-open-settings');
        if (btnOpen && this.dialog) {
          btnOpen.addEventListener('click', async () => {
            if (this.skeleton) this.skeleton.style.display = 'flex';
            if (this.fieldsContainer) this.fieldsContainer.style.display = 'none';
            this.dialog.showModal();
            await this.fetchRemoteData();
            this.render();
            announce('Opened Antigravity Dynamic Settings');
          });
        }

        if (this.btnClose && this.dialog) {
          this.btnClose.addEventListener('click', () => this.dialog.close());
        }
        if (this.btnCloseTop && this.dialog) {
          this.btnCloseTop.addEventListener('click', () => this.dialog.close());
        }

        this.syncPollInterval = setInterval(() => {
          if (document.visibilityState === 'visible' && (!this.dialog || !this.dialog.open)) {
            this.fetchRemoteData();
          }
        }, 30000);
      }
    }

    const dynamicSettingsEngine = new DynamicSettingsEngine();


    // ==========================================
    // SYSTEM USAGE & CONVERSATIONS CONTROLLER
    // ==========================================
    async function updateSystemUsage() {
      try {
        const res = await window.mainV1Fetch('/api/system/usage');
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
      conversationsListContainer.innerHTML = '<div class="main-style-176">جاري تحميل سجل المحادثات...</div>';
      try {
        const res = await window.mainV1Fetch('/api/ai/conversations');
        if (!res.ok) throw new Error('فشل جلب المحادثات');
        const data = await res.json();
        const convs = data.conversations || [];
        if (convs.length === 0) {
          conversationsListContainer.innerHTML = '<div class="main-style-176">لا توجد محادثات سابقة محفوظة.</div>';
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
                ${isCurrent ? '<span class="main-style-177">● المحادثة النشطة</span>' : ''}
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
        conversationsListContainer.innerHTML = `<div class="main-style-178">تعذر تحميل السجل: ${escapeHtml(err.message)}</div>`;
      }
    }

    async function resumeConversation(convId, convTitle) {
      announce('جاري استئناف المحادثة...');
      try {
        const res = await window.mainV1Fetch('/api/ai/conversation?id=' + encodeURIComponent(convId));
        if (!res.ok) throw new Error('فشل تحميل تفاصيل المحادثة');
        const data = await res.json();
        const messages = data.messages || [];

        currentActiveConversationId = convId;
        forceNewSession = false;
        loadArtifactsList();

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
                ${msg.time ? `<span class="msg-timestamp">${escapeHtml((String(msg.time).split('T')[1] || '').slice(0,5))}</span>` : ''}
              </header>
              ${thinkingHtml}
              <div class="msg-content markdown-body" dir="rtl">
                ${isUser ? escapeHtml(msg.text) : (renderMarkdown(msg.text) || '<p class="main-style-179">(لا يوجد نص إضافي في هذا الرد)</p>')}
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

        // Render Artifacts associated with this conversation
        knownArtifacts.clear();
        if (data.artifacts && data.artifacts.length > 0) {
          data.artifacts.forEach(art => knownArtifacts.set(art.name, art));
          updateArtifactsUI(data.artifacts.length);
          const artSection = document.createElement('div');
          artSection.className = 'chat-artifacts-section';
          artSection.setAttribute('role', 'region');
          artSection.setAttribute('aria-label', 'مستندات وخطط المحادثة (Artifacts)');
          artSection.style.cssText = 'margin:12px 0; display:flex; flex-direction:column; gap:8px;';
          data.artifacts.forEach(art => {
            artSection.appendChild(createArtifactCard(art));
          });
          aiChatFeed.appendChild(artSection);
        } else {
          updateArtifactsUI(0);
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
    // ANTIGRAVITY ARTIFACTS CONTROLLER
    // ==========================================
    function updateArtifactsUI(count) {
      const cnt = count !== undefined ? count : knownArtifacts.size;
      if (headerArtifactsBadge) headerArtifactsBadge.textContent = cnt;
      if (valArtifactsCountDrawer) valArtifactsCountDrawer.textContent = cnt;
      if (btnHeaderArtifacts) {
        btnHeaderArtifacts.style.display = cnt > 0 ? 'inline-flex' : 'none';
        btnHeaderArtifacts.setAttribute('aria-label', `عرض مستندات وخطط المحادثة (${cnt} مستند)`);
      }
    }

    async function openArtifactViewer(artName, artPath, artSummary, requestFeedback, artConversationId) {
      if (!artifactViewerDialog) return;
      artName = (artName || '').trim().replace(/^["']|["']$/g, '');
      artPath = (artPath || '').trim().replace(/^["']|["']$/g, '');
      artConversationId = (artConversationId || '').trim().replace(/^["']|["']$/g, '');
      currentViewerArtifact = {
        name: artName,
        path: artPath,
        summary: artSummary,
        requestFeedback: requestFeedback,
        conversation_id: artConversationId
      };
      if (artifactViewerTitle) artifactViewerTitle.textContent = `📄 ${artName}`;
      if (artifactViewerSummary) artifactViewerSummary.textContent = artSummary || '';
      if (artifactViewerContent) {
        artifactViewerContent.innerHTML = '<p>⏳ جاري تحميل محتوى المستند...</p>';
      }

      if (btnViewerProceed) {
        btnViewerProceed.style.display = requestFeedback ? 'inline-flex' : 'none';
      }

      artifactViewerDialog.showModal();
      announce(`تم فتح مستند: ${artName}`);

      const currentReqId = ++artifactViewerRequestId;
      try {
        const cid = artConversationId || currentActiveConversationId || '';
        const params = new URLSearchParams();
        if (artName) params.set('name', artName);
        if (cid) params.set('conversation_id', cid);
        if (artPath) params.set('path', artPath);
        const url = `/api/ai/artifacts/content?` + params.toString();
        const res = await (window.mainV1Fetch ? window.mainV1Fetch(url) : fetch(url));
        if (!res.ok) throw new Error(`رمز الخطأ ${res.status}`);
        const data = await res.json();
        if (currentReqId !== artifactViewerRequestId) return;
        if (!currentViewerArtifact || currentViewerArtifact.name !== artName) return;
        const rawContent = data.content || '';
        currentViewerArtifact.content = rawContent;
        if (artifactViewerContent) {
          artifactViewerContent.innerHTML = renderMarkdown(rawContent);
          setTimeout(() => {
            artifactViewerContent.focus();
          }, 50);
        }
      } catch (err) {
        if (currentReqId !== artifactViewerRequestId) return;
        if (artifactViewerContent) {
          artifactViewerContent.innerHTML = `<div style="color:var(--accent-red); padding:10px;">تعذر قراءة المستند: ${escapeHtml(err.message)}</div>`;
        }
      }
    }

    function createArtifactCard(art) {
      const card = document.createElement('div');
      card.className = 'artifact-card';
      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', `مستند: ${art.name}`);
      card.style.cssText = 'background:rgba(163, 113, 247, 0.08); border:2px solid var(--accent-purple); border-radius:10px; padding:14px; margin:12px 0;';

      const summaryText = art.summary || 'مستند تم إنشاؤه بواسطة الوكيل الذكي';
      const isFeedback = Boolean(art.requestFeedback);

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--accent-purple); font-size:1.05rem;">
            <span aria-hidden="true" style="font-size:1.3rem;">📄</span>
            <span>مستند / خطة: <strong class="artifact-name">${escapeHtml(art.name)}</strong></span>
          </div>
          <span class="badge" style="background:var(--accent-purple); color:#fff; border-radius:6px; padding:2px 8px; font-size:0.8rem;">وثيقة عمل (Artifact)</span>
        </div>
        <p class="artifact-summary" style="margin:6px 0 12px 0; color:var(--text-main); font-size:0.95rem; line-height:1.6; background:rgba(0,0,0,0.35); padding:10px 12px; border-radius:6px; border-right:4px solid var(--accent-purple);">
          ${escapeHtml(summaryText)}
        </p>
        <div class="artifact-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-view-art" aria-label="فتح وقراءة المستند ${escapeHtml(art.name)}" style="background:var(--accent-purple); color:#fff; font-weight:bold; border-radius:6px; padding:8px 14px; cursor:pointer;">
            📖 فتح وقراءة المستند
          </button>
          <button type="button" class="btn btn-sm btn-copy-art" aria-label="نسخ محتوى المستند ${escapeHtml(art.name)}" style="background:var(--bg-card); color:var(--text-main); border:1px solid var(--border-main); border-radius:6px; padding:8px 14px; cursor:pointer;">
            📋 نسخ المحتوى
          </button>
          ${isFeedback ? `
            <button type="button" class="btn btn-sm btn-proceed-art" aria-label="موافقة ومتابعة تنفيذ الخطة (Proceed)" style="background:var(--accent-green); color:#000; font-weight:bold; border-radius:6px; padding:8px 14px; cursor:pointer;">
              🚀 موافقة ومتابعة (Proceed)
            </button>
          ` : ''}
        </div>
      `;

      const btnView = card.querySelector('.btn-view-art');
      if (btnView) {
        btnView.addEventListener('click', () => {
          openArtifactViewer(art.name, art.path, art.summary, art.requestFeedback, art.conversation_id);
        });
      }

      const btnCopy = card.querySelector('.btn-copy-art');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          try {
            const cid = art.conversation_id || currentActiveConversationId || '';
            const params = new URLSearchParams();
            if (art.name) params.set('name', art.name);
            if (cid) params.set('conversation_id', cid);
            if (art.path) params.set('path', art.path);
            const res = await (window.mainV1Fetch ? window.mainV1Fetch(`/api/ai/artifacts/content?` + params.toString()) : fetch(`/api/ai/artifacts/content?` + params.toString()));
            if (!res.ok) throw new Error('فشل جلب النص');
            const data = await res.json();
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(data.content || '');
            }
            playBeep(880, 0.1);
            announce(`تم نسخ محتوى ${art.name} إلى الحافظة بنجاح`);
          } catch(err) {
            announce('تعذر نسخ المستند: ' + err.message);
          }
        });
      }

      const btnProceed = card.querySelector('.btn-proceed-art');
      if (btnProceed) {
        btnProceed.addEventListener('click', () => {
          playBeep(880, 0.1);
          announce('تمت الموافقة، جارٍ بدء تنفيذ الخطة وفقاً للتوثيق...');
          sendAiPrompt('موافق، تابع التنفيذ وفقاً للخطة الموضوعة.');
        });
      }

      return card;
    }

    async function loadArtifactsList() {
      if (!artifactsListContainer) return;
      artifactsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">جاري تحميل المستندات والخطط...</div>';
      try {
        const cid = currentActiveConversationId || '';
        const res = await (window.mainV1Fetch ? window.mainV1Fetch(`/api/ai/artifacts?conversation_id=${encodeURIComponent(cid)}`) : fetch(`/api/ai/artifacts?conversation_id=${encodeURIComponent(cid)}`));
        if (!res.ok) throw new Error('فشل جلب المستندات');
        const data = await res.json();
        const arts = data.artifacts || [];
        artifactsListContainer.innerHTML = '';
        if (arts.length === 0) {
          artifactsListContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد مستندات أو خطط منشأة في هذه المحادثة حتى الآن.</div>';
          updateArtifactsUI(0);
          return;
        }
        updateArtifactsUI(arts.length);
        arts.forEach(art => {
          knownArtifacts.set(art.name, art);
          const item = document.createElement('div');
          item.className = 'conversation-item';
          item.setAttribute('role', 'listitem');
          item.style.cssText = 'padding:12px; border:1px solid var(--border-main); border-radius:8px; background:var(--bg-card); display:flex; flex-direction:column; gap:8px;';
          const sizeKb = art.size ? (art.size / 1024).toFixed(1) + ' KB' : '';
          item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:var(--accent-purple); font-size:1rem;">📄 ${escapeHtml(art.name)}</strong>
              <span style="font-size:0.8rem; color:var(--text-muted);">${sizeKb}</span>
            </div>
            <p style="margin:0; font-size:0.9rem; color:var(--text-main); line-height:1.5;">${escapeHtml(art.summary || 'بدون ملخص')}</p>
            <div style="display:flex; gap:8px; margin-top:4px;">
              <button type="button" class="btn btn-sm btn-art-list-view" aria-label="عرض ${escapeHtml(art.name)}" style="background:var(--accent-purple); color:#fff; font-size:0.88rem; padding:6px 12px; border-radius:6px; cursor:pointer;">
                عرض المستند
              </button>
            </div>
          `;
          const vBtn = item.querySelector('.btn-art-list-view');
          if (vBtn) {
            vBtn.addEventListener('click', () => {
              if (artifactsDialog) artifactsDialog.close();
              openArtifactViewer(art.name, art.path, art.summary, art.requestFeedback, art.conversation_id);
            });
          }
          artifactsListContainer.appendChild(item);
        });
      } catch (err) {
        artifactsListContainer.innerHTML = `<div style="color:var(--accent-red); padding:12px;">تعذر تحميل المستندات: ${escapeHtml(err.message)}</div>`;
      }
    }

    if (btnHeaderArtifacts && artifactsDialog) {
      btnHeaderArtifacts.addEventListener('click', async () => {
        artifactsDialog.showModal();
        announce('تم فتح نافذة مستندات وخطط المحادثة');
        await loadArtifactsList();
      });
    }
    if (btnOpenArtifactsDrawer && artifactsDialog) {
      btnOpenArtifactsDrawer.addEventListener('click', async () => {
        const drawer = document.getElementById('antigravity-drawer');
        if (drawer && drawer.close) drawer.close();
        artifactsDialog.showModal();
        announce('تم فتح نافذة مستندات وخطط المحادثة');
        await loadArtifactsList();
      });
    }
    if (btnCloseArtifacts && artifactsDialog) {
      btnCloseArtifacts.addEventListener('click', () => artifactsDialog.close());
    }
    if (btnCloseArtifactsTop && artifactsDialog) {
      btnCloseArtifactsTop.addEventListener('click', () => artifactsDialog.close());
    }
    if (btnCloseViewer && artifactViewerDialog) {
      btnCloseViewer.addEventListener('click', () => artifactViewerDialog.close());
    }
    if (btnCloseViewerTop && artifactViewerDialog) {
      btnCloseViewerTop.addEventListener('click', () => artifactViewerDialog.close());
    }
    if (btnCopyArtifactContent) {
      btnCopyArtifactContent.addEventListener('click', async () => {
        if (!currentViewerArtifact || !currentViewerArtifact.content) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(currentViewerArtifact.content);
          }
          playBeep(880, 0.1);
          announce('تم نسخ نص المستند كاملاً إلى الحافظة');
        } catch(err) {
          announce('تعذر النسخ: ' + err.message);
        }
      });
    }
    if (btnViewerProceed) {
      btnViewerProceed.addEventListener('click', () => {
        if (artifactViewerDialog) artifactViewerDialog.close();
        playBeep(880, 0.1);
        announce('تمت الموافقة، جارٍ بدء تنفيذ الخطة وفقاً للتوثيق...');
        sendAiPrompt('موافق، تابع التنفيذ وفقاً للخطة الموضوعة.');
      });
    }
    if (btnDownloadArtifact) {
      btnDownloadArtifact.addEventListener('click', () => {
        if (!currentViewerArtifact || !currentViewerArtifact.content) return;
        try {
          const blob = new Blob([currentViewerArtifact.content], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = currentViewerArtifact.name || 'artifact.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          playBeep(880, 0.1);
          announce('تم بدء تنزيل المستند');
        } catch(e) {
          announce('تعذر تنزيل المستند: ' + e.message);
        }
      });
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
        quotaCardsContainer.innerHTML = '<div class="main-style-176">جاري الاتصال بمحرك Antigravity لجلب الحصص الحية...</div>';
      }
      try {
        if (force) announce('جاري الاتصال المباشر بمحرك Antigravity لجلب الحصص، يرجى الانتظار ثوانٍ...');
        const res = await window.mainV1Fetch('/api/ai/quota' + (force ? '?refresh=1' : ''));
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
          quotaCardsContainer.innerHTML = '<div class="main-style-176">لا تتوفر معلومات الحصص حالياً. اضغط على تحديث فوري.</div>';
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
        const res = await window.mainV1Fetch('/api/auth/status');
        const data = await res.json();
        const auth = data.auth || {};
        const wizard = data.wizard || {};

        if (auth.authenticated === null) {
          if (headerAuthBadge) headerAuthBadge.textContent = 'الحساب لدى agy';
          if (drawerAuthBadge) drawerAuthBadge.textContent = 'حالة الحساب غير متاحة آليًا';
          if (btnHeaderAuth) btnHeaderAuth.setAttribute('aria-label', 'إدارة حساب agy في الطرفية الأصلية');
        } else if (auth.logged_in && auth.is_valid) {
          const emailDisplay = auth.email ? auth.email.split('@')[0] : 'متصل';
          try {
            if (auth.email) localStorage.setItem('antigravity_user_email', auth.email);
          } catch(e){}
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
          try {
            localStorage.removeItem('antigravity_user_email');
          } catch(e){}
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
      if (auth.authenticated === null) {
        authCardBadge.textContent = 'الحساب لدى agy';
        authCardDesc.textContent = wizard.message || 'أتمّ إدارة الحساب في طرفية agy؛ حالته غير متاحة آليًا.';
        if (authStepIdle) authStepIdle.style.display = 'block';
        return;
      }

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

      if (auth.authenticated === null) {
          if (headerAuthBadge) headerAuthBadge.textContent = 'الحساب لدى agy';
          if (drawerAuthBadge) drawerAuthBadge.textContent = 'حالة الحساب غير متاحة آليًا';
          if (btnHeaderAuth) btnHeaderAuth.setAttribute('aria-label', 'إدارة حساب agy في الطرفية الأصلية');
        } else if (auth.logged_in && auth.is_valid) {
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
        window.mainV1Fetch('/api/auth/open_browser', {
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
          const response = await window.mainV1Fetch('/api/auth/start', { method: 'POST' });
          const handoff = await response.json();
          announce(handoff.message || handoff.error);
          if (authLoadingText) authLoadingText.textContent = handoff.message || handoff.error;
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
          await window.mainV1Fetch('/api/auth/input', {
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
          await window.mainV1Fetch('/api/auth/accept_terms', {
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
          await window.mainV1Fetch('/api/auth/accept_terms', {
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
          await window.mainV1Fetch('/api/auth/cancel', { method: 'POST' });
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
          const res = await window.mainV1Fetch('/api/auth/logout', { method: 'POST' });
          const data = await res.json();
          announce(data.message || data.error || 'لم تتأكد نتيجة الخروج.');
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
      skillsListContainer.innerHTML = '<div class="main-style-176">جاري فحص المهارات...</div>';
      try {
        const res = await window.mainV1Fetch('/api/skills/list');
        const data = await res.json();
        const skills = data.skills || [];
        if (skills.length === 0) {
          skillsListContainer.innerHTML = '<div class="main-style-176">لا توجد مهارات مثبتة في ~/.gemini/skills</div>';
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
            <div class="main-style-191">
              <strong class="main-style-192">${escapeHtml(skill.name)}</strong>
              <span class="${(skill.enabled) ? "main-style-193" : "main-style-194"}">
                ${skill.enabled ? '🟢 مفعلة' : '⚪ معطلة'}
              </span>
            </div>
            <p class="main-style-195">
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
              const toggleRes = await window.mainV1Fetch('/api/skills/toggle', {
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
        skillsListContainer.innerHTML = '<div class="main-style-196">تعذر تحميل قائمة المهارات: ' + escapeHtml(e.message || 'خطأ غير معروف') + '</div>';
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
      pluginsListContainer.innerHTML = '<div class="main-style-176">جاري فحص الإضافات...</div>';
      try {
        const res = await window.mainV1Fetch('/api/plugins/list');
        const data = await res.json();
        const plugins = data.plugins || [];
        if (valPluginsCountDrawer) valPluginsCountDrawer.textContent = String(plugins.length);
        if (plugins.length === 0) {
          pluginsListContainer.innerHTML = '<div class="main-style-176">لا توجد إضافات مثبتة في ~/.gemini/config/plugins</div>';
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
              const toggleRes = await window.mainV1Fetch('/api/plugins/toggle', {
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
        pluginsListContainer.innerHTML = '<div class="main-style-196">تعذر تحميل قائمة الإضافات</div>';
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
    // MCP (MODEL CONTEXT PROTOCOL) CONTROLLER
    // ==========================================
    async function loadMcpServers() {
      if (!mcpInstalledContainer || !mcpCatalogContainer) return;
      mcpInstalledContainer.innerHTML = '<div class="main-style-197">جاري فحص بروتوكولات MCP...</div>';
      mcpCatalogContainer.innerHTML = '<div class="main-style-197">جاري فحص الكتالوج المعتمد...</div>';

      try {
        const res = await window.mainV1Fetch('/api/mcp/list');
        if (!res.ok) throw new Error('فشل جلب قائمة بروتوكولات MCP');
        const data = await res.json();
        const installed = data.installed || [];
        const catalog = data.catalog || [];

        const installedMap = {};
        installed.forEach(s => { installedMap[s.name] = s; });

        // 1. Render Installed MCP Servers
        if (installed.length === 0) {
          mcpInstalledContainer.innerHTML = '<div class="main-style-198">لا توجد بروتوكولات MCP مثبتة حالياً. يمكنك التثبيت من الكتالوج المعتمد أدناه بنقرة واحدة.</div>';
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
              <div class="main-style-199">
                <strong class="main-style-200">${escapeHtml(srv.name)}</strong>
                <span class="${(srv.enabled) ? "main-style-201" : "main-style-202"}">
                  ${srv.enabled ? '🟢 مفعل (enabled)' : '⚪ معطل (disabled)'}
                </span>
                <span class="main-style-203">
                  ${escapeHtml(srv.type || 'stdio')}
                </span>
                <span class="${(hasAuth) ? "main-style-204" : "main-style-205"}">
                  ${hasAuth ? '🔑 موثق' : 'غير موثق'}
                </span>
              </div>
              <div class="main-style-206">
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
              <div class="main-style-207">
                <div class="main-style-208">
                  <span aria-hidden="true" class="main-style-209">${item.icon || '🔌'}</span>
                  <strong class="main-style-210">${escapeHtml(item.name)}</strong>
                  <code class="main-style-211">${escapeHtml(item.id)}</code>
                </div>
                <span class="main-style-212">
                  ${escapeHtml(item.category || 'MCP')}
                </span>
              </div>
              <p class="main-style-213">
                ${escapeHtml(item.description)}
              </p>
              <div class="main-style-214">
                ${escapeHtml(item.command)}
              </div>
            </div>
          `;

          const actionRow = document.createElement('div');
          actionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:4px;';

          if (isInstalled) {
            actionRow.innerHTML = `
              <span class="main-style-215">
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
        mcpInstalledContainer.innerHTML = '<div class="main-style-196">تعذر تحميل الخوادم: ' + escapeHtml(err.message) + '</div>';
        mcpCatalogContainer.innerHTML = '<div class="main-style-196">تعذر تحميل الكتالوج</div>';
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
        const res = await window.mainV1Fetch('/api/mcp/install', {
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
          return true;
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
      return false;
    }

    async function toggleMcpServer(name, nextState, triggerBtn) {
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '⏳ جاري...';
      }
      playBeep(700, 0.06);

      try {
        const res = await window.mainV1Fetch('/api/mcp/toggle', {
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
        const res = await window.mainV1Fetch('/api/mcp/remove', {
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

        let args;
      try { args = JSON.parse(document.getElementById('mcp-custom-args').value); }
      catch (error) { announce('وسائط MCP تحتاج قائمة JSON صحيحة.'); return; }
      if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) { announce('وسائط MCP تحتاج قائمة نصوص.'); return; }
      const envList = envRaw ? envRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

        const installed = await installMcpServer({
          name: name,
          type: type,
          command: command,
          args: args,
          env: envList
        }, btnSubmitCustomMcp, name);
        if (btnSubmitCustomMcp) {
          btnSubmitCustomMcp.disabled = false;
          btnSubmitCustomMcp.textContent = '➕ تثبيت البروتوكول المخصص';
        }
        if (!installed) return;

        if (mcpCustomName) mcpCustomName.value = '';
        if (mcpCustomCommand) mcpCustomCommand.value = '';
        if (mcpCustomEnv) mcpCustomEnv.value = '';
        if (mcpCustomArgs) mcpCustomArgs.value = '[]';
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

    async function openMcpAuthModal(serverOrItem) {
      if (!mcpAuthDialog) return;
      currentAuthServer = serverOrItem;
      currentDeviceSession = null;
      const name = serverOrItem.name || serverOrItem.id;
      mcpAuthTargetName.textContent = name;
      mcpAuthTargetDesc.textContent = 'المصادقة في طرفية agy؛ لا تجمع الواجهة رموز الحساب. إعداد OAuth يطبق عند إعادة تحميل CLI.';
      mcpModeToken.disabled = true;
      mcpModeDevice.disabled = true;
      mcpModeDevice.checked = true;
      mcpAuthTabToken.style.display = 'none';
      mcpAuthTabDevice.style.display = 'flex';
      if (mcpDeviceDetailsBox) mcpDeviceDetailsBox.style.display = 'none';
      if (mcpAuthDeviceCodeInput) mcpAuthDeviceCodeInput.disabled = true;
      btnSaveMcpAuth.disabled = true;
      btnRequestDeviceCode.textContent = 'إتمام المصادقة في طرفية agy';
      btnRequestDeviceCode.setAttribute('aria-label', 'إتمام مصادقة MCP في طرفية agy');
      document.getElementById('mcp-oauth-editor')?.remove();
      const editor = document.createElement('fieldset');
      editor.id = 'mcp-oauth-editor';
      const legend = document.createElement('legend'); legend.textContent = 'إعداد عميل OAuth'; editor.append(legend);
      const fields = {};
      for (const [key, label, type] of [['client_id', 'Client ID الجديد (الفارغ يحفظ الموجود)', 'text'],
        ['client_secret', 'Client Secret الجديد (الفارغ يحفظ الموجود)', 'password'],
        ['clear_client_secret', 'محو السر المحفوظ صراحةً', 'checkbox']]) {
        const input = document.createElement('input'); input.type = type; input.id = 'oauth-' + key;
        input.autocomplete = 'off';
        const caption = document.createElement('label'); caption.htmlFor = input.id; caption.textContent = label;
        editor.append(caption, input); fields[key] = input;
      }
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'حفظ إعداد OAuth'; save.disabled = true; editor.append(save);
      mcpAuthTabDevice.append(editor);
      mcpAuthDialog.showModal(); btnRequestDeviceCode.focus();
      let revision;
      const response = await window.mainV1Fetch('/api/mcp/oauth?name=' + encodeURIComponent(name));
      if (!response.ok) { setMcpAuthStatus((await response.json()).error, 'error'); return; }
      const ownership = await response.json(); revision = ownership.revision;
      save.disabled = false;
      setMcpAuthStatus('المالك: ' + ownership.scope + '. السر محفوظ: ' + (ownership.has_client_secret ? 'نعم' : 'لا'), 'info');
      save.addEventListener('click', async () => {
        const oauth = {};
        for (const key of ['client_id', 'client_secret']) if (fields[key].value) oauth[key] = fields[key].value;
        if (fields.clear_client_secret.checked) oauth.clear_client_secret = true;
        const written = await window.mainV1Fetch('/api/mcp/oauth', {method: 'PATCH', body: JSON.stringify({name, revision, oauth})});
        const outcome = await written.json();
        if (!written.ok) { setMcpAuthStatus(outcome.error, 'error'); return; }
        revision = outcome.revision;
        fields.client_secret.value = ''; fields.clear_client_secret.checked = false;
        setMcpAuthStatus('حُفظ إعداد OAuth في نطاق مالكه؛ لا يثبت ذلك مصادقة الحساب.', 'info');
      });
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
          const res = await window.mainV1Fetch('/api/mcp/auth/request_device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: currentAuthServer.name || currentAuthServer.id,
              url: currentAuthServer.url || ''
            })
          });
          const data = await res.json();
          btnRequestDeviceCode.disabled = false;
          btnRequestDeviceCode.textContent = 'إتمام المصادقة في طرفية agy';

          if (res.ok && data.status === 'pending') { setMcpAuthStatus(data.message, 'info'); return; }
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
          btnRequestDeviceCode.textContent = 'إتمام المصادقة في طرفية agy';
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
          const res = await window.mainV1Fetch('/api/mcp/auth/test', {
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

          const res = await window.mainV1Fetch('/api/mcp/auth/pair', {
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
        subagentsTeamContainer.innerHTML = '<div class="main-style-106">لم يتم استدعاء وكلاء فرعيين في هذه الجلسة بعد. عند إطلاق أي وكيل فرعي ستظهر تفاصيله ومهامه هنا فوراً.</div>';
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
          <div class="main-style-180">
            <div class="main-style-216">
              <div class="main-style-10">
                <span aria-hidden="true" class="main-style-217">🤖</span>
                <span class="main-style-218">${escapeHtml(agent.role)}</span>
                <span class="main-style-219">${escapeHtml(agent.type)}</span>
              </div>
              <span class="${(agent.state.includes('نشط')) && (agent.state.includes('نشط')) ? "main-style-220" : (agent.state.includes('نشط')) && !(agent.state.includes('نشط')) ? "main-style-221" : !(agent.state.includes('نشط')) && (agent.state.includes('نشط')) ? "main-style-222" : "main-style-223"}">
                ${agent.state.includes('نشط') ? '🟢 ' + agent.state : '✅ ' + agent.state}
              </span>
            </div>

            <div class="main-style-224">
              <div class="main-style-225">🎯 المهمة المسندة (Prompt):</div>
              <div class="main-style-226">
                ${escapeHtml(agent.prompt)}
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
              <button type="button" class="btn btn-sm btn-focus-agent main-style-232" data-agent-role="${escapeHtml(agent.role)}" aria-label="توجيه المحادثة مباشرة إلى ${escapeHtml(agent.role)}">
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
      try {
        localStorage.setItem('antigravity_active_model', displayName);
        localStorage.setItem('antigravity_active_model_id', modelName);
      } catch(e){}
    }
    window.syncActiveModelDisplay = syncActiveModelDisplay;
    try {
      const initialModel = localStorage.getItem('antigravity_active_model_id') || localStorage.getItem('antigravity_active_model') || 'gemini-3.8-flash-medium';
      syncActiveModelDisplay(initialModel);
      const u = localStorage.getItem('antigravity_user_email');
      if (u) {
        const hA = document.getElementById('header-auth-badge');
        const dA = document.getElementById('drawer-auth-badge');
        if (hA) hA.textContent = '👤 ' + u.split('@')[0];
        if (dA) { dA.textContent = 'متصل (' + u + ')'; dA.style.color = '#10b981'; }
      }
    } catch(e){}

    function syncReasoningEffortDisplay(effort) {
      if (!effort) return;
      document.querySelectorAll('.btn-effort').forEach(b => {
        const isActive = b.getAttribute('data-effort') === effort;
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
        const res = await window.mainV1Fetch('/api/ai/tasks');
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

      // Instant Cache-First Render
      const currentActive = window._currentActiveModel || localStorage.getItem('antigravity_active_model_id') || 'gemini-3.8-flash-medium';
      if (Array.isArray(window._cachedModels) && window._cachedModels.length > 0) {
        renderModelPickerItems(window._cachedModels, currentActive);
      } else if (modelPickerList) {
        modelPickerList.innerHTML = '<div class="main-style-234">⏳ جارٍ جلب النماذج المتاحة...</div>';
      }

      try {
        const [modelsRes, settingsRes] = await Promise.all([
          window.mainV1Fetch('/api/ai/models'),
          window.mainV1Fetch('/api/ai/settings')
        ]);
        const models = modelsRes.ok ? await modelsRes.json() : (window._cachedModels || []);
        if (Array.isArray(models) && models.length > 0) window._cachedModels = models;
        const currentSettings = settingsRes.ok ? await settingsRes.json() : {};
        const activeModel = currentSettings.model || currentActive;
        renderModelPickerItems(window._cachedModels, activeModel);
      } catch (err) {
        if (!window._cachedModels || window._cachedModels.length === 0) {
          if (modelPickerList) {
            modelPickerList.innerHTML = '<div class="main-style-235">تعذر جلب النماذج الحية. تأكد من اتصال السيرفر.</div>';
          }
          announce('تعذر تحميل النماذج من السيرفر');
        }
      }
    }
    window.openModelPicker = openModelPicker;

    function renderModelPickerItems(models, activeModel) {
      if (!modelPickerList) return;
      if (!Array.isArray(models) || models.length === 0) {
        modelPickerList.innerHTML = '<p class="main-style-236">لم يتم العثور على نماذج متاحة حالياً.</p>';
        return;
      }
      const activeEl = document.activeElement;
      const focusedModelId = activeEl ? activeEl.getAttribute('data-model-id') : null;
      const isInitialOpen = (modelPickerList.children.length === 0);

      modelPickerList.innerHTML = '';
      models.forEach((m) => {
        const isCurrent = (m.id === activeModel || m.name === activeModel);
        const card = document.createElement('button');
        card.type = 'button';
        card.setAttribute('data-model-id', m.id || m.name);
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
          <div class="main-style-237">
            <strong class="${(isCurrent) ? "main-style-238" : "main-style-239"}">${escapeHtml(m.name)}</strong>
            <span class="badge ${(isCurrent) && (isCurrent) ? "main-style-240" : (isCurrent) && !(isCurrent) ? "main-style-241" : !(isCurrent) && (isCurrent) ? "main-style-242" : "main-style-243"}">
              ${isCurrent ? '✓ مفعل' : 'تفعيل'}
            </span>
          </div>
          <div class="main-style-244">${escapeHtml(m.id)}</div>
        `;
        card.addEventListener('click', async () => {
          await switchActiveModelDirectly(m.id || m.name, m.name);
        });
        modelPickerList.appendChild(card);
      });

      if (isInitialOpen) {
        const first = modelPickerList.querySelector('.model-picker-item');
        if (first) setTimeout(() => first.focus(), 50);
      } else if (focusedModelId) {
        const target = modelPickerList.querySelector(`[data-model-id="${focusedModelId}"]`);
        if (target) target.focus();
      }
    }

    async function switchActiveModelDirectly(modelId, modelName) {
      try {
        const label = modelName || modelId;
        announce(`جارٍ تفعيل نموذج ${label}...`);
        const res = await window.mainV1Fetch('/api/ai/settings', {
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

    let currentUpdateAvailable = false;
    let lastAnnouncedProgressMilestone = 0;

    async function openUpdateDialog() {
      if (!updateDialog) return;
      if (drawerEl && drawerEl.classList.contains('open')) {
        toggleAppDrawer(false);
      }
      updateDialog.showModal();
      announce('تم فتح نافذة تحديث التطبيق');

      const currentVer = (window.AntigravityBridge && typeof window.AntigravityBridge.getAppVersion === 'function')
        ? await window.AntigravityBridge.getAppVersion()
        : 'غير متاح';
      if (updateCurrentVersion) {
        updateCurrentVersion.textContent = currentVer;
      }

      checkAndShowInstallPermissionWarning();
      triggerUpdateCheck();
    }
    window.openUpdateDialog = openUpdateDialog;

    async function checkAndShowInstallPermissionWarning() {
      if (!updatePermissionBox) return;
      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        const canInstall = await window.AntigravityBridge.canInstallUnknownApps();
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
        window.onUpdateCheckError({error: 'فحص إصدار Android متاح داخل التطبيق فقط.'});
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
        currentUpdateAvailable = info.hasUpdate === true;

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

    async function startDownloadingUpdate() {
      if (!currentUpdateAvailable) {
        announce('لم يُتحقق من وجود حزمة ترقية.');
        return;
      }

      if (window.AntigravityBridge && typeof window.AntigravityBridge.canInstallUnknownApps === 'function') {
        if (!await window.AntigravityBridge.canInstallUnknownApps()) {
          checkAndShowInstallPermissionWarning();
          announce('يرجى السماح بتثبيت التطبيقات من الإعدادات قبل التثبيت');
          return;
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
        window.AntigravityBridge.startUpdateDownload();
      } else {
        window.onUpdateCheckError({error: 'تنزيل حزمة Android متاح داخل التطبيق فقط.'});
        if (updateProgressContainer) updateProgressContainer.style.display = 'none';
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
          window.AntigravityBridge.openInstallPermissionSettings().catch(error => announce(error.message));
          announce('فتح إعدادات تثبيت التطبيقات');
        }
      });
    }

    let isSyncingConversation = false;
    let lastSyncedMessageCount = -1;

    async function syncActiveConversationMessages() {
      if (!currentActiveConversationId || isAiGenerating || isSyncingConversation || forceNewSession) return;
      isSyncingConversation = true;
      try {
        const res = await window.mainV1Fetch('/api/ai/conversation?id=' + encodeURIComponent(currentActiveConversationId));
        if (!res.ok) return;
        const data = await res.json();
        const allMessages = data.messages || [];

        // Live sync artifacts in background polling
        let hasNewArt = false;
        if (data.artifacts && Array.isArray(data.artifacts)) {
          data.artifacts.forEach(art => {
            if (!knownArtifacts.has(art.name)) {
              knownArtifacts.set(art.name, art);
              hasNewArt = true;
            }
          });
          updateArtifactsUI(knownArtifacts.size);
          if (hasNewArt) {
            let sec = aiChatFeed.querySelector('.chat-artifacts-section');
            if (!sec) {
              sec = document.createElement('div');
              sec.className = 'chat-artifacts-section';
              sec.setAttribute('role', 'region');
              sec.setAttribute('aria-label', 'مستندات وخطط المحادثة (Artifacts)');
              sec.style.cssText = 'margin:12px 0; display:flex; flex-direction:column; gap:8px;';
              aiChatFeed.appendChild(sec);
            }
            data.artifacts.forEach(art => {
              if (!sec.querySelector(`[aria-label="مستند: ${art.name}"]`)) {
                sec.appendChild(createArtifactCard(art));
              }
            });
          }
        }

        if (allMessages.length === lastSyncedMessageCount && !hasNewArt) {
          return;
        }
        lastSyncedMessageCount = allMessages.length;

        const textAgentMsgs = allMessages.filter(m => m.role === 'agent' && ((m.text && m.text.trim()) || m.thinking));
        if (textAgentMsgs.length === 0) return;

        // Pair the last live feed card with its ID from server if it hasn't been tagged yet
        const lastFeedCard = aiChatFeed.querySelector('.chat-message.ai-message:last-child');
        if (lastFeedCard) {
          const lastMsg = textAgentMsgs[textAgentMsgs.length - 1];
          if (lastMsg && lastMsg.id) {
            lastFeedCard.setAttribute('data-msg-id', lastMsg.id);
            if (lastMsg.time) lastFeedCard.setAttribute('data-msg-time', lastMsg.time);
          }
          if (lastMsg && lastMsg.thinking && !lastFeedCard.querySelector('.thinking-accordion')) {
            const tAccordion = document.createElement('div');
            tAccordion.className = 'thinking-accordion';
            tAccordion.setAttribute('role', 'region');
            tAccordion.setAttribute('aria-label', 'تحليل وتفكير الوكيل الداخلي');
            tAccordion.innerHTML = `
              <button type="button" class="thinking-header" aria-expanded="false" aria-label="تفكير واستدلال الوكيل (مغلق، اضغط للعرض)">
                <div class="thinking-title-wrapper">
                  <span aria-hidden="true">🧠</span>
                  <span>تفكير واستدلال الوكيل</span>
                  <span class="thinking-badge">${lastMsg.thinking.length} حرف</span>
                </div>
                <span class="thinking-toggle-icon" aria-hidden="true">▼</span>
              </button>
              <div class="thinking-body" hidden dir="auto">${renderMarkdown(lastMsg.thinking)}</div>
              <div class="thinking-footer" hidden>
                <button type="button" class="btn-close-thinking" aria-label="إغلاق صندوق التفكير">✕ إغلاق صندوق التفكير (Esc)</button>
              </div>
            `;
            const header = lastFeedCard.querySelector('.msg-header');
            if (header && header.nextSibling) {
              lastFeedCard.insertBefore(tAccordion, header.nextSibling);
            } else {
              lastFeedCard.appendChild(tAccordion);
            }
            const tHeader = tAccordion.querySelector('.thinking-header');
            const tBody = tAccordion.querySelector('.thinking-body');
            const tFooter = tAccordion.querySelector('.thinking-footer');
            const tClose = tAccordion.querySelector('.btn-close-thinking');
            const tIcon = tAccordion.querySelector('.thinking-toggle-icon');
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
            tHeader.addEventListener('click', () => doToggle());
            tHeader.addEventListener('keydown', (e) => { if (e.key === 'Escape') doToggle(false); });
            if (tClose) tClose.addEventListener('click', () => doToggle(false));
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
            const cleanAnnounce = latestAgentMsg.text.replace(/[*#_\`]/g, '').trim().slice(0, 150);
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

    async function refreshTasksMonitor() {
      if (!tasksMonitorList) return;
      tasksMonitorList.innerHTML = '<div class="main-style-234">⏳ جارٍ فحص المهام والمؤقتات النشطة...</div>';
      try {
        const res = await window.mainV1Fetch('/api/ai/tasks');
        if (res.ok) {
          const data = await res.json();
          const tasks = data.tasks || [];
          const activeCount = typeof data.active_count === 'number' ? data.active_count : tasks.filter(t => t.status === 'active').length;
          renderTasksList(tasks);
          if (valTasksCountDrawer) {
            valTasksCountDrawer.textContent = activeCount;
          }
        } else {
          tasksMonitorList.innerHTML = '<p class="main-style-245">تعذر جلب المهام من السيرفر</p>';
        }
      } catch (err) {
        tasksMonitorList.innerHTML = '<p class="main-style-245">خطأ في الاتصال بالخادم</p>';
      }
    }

    function renderTasksList(tasks) {
      if (!tasksMonitorList) return;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        tasksMonitorList.innerHTML = `
          <div class="main-style-246">
            <p class="main-style-247">لا توجد مؤقتات أو مهام مجدولة تعمل في الخلفية حالياً</p>
            <span class="main-style-248">يعرض هذا الموضع الأدوار المملوكة والرسائل التالية المحفوظة محليًا.</span>
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
        const isCancelled = ['cancelled', 'failed', 'interrupted'].includes(t.status);
        const isActive = !isCompleted && !isCancelled;

        let statusBadge = '';
        if (isActive) {
          const remText = typeof t.remaining_seconds === 'number' ? `باقي: ${t.remaining_seconds}ث` : 'نشطة';
          statusBadge = `<span class="badge main-style-249">⏳ قيد التشغيل (${escapeHtml(remText)})</span>`;
        } else if (isCompleted) {
          statusBadge = `<span class="badge main-style-250">✓ مكتملة</span>`;
        } else {
          statusBadge = `<span class="badge main-style-251">✕ تم الإلغاء</span>`;
        }

        const actionBtnHtml = isActive && t.cancellable !== false
          ? `<button type="button" class="btn btn-sm btn-danger btn-kill-task" data-task-id="${escapeHtml(t.id)}" aria-label="إلغاء المهمة ${escapeHtml(t.id)}">🛑 إلغاء</button>`
          : `<span>${escapeHtml(t.state || t.status)}</span>`;

        item.innerHTML = `
          <div class="main-style-253">
            <div class="main-style-10">
              <strong class="main-style-254">${escapeHtml(t.id || 'Task')}</strong>
              ${statusBadge}
            </div>
            <div class="main-style-75">${escapeHtml(t.prompt || t.description || 'مهمة في الخلفية')}</div>
            <div class="main-style-255">${t.cron ? 'Cron: ' + escapeHtml(t.cron) : (t.duration ? 'المدة: ' + t.duration + ' ثانية' : '')}</div>
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
        const res = await window.mainV1Fetch('/api/ai/tasks/manage', {
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
        const effort = btn.getAttribute('data-effort');
        if (!effort) return;
        try {
          announce(`جارٍ ضبط مستوى التفكير على ${effort}...`);
          const res = await window.mainV1Fetch('/api/ai/settings', {
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

    const btnHeaderDashboard = document.getElementById('btn-header-dashboard');
    if (btnHeaderDashboard) {
      btnHeaderDashboard.addEventListener('click', () => {
        if (window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
          window.AntigravityBridge.loadDashboardUrl();
        } else {
          window.location.href = '/start';
        }
      });
    }

    const btnOpenDashboard = document.getElementById('btn-open-dashboard');
    if (btnOpenDashboard) {
      btnOpenDashboard.addEventListener('click', () => {
        toggleAppDrawer(false);
        if (window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
          window.AntigravityBridge.loadDashboardUrl();
        } else {
          window.location.href = '/start';
        }
      });
    }

    const btnStopServer = document.getElementById('btn-stop-server');
    if (btnStopServer) {
      btnStopServer.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من إيقاف خادم تيرمكس نهائياً؟ ستنتقل إلى شاشة البدء.')) {
          toggleAppDrawer(false);
          announce('جاري إيقاف خادم تيرمكس نهائياً...');
          const stopped = await window.mainV1Fetch('/api/shutdown', {method: 'POST'});
          if (!stopped.ok) { announce((await stopped.json()).error); return; }
          setTimeout(() => {
            if (window.AntigravityBridge && typeof window.AntigravityBridge.loadDashboardUrl === 'function') {
              window.AntigravityBridge.loadDashboardUrl();
            } else {
              window.location.href = '/start';
            }
          }, 450);
        }
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


    if (typeof dynamicSettingsEngine !== 'undefined' && dynamicSettingsEngine.fetchRemoteData) {
      dynamicSettingsEngine.fetchRemoteData();
    }
    updateSystemUsage();
    setInterval(updateSystemUsage, 25000);

    // Live Screen Visibility Sync: tells server if user is viewing this screen
    function reportVisibility(vis) {
      try {
        window.mainV1Fetch('/api/client/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visible: !!vis })
        }).catch(() => {});
      } catch(e) {}
    }

    let isAppExplicitlyMinimized = false;

    window.addEventListener('companion-native-visibility', event => window.setAppVisibility(event.detail?.visible === true));

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

    // Keep server informed while screen is open & periodically poll tasks and conversation with adaptive backoff
    let pollCycleCounter = 0;
    setInterval(async () => {
      if (isAppExplicitlyMinimized || document.hidden || document.visibilityState !== 'visible') return;
      reportVisibility(true);
      pollCycleCounter++;

      const isTasksOpen = Boolean(tasksMonitorDialog && tasksMonitorDialog.open);
      if (isTasksOpen || pollCycleCounter % 2 === 0) {
        try {
          const res = await window.mainV1Fetch('/api/ai/tasks');
          if (res.ok) {
            const data = await res.json();
            const activeCount = typeof data.active_count === 'number' ? data.active_count : (data.tasks || []).filter(t => t.status === 'active').length;
            if (valTasksCountDrawer) {
              valTasksCountDrawer.textContent = activeCount;
            }
            if (isTasksOpen) {
              renderTasksList(data.tasks || []);
            }
          }
        } catch (e) {}
      }

      // Auto-sync any asynchronous agent responses (e.g. from background timer tasks)
      if (currentActiveConversationId && !isAiGenerating && (pollCycleCounter % 2 === 0)) {
        try {
          await syncActiveConversationMessages();
        } catch(e) {}
      }
    }, 3500);

    const tonesButton = document.getElementById('btn-toggle-tones');
    tonesButton?.addEventListener('click', async () => {
      const prefs = (window.mainV1 && typeof window.mainV1.preferences === 'function') ? window.mainV1.preferences() : {};
      const currentlyEnabled = (prefs.tones_enabled !== false && prefs.sound !== false);
      const newEnabled = !currentlyEnabled;
      const response = await window.mainV1Fetch('/api/ai/settings', {
        method: 'POST',
        body: JSON.stringify({tones_enabled: newEnabled, sound: newEnabled})
      });
      if (response.ok) {
        tonesButton.setAttribute('aria-pressed', String(newEnabled));
        announce(newEnabled ? 'النغمات مفعلة.' : 'النغمات معطلة.');
        if (newEnabled) playStartChime();
      }
    });

    // Report immediately on load
    reportVisibility(document.visibilityState === 'visible');
    const savedConversation = window.mainV1.currentConversation();
    if (savedConversation) resumeConversation(savedConversation, 'المحادثة المحفوظة');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiStudio);
  } else {
    initAiStudio();
  }
})();


})().catch(error => {
  const status = document.getElementById('sr-announcer');
  if (status) status.textContent = 'تعذر بدء الواجهة: ' + error.message;
  console.error(error);
});
