/**
 * Antigravity Companion App - Tool Step Visualizer & Result Card Formatter
 * Clean Architecture Modular Engine
 *
 * Formats tool execution labels and builds accessible cards with syntax badges,
 * clickable links, file inspection shortcuts, and clipboard copy actions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ToolVisualizer = factory();
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

  function createToolVisualizer(options) {
    const opts = options || {};
    const escapeHtml = opts.escapeHtml || defaultEscapeHtml;

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
        const subagents = Array.isArray(params.Subagents) ? params.Subagents : [];
        let role = '';
        if (subagents.length > 0) {
          role = subagents.map(s => s.Role || s.TypeName).filter(Boolean).join(', ');
        }
        if (!role) {
          role = params.Role || params.role || params.TypeName || params.type_name || '';
        }
        const typeName = params.TypeName || params.type_name || '';
        const roleLabel = role || typeName || 'وكيل فرعي';
        return `🤖 إطلاق الوكيل الفرعي: ${roleLabel}`;
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

    function renderToolResultCard(toolName, params, rawOutput) {
      if (!rawOutput && rawOutput !== 0) return '';
      let strOutput = String(rawOutput).trim();
      if (!strOutput) return '';
      if (strOutput.length > 16384) {
        strOutput = strOutput.slice(0, 16384) + '\n... [تم اختصار العرض المباشر لحماية أداء الهاتف]';
      }
      params = params || {};

      let cardHtml = '<div class="tool-result-card" role="region" aria-label="نتيجة تنفيذ الأداة">';

      if (toolName === 'search_web' || toolName === 'web_search') {
        const query = params.query || params.Query || '';
        cardHtml += '<div class="tool-card-header search-header"><span>🌐 نتائج البحث في الويب: <strong>' + escapeHtml(query) + '</strong></span></div>';

        const foundLinks = [];
        const seenUrls = new Set();

        const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
        let match;
        while ((match = mdLinkRegex.exec(strOutput)) !== null) {
          const title = match[1].trim();
          const url = match[2].trim();
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            foundLinks.push({ title, url });
          }
        }

        const rawUrlRegex = /(https?:\/\/[^\s"'<>\)]+)/g;
        const lines = strOutput.split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let rMatch;
          while ((rMatch = rawUrlRegex.exec(trimmed)) !== null) {
            const url = rMatch[1];
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              const cleanTitle = trimmed.replace(rawUrlRegex, '').replace(/^[-*#\d\.\s]+/, '').trim() || url;
              foundLinks.push({ title: cleanTitle, url });
            }
          }
        });

        if (foundLinks.length > 0) {
          cardHtml += '<div class="search-results-list" role="list" aria-label="قائمة نتائج البحث">';
          foundLinks.forEach(link => {
            cardHtml += '<div class="search-result-item" role="listitem">' +
              '<div class="search-result-row">' +
                '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener noreferrer" class="search-result-link">🔗 ' + escapeHtml(link.title) + '</a>' +
                '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(link.url) + '" aria-label="نسخ رابط ' + escapeHtml(link.title) + '">📋 نسخ الرابط</button>' +
              '</div>' +
              '<div class="search-result-url">' + escapeHtml(link.url) + '</div>' +
            '</div>';
          });
          cardHtml += '</div>';

          cardHtml += '<details class="step-raw-details"><summary class="step-raw-summary">📄 تفاصيل نص مخرجات البحث الكاملة</summary>' +
            '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre></details>';
        } else {
          cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre>';
        }
      } else if (toolName === 'read_url_content' || toolName === 'fetch' || toolName === 'browser_read') {
        const url = params.Url || params.url || params.url_content || '';
        cardHtml += '<div class="tool-card-header fetch-header">' +
          '<span>🌐 المصدر: <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="search-result-link">' + escapeHtml(url || 'رابط خارجي') + '</a></span>' +
          (url ? '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(url) + '" aria-label="نسخ رابط المصدر">📋 نسخ الرابط</button>' : '') +
        '</div>';
        cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre>';
      } else if (toolName === 'read_file' || toolName === 'view_file' || toolName === 'read_resource') {
        const p = params.Path || params.path || params.AbsolutePath || params.TargetFile || params.Uri || params.uri || '';
        const lines = strOutput.split('\n');
        cardHtml += '<div class="tool-card-header file-header">' +
          '<span>📄 الملف: <code>' + escapeHtml(p || 'ملف') + '</code> <small class="step-state-badge">(' + lines.length + ' سطر)</small></span>' +
          '<div style="display:flex;gap:4px;">' +
            (p ? '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(p) + '" aria-label="نسخ مسار الملف">📋 نسخ المسار</button>' : '') +
            '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(strOutput) + '" aria-label="نسخ محتوى الملف">📋 نسخ المحتوى</button>' +
          '</div>' +
        '</div>';
        cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre>';
      } else if (toolName === 'run_command' || toolName === 'command') {
        const cmd = params.CommandLine || params.command || params.cmd || '';
        let cleanOutput = strOutput;
        let exitBadge = '';
        const exitMatch = strOutput.match(/Command exited with code (\d+)\./);
        if (exitMatch) {
          const code = exitMatch[1];
          if (code === '0') {
            exitBadge = ' <small class="step-state-badge" style="color:var(--accent-green);font-weight:bold;">(كود 0: نجاح)</small>';
          } else {
            exitBadge = ' <small class="step-state-badge" style="color:#f87171;font-weight:bold;">(كود ' + escapeHtml(code) + ': تعثر)</small>';
          }
        }
        const outMarker = 'Command output:\n';
        const outIdx = strOutput.indexOf(outMarker);
        if (outIdx !== -1) {
          cleanOutput = strOutput.substring(outIdx + outMarker.length);
        }
        cardHtml += '<div class="tool-card-header cmd-header">' +
          '<span>💻 الأمر: <code>' + escapeHtml(cmd) + '</code>' + exitBadge + '</span>' +
          '<div style="display:flex;gap:4px;">' +
            (cmd ? '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(cmd) + '" aria-label="نسخ الأمر المنفذ">📋 نسخ الأمر</button>' : '') +
            '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(cleanOutput) + '" aria-label="نسخ مخرجات الأمر">📋 نسخ النتيجة</button>' +
          '</div>' +
        '</div>';
        cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(cleanOutput) + '</pre>';
      } else if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'write_to_file' || toolName === 'write') {
        const p = params.Path || params.path || params.TargetFile || params.target_file || '';
        const isEdit = toolName === 'edit_file';
        cardHtml += '<div class="tool-card-header file-header">' +
          '<span>' + (isEdit ? '✏️ تعديل ملف:' : '📝 إنشاء/كتابة ملف:') + ' <code>' + escapeHtml(p || 'ملف') + '</code></span>' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            (p ? '<button type="button" class="btn btn-sm btn-view-file-direct" data-path="' + escapeHtml(p) + '" aria-label="عرض وفتح الملف ' + escapeHtml(p) + '">📖 عرض الملف</button>' : '') +
            (p ? '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(p) + '" aria-label="نسخ مسار الملف">📋 نسخ المسار</button>' : '') +
            '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(strOutput) + '" aria-label="نسخ التفاصيل">📋 نسخ التفاصيل</button>' +
          '</div>' +
        '</div>';
        cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre>';
      } else {
        cardHtml += '<div class="tool-card-header tool-generic-header">' +
          '<span>⚙️ أداة: <code>' + escapeHtml(toolName) + '</code></span>' +
          '<button type="button" class="btn btn-sm btn-copy-inline" data-copy="' + escapeHtml(strOutput) + '" aria-label="نسخ مخرجات الأداة">📋 نسخ المخرجات</button>' +
        '</div>';
        cardHtml += '<pre class="step-output-content" tabindex="0">' + escapeHtml(strOutput) + '</pre>';
      }

      cardHtml += '</div>';
      return cardHtml;
    }

    return {
      getToolLabel: getToolLabel,
      renderToolResultCard: renderToolResultCard
    };
  }

  const defaultInstance = createToolVisualizer();

  return {
    createToolVisualizer: createToolVisualizer,
    getToolLabel: defaultInstance.getToolLabel,
    renderToolResultCard: defaultInstance.renderToolResultCard
  };
});
