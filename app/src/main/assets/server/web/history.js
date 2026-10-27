(function (global) {
  'use strict';
  const companion = global.Companion = global.Companion || {};
  const keyPattern = /^(?:antigravity(?:[_-](?:chats?|conversations?|history))?|chat[_-]?history|chats|conversations)$/i;
  function normalizeMessages(messages) {
    return messages.filter(message => message && typeof message === 'object').map(message => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      text: String(message.text ?? message.content ?? ''),
      tools: []
    }));
  }
  function legacyRecords(storage) {
    const records = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!keyPattern.test(key)) continue;
      try {
        const parsed = JSON.parse(storage.getItem(key));
        if (!parsed || typeof parsed !== 'object') continue;
        const chats = Array.isArray(parsed) ? parsed : parsed.chats || parsed.conversations || [];
        if (!Array.isArray(chats)) continue;
        for (const chat of chats) {
          if (!chat || !Array.isArray(chat.messages)) continue;
          records.push({id: 'legacy:' + key + ':' + (chat.id || records.length), title: String(chat.title || 'محادثة قديمة'), messages: normalizeMessages(chat.messages), read_only: true});
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    return records;
  }
  let database;
  function transactionRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function open() {
    const request = global.indexedDB.open('antigravity-companion', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', {keyPath:'id'});
    database = await transactionRequest(request);
    for (const record of legacyRecords(global.localStorage)) {
      const existing = await get(record.id);
      if (!existing) await save(record);
    }
  }
  async function save(record) {
    const transaction = database.transaction('records', 'readwrite');
    transaction.objectStore('records').put(JSON.parse(JSON.stringify(record)));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('تعذر حفظ السجل.'));
    });
  }
  function get(id) { return transactionRequest(database.transaction('records').objectStore('records').get(id)); }
  function list() { return transactionRequest(database.transaction('records').objectStore('records').getAll()); }
  companion.legacyRecords = legacyRecords;
  companion.history = {open, save, get, list};
})(window);
