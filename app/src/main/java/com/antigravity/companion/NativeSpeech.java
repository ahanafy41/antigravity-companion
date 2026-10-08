package com.antigravity.companion;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.google.gson.JsonObject;
import java.util.function.Consumer;

final class NativeSpeech implements AutoCloseable {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final TextToSpeech engine;
    private PendingSpeech pending;
    private SpeechRequest waiting;
    private boolean ready;
    private boolean failed;
    private boolean closed;
    private final Runnable deadline = () -> stopPending("Speech output timeout");

    NativeSpeech(Context context) {
        engine = new TextToSpeech(context.getApplicationContext(), status -> main.post(() -> initialized(status)));
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { main.post(() -> finish(id, null)); }
            @Override public void onError(String id) { main.post(() -> finish(id, "Speech engine error")); }
            @Override public void onError(String id, int code) { onError(id); }
            @Override public void onStop(String id, boolean interrupted) {
                main.post(() -> finish(id, "Speech output stopped"));
            }
        });
    }
    void speak(JsonObject args, String actionId, Consumer<JsonObject> callback) {
        SpeechRequest request = SpeechRequest.parse(args);
        if (closed || failed) { callback.accept(error("Speech engine unavailable")); return; }
        if (pending != null) { callback.accept(error("Speech output already active")); return; }
        pending = new PendingSpeech(actionId, callback); waiting = request;
        main.postDelayed(deadline, 110000);
        if (ready) startPending();
    }
    JsonObject cancel(JsonObject args) {
        String scope = SpeechRequest.cancellationScope(args);
        if (closed) return error("Speech engine closed");
        boolean cancelled = false;
        if (pending != null) {
            try {
                cancelled = pending.cancel(scope, () -> {
                    if (engine.stop() != TextToSpeech.SUCCESS)
                        throw new IllegalStateException("Speech cancellation failed");
                });
            } catch (IllegalStateException failure) { return error("Speech cancellation failed"); }
            if (cancelled) { pending = null; waiting = null; main.removeCallbacks(deadline); }
        }
        JsonObject result = new JsonObject();
        result.addProperty("speech_state", cancelled ? "was_cancelled" : "no_match"); return result;
    }
    private void initialized(int status) {
        if (closed) return;
        ready = status == TextToSpeech.SUCCESS; failed = !ready;
        if (!ready) stopPending("Speech engine initialization failed");
        else if (pending != null) startPending();
    }
    private void startPending() {
        SpeechRequest request = waiting;
        if (pending == null || request == null) return;
        waiting = null;
        int language = engine.setLanguage(request.language);
        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED
                || engine.setSpeechRate(request.rate) != TextToSpeech.SUCCESS) {
            stopPending("Speech language or rate unavailable"); return;
        }
        if (engine.speak(request.text, TextToSpeech.QUEUE_FLUSH, null, pending.id) != TextToSpeech.SUCCESS)
            stopPending("Speech engine rejected output");
    }
    private void finish(String id, String error) {
        if (pending == null || !pending.id.equals(id)) return;
        PendingSpeech current = pending; pending = null; waiting = null;
        main.removeCallbacks(deadline); current.finish(id, error);
    }
    private void stopPending(String reason) {
        engine.stop();
        if (pending != null) finish(pending.id, reason);
    }
    private static JsonObject error(String message) {
        JsonObject result = new JsonObject(); result.addProperty("error", message); return result;
    }
    @Override public void close() {
        closed = true; stopPending("Speech engine closed"); main.removeCallbacksAndMessages(null); engine.shutdown();
    }
}
