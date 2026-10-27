(function (global) {
  'use strict';
  const companion = global.Companion;
  const focusOrigins = new WeakMap();
  const byId = id => document.getElementById(id);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function announce(message) { byId('announcer').textContent = message; }
  function notice(message) {
    byId('notice').hidden = !message;
    byId('notice').textContent = message;
    if (byId('panel-dialog').open) byId('panel-description').textContent = message;
    if (message) announce(message);
  }
  function showDialog(dialog) {
    if (dialog.open) return;
    focusOrigins.set(dialog, document.activeElement);
    dialog.showModal();
    const target = dialog.querySelector('[data-initial-focus]') || byId(dialog.getAttribute('aria-labelledby')) || dialog.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
    if (target) target.focus({preventScroll:true});
  }
  function closeDialog(dialog) { dialog.close(); }
  function dismissTopDialog() {
    const dialogs = document.querySelectorAll('dialog[open]');
    if (!dialogs.length) return false;
    closeDialog(dialogs[dialogs.length - 1]);
    return true;
  }
  function setupDialogs() {
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('close', () => {
        if (dialog.open) return;
        const activeDialog = document.activeElement?.closest('dialog[open]');
        if (activeDialog && activeDialog !== dialog) return;
        const origin = focusOrigins.get(dialog);
        focusOrigins.delete(dialog);
        if (origin?.isConnected && !origin.disabled && origin.closest('dialog')?.open !== false) origin.focus({preventScroll:true});
        else byId('menu-open').focus({preventScroll:true});
      });
    }
    for (const button of document.querySelectorAll('[data-close]')) {
      button.addEventListener('click', () => closeDialog(button.closest('dialog')));
    }
  }
  function button(text, action, className) {
    const control = element('button', text, className);
    control.type = 'button';
    control.addEventListener('click', () => Promise.resolve().then(action).catch(error => notice(error.message)));
    return control;
  }
  function input(parent, label, options = {}) {
    const id = 'field-' + global.crypto.randomUUID();
    const caption = element('label', label);
    caption.htmlFor = id;
    const field = element(options.tag || 'input');
    field.id = id;
    if (options.tag !== 'textarea' && options.tag !== 'select') field.type = options.type || 'text';
    if (options.value !== undefined) field.value = options.value;
    if (options.className) field.className = options.className;
    if (options.secret) field.autocomplete = 'off';
    parent.append(caption, field);
    return field;
  }
  function panel(title, description) {
    if (byId('menu-dialog').open) closeDialog(byId('menu-dialog'));
    byId('panel-title').textContent = title;
    byId('panel-description').textContent = description || '';
    byId('panel-content').replaceChildren();
    if (!byId('panel-dialog').open) showDialog(byId('panel-dialog'));
    return byId('panel-content');
  }
  function markdown(target, text) {
    if (!global.marked || !global.DOMPurify) {
      target.textContent = text;
      notice('تعذر تحميل محلل Markdown؛ يُعرض الرد نصاً عادياً.');
      return;
    }
    const fragment = global.DOMPurify.sanitize(global.marked.parse(text), {
      RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['img', 'svg', 'math', 'form', 'input', 'button', 'iframe', 'style'],
      FORBID_ATTR: ['style', 'id', 'name'], ALLOW_DATA_ATTR: false
    });
    for (const link of fragment.querySelectorAll('a')) {
      try {
        const url = new URL(link.getAttribute('href') || '', global.location.href);
        if (!['http:', 'https:'].includes(url.protocol)) link.removeAttribute('href');
        else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      } catch (failure) {
        if (!(failure instanceof TypeError)) throw failure;
        link.removeAttribute('href');
      }
    }
    for (const pre of fragment.querySelectorAll('pre')) { pre.tabIndex = 0; pre.setAttribute('aria-label', 'مقطع الشفرة'); }
    target.replaceChildren(fragment);
    target.classList.add('rendered');
  }
  function messageNode(message) {
    const article = element('article', undefined, 'message ' + message.role);
    const heading = element('h3', message.role === 'archive' ? 'عنصر تاريخي محفوظ JSON' : message.role === 'user' ? 'أنت' : 'المساعد');
    const content = element('div', message.text, 'message-content');
    const tools = element('p', (message.tools || []).join('\n'), 'message-tools');
    tools.hidden = !tools.textContent;
    article.append(heading, content, tools);
    byId('messages').append(article);
    return {article, content, tools};
  }
  function renderHistory(messages) {
    byId('messages').replaceChildren();
    for (const message of messages) {
      const nodes = messageNode(message);
      if (message.role === 'assistant') markdown(nodes.content, message.text);
    }
  }
  function insertPrompt(text) {
    const prompt = byId('prompt');
    prompt.setRangeText(text, prompt.selectionStart, prompt.selectionEnd, 'end');
    if (byId('panel-dialog').open) closeDialog(byId('panel-dialog'));
    prompt.focus();
  }
  function busyControls() {
    const state = companion.state;
    const running = companion.runActive();
    byId('send').disabled = !companion.allowed('chat') || running || state.offlineRecord;
    byId('prompt').disabled = !companion.allowed('chat') || state.offlineRecord;
    byId('cancel-run').hidden = !running;
    byId('messages').setAttribute('aria-busy', String(running));
    byId('new-chat').disabled = running;
  }
  companion.ui = {byId, element, announce, notice, showDialog, closeDialog, dismissTopDialog, setupDialogs, button, input, panel, markdown, messageNode, renderHistory, insertPrompt, busyControls};
})(window);
