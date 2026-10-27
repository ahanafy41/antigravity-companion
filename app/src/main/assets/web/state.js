(function (global) {
  'use strict';
  const companion = global.Companion = global.Companion || {};
  companion.state = {
    connected: true, paired: true, capabilities: [], sessionId: '', runId: '',
    runState: 'idle', cursor: '', messages: [], models: [], agents: [],
    settings: {}, revision: 0, savedRecordId: '', offlineRecord: false, storageReady: false
  };
  companion.feedbackPolicy = (runId, runState, visible, settings, seen) => {
    const result = {sound:false,vibration:false};
    if (typeof runId !== 'string' || !runId || !['completed','failed','cancelled','interrupted'].includes(runState) || seen.has(runId)) return result;
    seen.add(runId);
    if (visible) return result;
    result.sound = (settings.sound ?? settings.tones_enabled) === true;
    result.vibration = (settings.haptics ?? settings.haptic_enabled) === true;
    return result;
  };
  companion.runActive = () => !['idle','completed','cancelled','failed','interrupted'].includes(companion.state.runState);
  companion.capability = id => companion.state.capabilities.find(entry => entry.id === id);
  companion.allowed = id => Boolean(companion.state.connected && companion.capability(id)?.available);
})(window);
