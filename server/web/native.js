(function (global) {
  'use strict';
  const companion = global.Companion = global.Companion || {};
  const pending = new Map();
  function available() { return typeof global.CompanionNative?.postMessage === 'function'; }
  function request(action, args = {}) {
    if (!available()) return Promise.reject(new Error('هذه الوظيفة تحتاج تطبيق Android.'));
    const requestId = global.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = global.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('انقضت مهلة استجابة Android؛ افحص الحالة قبل تكرار الفعل.'));
      }, action === 'download_update' ? 300000 : 60000);
      pending.set(requestId, {resolve, reject, timeout});
      global.CompanionNative.postMessage(JSON.stringify({request_id: requestId, action, args}));
    });
  }
  global.addEventListener('companion-native-result', event => {
    const reply = event.detail;
    if (!reply || typeof reply.request_id !== 'string') return;
    const waiting = pending.get(reply.request_id);
    if (!waiting) return;
    global.clearTimeout(waiting.timeout);
    pending.delete(reply.request_id);
    if (reply.success === true) waiting.resolve(reply.result);
    else waiting.reject(new Error(String(reply.error || 'تعذر الفعل في Android.')));
  });
  companion.native = {available, request};
})(window);
