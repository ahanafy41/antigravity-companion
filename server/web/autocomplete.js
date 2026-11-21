/**
 * autocomplete.js - Unified Accessible Autocomplete Engine for Companion App
 * Handles Slash commands (/), Skills, and MCP Tools (@) with Screen Reader (TalkBack/Jieshuo) announcements.
 */

(function (root, factory) {
  const exportsObj = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = exportsObj;
  }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (window) {
  'use strict';

  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  window.escapeHtml = escapeHtml;

  async function getFetchFn() {
    if (typeof window !== 'undefined') {
      if (typeof window.mainV1Fetch === 'function') return window.mainV1Fetch;
      if (window.mainV1 && window.mainV1.ready && typeof window.mainV1.ready.then === 'function') {
        try { await window.mainV1.ready; } catch (_) {}
        if (typeof window.mainV1Fetch === 'function') return window.mainV1Fetch;
      }
    }
    if (typeof fetch === 'function') return fetch;
    return null;
  }

  // Pre-seeded Fast-Boot Model Catalog
  window._cachedModels = window._cachedModels || [
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
    { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
    { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
  ];

  // Fast-Boot Default Slash Commands & Skills
  const DEFAULT_SLASH_POOL = [
    { cmd: '/model', desc: 'اختيار وتغيير نموذج الذكاء الاصطناعي النشط', source: 'control' },
    { cmd: '/tasks', desc: 'مراقبة المهام المجدولة والخلفية وإدارتها', source: 'control' },
    { cmd: '/drawer', desc: 'فتح وإغلاق القائمة الجانبية للتطبيق', source: 'control' },
    { cmd: '/team', desc: 'إدارة فريق الوكلاء الفرعيين ومتابعة أنشطتهم', source: 'control' },
    { cmd: '/quota', desc: 'عرض حصة الاستهلاك والحدود لـ 5 ساعات', source: 'control' },
    { cmd: '/settings', desc: 'فتح نافذة الإعدادات العامة وخيارات النموذج', source: 'control' },
    { cmd: '/files', desc: 'فتح مستعرض ملفات العمل والمشاريع', source: 'control' },
    { cmd: '/skills', desc: 'فتح إدارة مهارات الذكاء الاصطناعي المثبتة', source: 'control' },
    { cmd: '/mcp', desc: 'فتح إدارة بروتوكولات وخوادم MCP', source: 'control' },
    { cmd: '/clear', desc: 'مسح محادثة الشات الحالية وبدء جلسة جديدة', source: 'control' },
    { cmd: '/task-decomposer', desc: 'تفكيك المهام والأفكار لخطوات تنفيذية محكمة', source: 'skill' },
    { cmd: '/universal-software-agency', desc: 'مايسترو الهندسة البرمجية وتطوير الأنظمة', source: 'skill' },
    { cmd: '/systematic-debugging', desc: 'التحري الجنائي عن الأخطاء وحلها من الجذور', source: 'skill' },
    { cmd: '/deep-debugger', desc: 'فحص وتصحيح الأعطال المعقدة في البايثون والويب', source: 'skill' },
    { cmd: '/code-refactor-pro', desc: 'تنظيف وتحسين أداء وهيكلة الكود المعمارية', source: 'skill' },
    { cmd: '/code-security-sentinel', desc: 'فحص الأمان والثغرات وحماية المفاتيح والبيانات', source: 'skill' },
    { cmd: '/git-workflow-master', desc: 'إدارة فروع جيت وحل التعارضات والـ worktrees', source: 'skill' },
    { cmd: '/test-engineer', desc: 'هندسة وكتابة اختبارات الوحدة الآلية الشاملة', source: 'skill' },
    { cmd: '/api-systems-architect', desc: 'تصميم الـ APIs وقواعد البيانات المعمارية', source: 'skill' },
    { cmd: '/study-mentor', desc: 'المعلم الأكاديمي وصانع المناهج وتفكيك العلوم', source: 'skill' },
    { cmd: '/jieshuo-lua-agency', desc: 'تطوير إضافات وسكريبتات قارئ الشاشة الصيني جيشوا', source: 'skill' },
    { cmd: '/ai-browser', desc: 'متصفح ويب ذكي خفيف وسريع لتيرماكس وأندرويد', source: 'skill' }
  ];

  window.WELL_KNOWN_SLASH_COMMANDS = window.WELL_KNOWN_SLASH_COMMANDS && window.WELL_KNOWN_SLASH_COMMANDS.length > DEFAULT_SLASH_POOL.length
    ? window.WELL_KNOWN_SLASH_COMMANDS
    : [...DEFAULT_SLASH_POOL];

  async function syncDynamicSlashCommandsGlobally() {
    try {
      const fetchFn = await getFetchFn();
      if (!fetchFn) return window.WELL_KNOWN_SLASH_COMMANDS;

      const commandsPromise = fetchFn('/api/ai/commands').then(r => r.ok ? r.json() : null).catch(() => null);
      const skillsPromise = fetchFn('/api/skills/list').then(r => r.ok ? r.json() : null).catch(() => null);

      const [commandsData, skillsData] = await Promise.all([commandsPromise, skillsPromise]);
      const commands = (commandsData && commandsData.commands) || [];
      const skills = (skillsData && skillsData.skills) || [];

      const map = new Map();
      DEFAULT_SLASH_POOL.forEach(b => map.set(b.cmd, b));

      if (Array.isArray(commands)) {
        commands.forEach(c => {
          const rawCmd = c.cmd || c.id || '';
          if (!rawCmd) return;
          const cmdKey = rawCmd.startsWith('/') ? rawCmd : ('/' + rawCmd);
          map.set(cmdKey, {
            cmd: cmdKey,
            name: c.name || cmdKey.replace(/^\//, ''),
            desc: c.desc || c.description || c.name || 'مهارة ذكاء اصطناعي',
            source: 'skill'
          });
        });
      }

      if (Array.isArray(skills)) {
        skills.forEach(s => {
          const rawName = s.name || s.id || '';
          if (!rawName) return;
          const cmdKey = rawName.startsWith('/') ? rawName : ('/' + rawName);
          if (!map.has(cmdKey)) {
            map.set(cmdKey, {
              cmd: cmdKey,
              name: s.name || rawName,
              desc: s.description || s.name || 'مهارة ذكاء اصطناعي',
              source: 'skill'
            });
          }
        });
      }

      window.WELL_KNOWN_SLASH_COMMANDS = Array.from(map.values());
      return window.WELL_KNOWN_SLASH_COMMANDS;
    } catch (err) {
      console.warn('Dynamic slash commands sync failed:', err);
      return window.WELL_KNOWN_SLASH_COMMANDS || [];
    }
  }
  window.syncDynamicSlashCommandsGlobally = syncDynamicSlashCommandsGlobally;

  // MCP Icons & Cache
  const DEFAULT_MCP_POOL = [
    { name: 'ai-browser', title: 'AI Web Browser', icon: '🌐', enabled: false, type: 'stdio', desc: 'متصفح ويب ذكي خفيف ومتاح لتيرماكس وأندرويد' },
    { name: 'fetch', title: 'Fetch & Read API', icon: '🌐', enabled: false, type: 'stdio', desc: 'جلب وقراءة محتوى صفحات الويب وملفات الـ API' },
    { name: 'rea', title: 'REA Agent Framework', icon: '🤖', enabled: false, type: 'stdio', desc: 'تكامل بروتوكول وكلاء REA للذكاء الاصطناعي' },
    { name: 'fs', title: 'Filesystem', icon: '📁', enabled: false, type: 'stdio', desc: 'قراءة وكتابة واستعراض ملفات النظام بأمان' },
    { name: 'github', title: 'GitHub Integration', icon: '🐙', enabled: false, type: 'stdio', desc: 'إدارة مستودعات GitHub والـ PRs والـ Issues' },
    { name: 'sqlite', title: 'SQLite Database', icon: '🗄️', enabled: false, type: 'stdio', desc: 'استعلام وإدارة قواعد بيانات SQLite محلياً' }
  ];

  window.INSTALLED_MCP_SERVERS = window.INSTALLED_MCP_SERVERS && window.INSTALLED_MCP_SERVERS.length > 0
    ? window.INSTALLED_MCP_SERVERS
    : [...DEFAULT_MCP_POOL];

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
      const fetchFn = await getFetchFn();
      if (!fetchFn) return window.INSTALLED_MCP_SERVERS;
      const res = await fetchFn('/api/mcp/list').catch(() => null);
      if (!res || !res.ok) return window.INSTALLED_MCP_SERVERS;
      const data = await res.json().catch(() => ({}));
      const installed = data.installed || [];
      const catalog = data.catalog || [];

      const mcpMap = new Map();

      installed.forEach(srv => {
        const catItem = catalog.find(c => c.id === srv.name);
        const icon = (catItem && catItem.icon) ? catItem.icon : window.getMcpIcon(srv.name);
        const desc = (catItem && catItem.description) ? catItem.description : (srv.command || 'بروتوكول MCP');
        const title = (catItem && catItem.name) ? catItem.name : srv.name;
        mcpMap.set(srv.name, {
          name: srv.name,
          title: title,
          enabled: !!srv.enabled,
          type: srv.type || 'stdio',
          command: srv.command || '',
          icon: icon,
          desc: desc
        });
      });

      catalog.forEach(cat => {
        if (!mcpMap.has(cat.id)) {
          mcpMap.set(cat.id, {
            name: cat.id,
            title: cat.name || cat.id,
            enabled: false,
            type: cat.type || 'stdio',
            command: cat.command || '',
            icon: cat.icon || window.getMcpIcon(cat.id),
            desc: cat.description || 'بروتوكول MCP متاح'
          });
        }
      });

      DEFAULT_MCP_POOL.forEach(def => {
        if (!mcpMap.has(def.name)) {
          mcpMap.set(def.name, def);
        }
      });

      window.INSTALLED_MCP_SERVERS = Array.from(mcpMap.values());
      return window.INSTALLED_MCP_SERVERS;
    } catch (err) {
      console.warn('MCP servers sync failed:', err);
      return window.INSTALLED_MCP_SERVERS || [];
    }
  };

  // Immediate and DOMContentLoaded hook
  if (typeof window !== 'undefined') {
    if (window.mainV1 && window.mainV1.ready) {
      window.mainV1.ready.then(() => {
        syncDynamicSlashCommandsGlobally();
        window.syncInstalledMcpGlobally();
      });
    }
    if (typeof document !== 'undefined') {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => {
          syncDynamicSlashCommandsGlobally();
          window.syncInstalledMcpGlobally();
        }, 50);
      } else if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            syncDynamicSlashCommandsGlobally();
            window.syncInstalledMcpGlobally();
          }, 50);
        });
      }
    }
  }

  function announceToScreenReader(txt) {
    const ann = document.getElementById('sr-announcer');
    if (ann) {
      ann.textContent = '';
      setTimeout(() => { ann.textContent = txt; }, 50);
    }
  }

  // --- Slash Command Autocomplete (/) ---
  window.attachSlashAutocomplete = function(inputElem, onSelectCallback) {
    if (!inputElem) return;
    let popup = null;
    let selectedIdx = 0;
    let currentFiltered = [];
    let currentSlashIndex = -1;
    let autoFocusTimer = null;

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
      announceToScreenReader(`تم اختيار أمر ${escapeHtml(item.cmd)}`);
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
            selectedIdx = (idx + 1) % currentFiltered.length;
            renderItems();
            focusSelected();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = (idx - 1 + currentFiltered.length) % currentFiltered.length;
            renderItems();
            focusSelected();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            selectItem(item);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
            inputElem.focus();
          }
        });

        listContainer.appendChild(row);
      });

      inputElem.setAttribute('aria-activedescendant', 'slash-opt-' + selectedIdx);
    }

    function focusSelected() {
      if (!popup) return;
      const sel = popup.querySelector('.slash-menu-item.selected');
      if (sel) {
        sel.scrollIntoView({ block: 'nearest' });
        sel.focus();
      }
    }

    function checkAndOpenPopup() {
      const val = inputElem.value;
      const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
      const textBefore = val.slice(0, cursor);
      const lastSlash = textBefore.lastIndexOf('/');

      if (lastSlash === -1) {
        closePopup();
        return;
      }

      const charBefore = lastSlash > 0 ? textBefore[lastSlash - 1] : ' ';
      if (charBefore !== ' ' && charBefore !== '\n' && lastSlash !== 0) {
        closePopup();
        return;
      }

      const query = textBefore.slice(lastSlash + 1).toLowerCase();
      if (query.includes(' ')) {
        closePopup();
        return;
      }

      currentSlashIndex = lastSlash;
      const pool = (Array.isArray(window.WELL_KNOWN_SLASH_COMMANDS) && window.WELL_KNOWN_SLASH_COMMANDS.length > 0)
        ? window.WELL_KNOWN_SLASH_COMMANDS
        : DEFAULT_SLASH_POOL;

      if (window.WELL_KNOWN_SLASH_COMMANDS.length <= DEFAULT_SLASH_POOL.length) {
        syncDynamicSlashCommandsGlobally().then(() => {
          if (popup && currentSlashIndex !== -1) {
            const p = window.WELL_KNOWN_SLASH_COMMANDS;
            currentFiltered = p.filter(item => {
              const c = item.cmd.toLowerCase();
              const d = (item.desc || '').toLowerCase();
              return c.includes(query) || d.includes(query) || c.includes('/' + query);
            });
            const badge = popup.querySelector('#slash-count-badge');
            if (badge) badge.textContent = currentFiltered.length;
            renderItems();
          }
        });
      }

      currentFiltered = pool.filter(item => {
        const c = item.cmd.toLowerCase();
        const d = (item.desc || '').toLowerCase();
        return c.includes(query) || d.includes(query) || c.includes('/' + query);
      });

      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'slash-autocomplete-popup';
        popup.className = 'slash-autocomplete-container';
        popup.setAttribute('role', 'listbox');
        popup.setAttribute('aria-label', 'قائمة أوامر السلاش والمهارات المقترحة');

        const header = document.createElement('div');
        header.className = 'slash-popup-header';
        header.innerHTML = `
          <div class="slash-header-title">
            <span>⚡ أوامر ومهارات سريعة</span>
            <span class="slash-counter" id="slash-count-badge">${currentFiltered.length}</span>
          </div>
          <button type="button" class="slash-popup-close-btn" aria-label="إغلاق قائمة الاقتراحات (Esc)">✕</button>
        `;
        header.querySelector('.slash-popup-close-btn').addEventListener('click', (e) => {
          e.preventDefault();
          closePopup();
          inputElem.focus();
        });

        const list = document.createElement('div');
        list.className = 'slash-items-list';

        popup.appendChild(header);
        popup.appendChild(list);

        const parent = inputElem.closest('.ai-input-wrapper') || inputElem.parentNode;
        parent.style.position = 'relative';
        parent.appendChild(popup);

        inputElem.setAttribute('aria-expanded', 'true');
        inputElem.setAttribute('aria-controls', 'slash-autocomplete-popup');
      } else {
        const badge = popup.querySelector('#slash-count-badge');
        if (badge) badge.textContent = currentFiltered.length;
      }

      selectedIdx = 0;
      renderItems();
      announceToScreenReader(`ظهرت قائمة مقترحات السلاش: ${currentFiltered.length} أمر متاح`);
    }

    inputElem.addEventListener('input', () => {
      checkAndOpenPopup();
    });

    inputElem.addEventListener('keydown', (e) => {
      if (!popup) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % currentFiltered.length;
        renderItems();
        focusSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + currentFiltered.length) % currentFiltered.length;
        renderItems();
        focusSelected();
      } else if (e.key === 'Enter') {
        if (currentFiltered.length > 0) {
          e.preventDefault();
          selectItem(currentFiltered[selectedIdx]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
      }
    });

    inputElem.addEventListener('blur', () => {
      setTimeout(() => {
        if (popup && !popup.contains(document.activeElement)) {
          closePopup();
        }
      }, 200);
    });
  };

  // --- MCP / Tool At-Sign Autocomplete (@) ---
  window.attachAtAutocomplete = function(inputElem, onSelectCallback) {
    if (!inputElem) return;
    let popup = null;
    let queryGeneration = 0;
    let selectedIdx = 0;
    let currentFiltered = [];
    let currentAtIndex = -1;
    let autoFocusTimer = null;

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
      announceToScreenReader(item.path ? 'أُدرج مسار ' + item.name : 'تم اختيار بروتوكول @' + item.name);
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
        listContainer.innerHTML = '<div class="main-style-135">لا توجد بروتوكولات أو ملفات مطابقة</div>';
        return;
      }

      if (selectedIdx >= currentFiltered.length) selectedIdx = 0;
      if (selectedIdx < 0) selectedIdx = currentFiltered.length - 1;

      currentFiltered.forEach((item, idx) => {
        const isSelected = (idx === selectedIdx);
        const isFile = !!item.path;
        const icon = isFile ? (item.type === 'directory' ? '📁' : '📄') : (item.icon || window.getMcpIcon(item.name));
        const name = isFile ? item.name : '@' + item.name;
        const desc = isFile ? (item.path || '') : (item.desc || item.title || '');
        const statusHtml = !isFile
          ? (item.enabled
              ? '<span class="at-item-status-badge main-style-136">🟢 مفعل</span>'
              : '<span class="at-item-status-badge main-style-137">⚪ متاح</span>')
          : '<span class="at-item-status-badge main-style-138">📄 ملف</span>';

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'at-menu-item' + (isSelected ? ' selected' : '');
        row.id = 'at-opt-' + idx;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(isSelected));
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', `${name}، ${item.enabled ? 'مفعل، ' : ''}${desc}`);

        row.innerHTML = `
          <div class="at-item-icon" aria-hidden="true">${escapeHtml(icon)}</div>
          <div class="at-item-body">
            <div class="at-item-title-row">
              <span class="at-item-name">${escapeHtml(name)}</span>
              ${statusHtml}
            </div>
            <div class="at-item-desc">${escapeHtml(desc)}</div>
          </div>
          ${isSelected ? '<span class="option-badge main-style-138">Enter ↵</span>' : ''}
        `;

        row.addEventListener('click', (e) => {
          e.preventDefault();
          selectItem(item);
        });

        row.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = (idx + 1) % currentFiltered.length;
            renderItems();
            focusSelected();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = (idx - 1 + currentFiltered.length) % currentFiltered.length;
            renderItems();
            focusSelected();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            selectItem(item);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
            inputElem.focus();
          }
        });

        listContainer.appendChild(row);
      });

      inputElem.setAttribute('aria-activedescendant', 'at-opt-' + selectedIdx);
    }

    function focusSelected() {
      if (!popup) return;
      const sel = popup.querySelector('.at-menu-item.selected');
      if (sel) {
        sel.scrollIntoView({ block: 'nearest' });
        sel.focus();
      }
    }

    function getAtQuery() {
      const val = inputElem.value;
      const cursor = (typeof inputElem.selectionStart === 'number') ? inputElem.selectionStart : val.length;
      const textBefore = val.slice(0, cursor);
      const lastAt = textBefore.lastIndexOf('@');
      if (lastAt === -1) return null;
      if (lastAt > 0) {
        const charBefore = textBefore.charAt(lastAt - 1);
        if (charBefore !== ' ' && charBefore !== '\n') return null;
      }
      const query = textBefore.slice(lastAt + 1);
      if (query.includes(' ') && !query.startsWith('"')) return null;
      if (query.startsWith('"') && query.slice(1).includes('"')) return null;
      return { query, atIndex: lastAt, cursor };
    }

    async function checkAndOpenPopup() {
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

      const servers = (Array.isArray(window.INSTALLED_MCP_SERVERS) && window.INSTALLED_MCP_SERVERS.length > 0)
        ? window.INSTALLED_MCP_SERVERS
        : DEFAULT_MCP_POOL;

      const filteredServers = servers.filter(s => {
        if (!q) return true;
        const n = (s.name || '').toLowerCase();
        const d = (s.desc || '').toLowerCase();
        const t = (s.title || '').toLowerCase();
        return n.includes(q) || d.includes(q) || t.includes(q);
      });

      let files = [];
      if (q && window.mainV1 && typeof window.mainV1.mentions === 'function') {
        try { files = await window.mainV1.mentions(res.query); }
        catch (error) { console.warn('Mentions error:', error); }
      }

      if (generation !== queryGeneration) return;

      currentFiltered = [...filteredServers, ...(Array.isArray(files) ? files : [])];
      if (!currentFiltered.length) {
        closePopup();
        return;
      }

      // If servers were only default pool, trigger sync and re-filter
      if (typeof window.syncInstalledMcpGlobally === 'function' && window.INSTALLED_MCP_SERVERS.length <= DEFAULT_MCP_POOL.length) {
        window.syncInstalledMcpGlobally().then(() => {
          if (popup && currentAtIndex !== -1 && generation === queryGeneration) {
            const p = (Array.isArray(window.INSTALLED_MCP_SERVERS) && window.INSTALLED_MCP_SERVERS.length > 0)
              ? window.INSTALLED_MCP_SERVERS
              : DEFAULT_MCP_POOL;
            const updatedServers = p.filter(s => {
              if (!q) return true;
              const n = (s.name || '').toLowerCase();
              const d = (s.desc || '').toLowerCase();
              const t = (s.title || '').toLowerCase();
              return n.includes(q) || d.includes(q) || t.includes(q);
            });
            currentFiltered = [...updatedServers, ...(Array.isArray(files) ? files : [])];
            const badge = popup.querySelector('#at-count-badge');
            if (badge) badge.textContent = currentFiltered.length;
            renderItems();
          }
        });
      }

      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'at-autocomplete-popup';
        popup.className = 'at-autocomplete-container';
        popup.setAttribute('role', 'listbox');
        popup.setAttribute('aria-label', 'قائمة بروتوكولات MCP وأدوات النظام المقترحة');

        const header = document.createElement('div');
        header.className = 'at-popup-header';
        header.innerHTML = `
          <div class="at-header-title">
            <span>🔌 بروتوكولات MCP وأدوات النظام (@)</span>
            <span class="at-counter" id="at-count-badge">${currentFiltered.length}</span>
          </div>
          <button type="button" class="at-popup-close-btn" aria-label="إغلاق قائمة الاقتراحات (Esc)">✕</button>
        `;
        header.querySelector('.at-popup-close-btn').addEventListener('click', (e) => {
          e.preventDefault();
          closePopup();
          inputElem.focus();
        });

        const list = document.createElement('div');
        list.className = 'at-items-list';

        popup.appendChild(header);
        popup.appendChild(list);

        const parent = inputElem.closest('.ai-input-wrapper') || inputElem.parentNode;
        parent.style.position = 'relative';
        parent.appendChild(popup);

        inputElem.setAttribute('aria-expanded', 'true');
        inputElem.setAttribute('aria-controls', 'at-autocomplete-popup');
      } else {
        const badge = popup.querySelector('#at-count-badge');
        if (badge) badge.textContent = currentFiltered.length;
      }

      selectedIdx = 0;
      renderItems();
      announceToScreenReader(`ظهرت قائمة مقترحات MCP: ${currentFiltered.length} بروتوكول وأداة متاحة`);
    }

    inputElem.addEventListener('input', () => {
      checkAndOpenPopup();
    });

    inputElem.addEventListener('click', () => {
      checkAndOpenPopup();
    });

    inputElem.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        checkAndOpenPopup();
      }
    });

    inputElem.addEventListener('focus', () => {
      if (typeof window.syncInstalledMcpGlobally === 'function') {
        window.syncInstalledMcpGlobally();
      }
    });

    inputElem.addEventListener('keydown', (e) => {
      if (!popup) {
        if (e.key === '@') {
          setTimeout(() => checkAndOpenPopup(), 20);
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % currentFiltered.length;
        renderItems();
        focusSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + currentFiltered.length) % currentFiltered.length;
        renderItems();
        focusSelected();
      } else if (e.key === 'Enter') {
        if (currentFiltered.length > 0) {
          e.preventDefault();
          selectItem(currentFiltered[selectedIdx]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
      }
    });

    inputElem.addEventListener('blur', () => {
      setTimeout(() => {
        if (popup && !popup.contains(document.activeElement)) {
          closePopup();
        }
      }, 200);
    });
  };

  return {
    escapeHtml,
    attachSlashAutocomplete: window.attachSlashAutocomplete,
    attachAtAutocomplete: window.attachAtAutocomplete,
    getMcpIcon: window.getMcpIcon
  };
}));
