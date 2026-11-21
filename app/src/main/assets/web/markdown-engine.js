/**
 * Antigravity Companion - Accessible Markdown Engine (Slice 16)
 * Modular UMD Engine for High-Performance GFM Parsing, DOMPurify Sanitization,
 * Custom Alerts, Accessible Syntax Highlighting & Screen-Reader Friendly Fallback.
 */
(function(root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    const exports = factory();
    const target = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : root);
    target.MarkdownEngine = exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function() {
  'use strict';

  function defaultEscapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createMarkdownEngine(options) {
    const opts = options || {};
    const escapeHtml = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : defaultEscapeHtml;
    const getMarked = function() {
      if (opts.marked) return opts.marked;
      if (typeof window !== 'undefined' && window.marked) return window.marked;
      return null;
    };
    const getDOMPurify = function() {
      if (opts.DOMPurify) return opts.DOMPurify;
      if (typeof window !== 'undefined' && window.DOMPurify) return window.DOMPurify;
      return null;
    };

    let cachedMarkedRenderer = null;

    function getMarkedRenderer() {
      if (cachedMarkedRenderer) return cachedMarkedRenderer;
      const markedLib = getMarked();
      if (!markedLib || !markedLib.Renderer) return null;

      const renderer = new markedLib.Renderer();

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

      const defaultTable = markedLib.Renderer.prototype.table;
      renderer.table = function(token) {
        const rendered = defaultTable ? defaultTable.call(this, token) : '';
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

      const defaultParagraph = markedLib.Renderer.prototype.paragraph;
      renderer.paragraph = function(token) {
        const rendered = defaultParagraph ? defaultParagraph.call(this, token) : ('<p>' + token + '</p>');
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

      cachedMarkedRenderer = renderer;
      return cachedMarkedRenderer;
    }

    function renderMarkdown(md) {
      if (!md) return '';

      const cleanMd = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const markedLib = getMarked();
      const domPurifyLib = getDOMPurify();

      // 1. High-Performance GFM Parsing via marked.js and DOMPurify if available
      if (markedLib && domPurifyLib) {
        try {
          let processed = cleanMd;
          if (cleanMd.includes('[!')) {
            const alertMap = {
              'NOTE': { label: 'ملاحظة', icon: 'ℹ️', cls: 'markdown-alert-note' },
              'TIP': { label: 'تلميح مفيد', icon: '💡', cls: 'markdown-alert-tip' },
              'IMPORTANT': { label: 'هام جداً', icon: '📌', cls: 'markdown-alert-important' },
              'WARNING': { label: 'تحذير', icon: '⚠️', cls: 'markdown-alert-warning' },
              'CAUTION': { label: 'تنبيه أمان', icon: '🛑', cls: 'markdown-alert-caution' }
            };

            processed = cleanMd.replace(
              /(?:^|\n)>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?((?:>[^\n]*(?:\n|$))*)/gi,
              function(match, type, body) {
                const upperType = type.toUpperCase();
                const alertInfo = alertMap[upperType] || { label: upperType, icon: 'ℹ️', cls: 'markdown-alert-note' };
                const cleanBody = (body || '')
                  .split('\n')
                  .map(function(l) { return l.replace(/^>\s?/, ''); })
                  .join('\n')
                  .trim();
                let formattedBody = cleanBody;
                try {
                  if (typeof markedLib.parseInline === 'function') {
                    formattedBody = markedLib.parseInline(cleanBody);
                  } else if (typeof markedLib.parse === 'function') {
                    formattedBody = markedLib.parse(cleanBody);
                  }
                } catch(e) {}

                return '\n\n<div class="markdown-alert ' + alertInfo.cls + '" role="region" aria-label="' + alertInfo.label + '">' +
                       '<div class="markdown-alert-title"><span aria-hidden="true">' + alertInfo.icon + '</span> <span>' + alertInfo.label + '</span></div>' +
                       '<div class="markdown-alert-content">' + formattedBody + '</div></div>\n\n';
              }
            );
          }

          const renderer = getMarkedRenderer();
          const html = markedLib.parse(processed, {
            renderer: renderer,
            gfm: true,
            breaks: true
          });

          return domPurifyLib.sanitize(html, {
            ADD_TAGS: ['bdi', 'audio'],
            ADD_ATTR: ['target', 'rel', 'controls', 'autoplay', 'preload', 'data-code', 'dir', 'role', 'aria-label', 'aria-controls', 'tabindex', 'checked', 'disabled']
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('Marked parse failed, using fallback:', e);
          }
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
          const headerCols = lines[0].split('|').slice(1, -1).map(function(c) { return c.trim(); });
          const rows = [];
          for (let k = 1; k < lines.length; k++) {
            const rowLine = lines[k].trim();
            if (/^\|[-:\s|]+\|$/.test(rowLine)) continue;
            if (rowLine.startsWith('|') && rowLine.endsWith('|')) {
              rows.push(rowLine.split('|').slice(1, -1).map(function(c) { return c.trim(); }));
            }
          }
          let tableHtml = '<div class="table-responsive-wrapper" role="region" aria-label="جدول بيانات"><table role="table"><thead><tr>';
          headerCols.forEach(function(col) { tableHtml += '<th scope="col">' + col + '</th>'; });
          tableHtml += '</tr></thead><tbody>';
          rows.forEach(function(r) {
            tableHtml += '<tr>';
            r.forEach(function(c) { tableHtml += '<td>' + c + '</td>'; });
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

    return {
      escapeHtml: escapeHtml,
      getMarkedRenderer: getMarkedRenderer,
      renderMarkdown: renderMarkdown
    };
  }

  // Standalone convenience exports
  const defaultEngine = createMarkdownEngine();

  return {
    createMarkdownEngine: createMarkdownEngine,
    escapeHtml: defaultEngine.escapeHtml,
    getMarkedRenderer: defaultEngine.getMarkedRenderer,
    renderMarkdown: defaultEngine.renderMarkdown
  };
});
