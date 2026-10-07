// ==============================================================================
// Accessible Markdown Parser & Formatting Utilities
// High-performance parser with code highlighting, copy buttons, and ARIA support
// ==============================================================================

    function escapeHtml(s) {
      return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    // Robust Accessible Markdown Parser
    function renderMarkdown(md) {
      if (!md) return '';

      // 1. Extract and preserve code blocks
      const codeBlocks = [];
      let text = md.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, function(match, lang, code) {
        const placeholder = '___CODE_BLOCK_' + codeBlocks.length + '___';
        const cleanCode = code.trim();
        const escapedCode = cleanCode
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        codeBlocks.push(
          '<div class="code-card" role="region" aria-label="كود برمجي ' + (lang || '') + '">' +
            '<div class="code-card-header">' +
              '<span>' + (lang || 'code') + '</span>' +
              '<button type="button" class="btn-icon-sm btn-copy-code" data-code="' + encodeURIComponent(cleanCode) + '" aria-label="نسخ الكود">📋 نسخ الكود</button>' +
            '</div>' +
            '<pre tabindex="0"><code>' + escapedCode + '</code></pre>' +
          '</div>'
        );
        return '\n\n' + placeholder + '\n\n';
      });

      // 2. Escape HTML entities in text
      text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 3. Inline formatting
      text = text.replace(/`([^`]+)`/g, '<bdi class="code-inline">$1</bdi>');
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // 4. Split into clean blocks
      const rawBlocks = text.split(/\n{2,}/);
      const outputHtml = [];

      for (let i = 0; i < rawBlocks.length; i++) {
        let block = rawBlocks[i].trim();
        if (!block) continue;

        // Check for code block placeholder
        const cbMatch = block.match(/^___CODE_BLOCK_(\d+)___$/);
        if (cbMatch) {
          const idx = parseInt(cbMatch[1], 10);
          if (codeBlocks[idx]) outputHtml.push(codeBlocks[idx]);
          continue;
        }

        const lines = block.split('\n');
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

          // Detect Headings (mapped to h4, h5, h6 for accessible logical hierarchy under card h3)
          const hMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
          if (hMatch) {
            flushParagraph();
            flushList();
            const hLevel = Math.min(6, Math.max(4, hMatch[1].length + 3)); // # and ## -> h4, ### -> h5, ####+ -> h6
            outputHtml.push('<h' + hLevel + ' class="ai-heading-' + hLevel + '" dir="auto">' + hMatch[2].trim() + '</h' + hLevel + '>');
            continue;
          }

          // Detect Lists
          const listMatch = trimmedLine.match(/^[\-\*•]\s+(.+)$/) || trimmedLine.match(/^\d+(\.|\))\s+(.+)$/);
          if (listMatch) {
            flushParagraph();
            listItems.push('<li>' + listMatch[1].trim() + '</li>');
            continue;
          }

          // Normal text
          flushList();
          currentParagraph.push(trimmedLine);
        }

        flushParagraph();
        flushList();
      }

      return outputHtml.join('');
    }

    // Global copy handlers
    document.addEventListener('click', (e) => {
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

// Global exports
window.escapeHtml = escapeHtml;
window.renderMarkdown = renderMarkdown;
