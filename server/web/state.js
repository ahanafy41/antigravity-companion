(function (global) {
  'use strict';
  const companion = global.Companion = global.Companion || {};
  companion.state = {
    connected: false, paired: false, capabilities: [], sessionId: '', runId: '',
    runState: 'idle', cursor: '', messages: [], models: [], agents: [],
    settings: {}, revision: 0, savedRecordId: '', offlineRecord: false, storageReady: false
  };
  companion.runActive = () => !['idle','completed','cancelled','failed','interrupted'].includes(companion.state.runState);
  companion.capability = id => companion.state.capabilities.find(entry => entry.id === id);
  companion.allowed = id => Boolean(companion.state.connected && companion.state.paired && companion.capability(id)?.available);
})(window);
