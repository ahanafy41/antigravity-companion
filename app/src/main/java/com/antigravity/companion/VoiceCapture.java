package com.antigravity.companion;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.UUID;
import java.util.function.Consumer;

final class VoiceCapture implements RecognitionListener, AutoCloseable {
    private static VoiceCapture activeCapture;
    private final Activity activity;
    private final Handler mainThread = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private Consumer<JsonObject> completion;
    private String taskId;
    private final Runnable timeout = () -> finish(error("Speech recognition timeout"));
    VoiceCapture(Activity activity) { this.activity = activity; }
    void start(Consumer<JsonObject> callback) {
        if (activeCapture != null) { callback.accept(error("A voice task is already active")); return; }
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 2002);
            callback.accept(error("Microphone permission required; retry after granting it")); return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) { callback.accept(error("Speech recognition unavailable")); return; }
        completion = callback; taskId = UUID.randomUUID().toString(); activeCapture = this;
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity); recognizer.setRecognitionListener(this);
            Intent recognition = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG");
            mainThread.postDelayed(timeout, 30000); recognizer.startListening(recognition);
        } catch (SecurityException | IllegalStateException failure) { finish(error(failure.getMessage())); }
    }
    void cancel() { if (activeCapture != null) activeCapture.finish(error("Voice task cancelled")); }
    boolean active() { return activeCapture != null; }
    private void finish(JsonObject outcome) {
        Consumer<JsonObject> callback = completion; completion = null;
        if (activeCapture == this) activeCapture = null;
        mainThread.removeCallbacks(timeout);
        if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; }
        if (callback != null) { outcome.addProperty("task_id", taskId); callback.accept(outcome); }
    }
    private static JsonObject error(String message) {
        JsonObject failure = new JsonObject(); failure.addProperty("error", message); return failure;
    }
    @Override public void onResults(Bundle bundle) {
        ArrayList<String> recognized = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (recognized == null || recognized.isEmpty() || recognized.get(0).trim().isEmpty()) {
            finish(error("No speech recognized")); return;
        }
        JsonObject speech = new JsonObject(); speech.addProperty("text", recognized.get(0)); finish(speech);
    }
    @Override public void onError(int errorCode) { finish(error("Speech recognition error: " + errorCode)); }
    @Override public void onReadyForSpeech(Bundle params) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float rms) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { }
    @Override public void onPartialResults(Bundle partial) { }
    @Override public void onEvent(int type, Bundle params) { }
    @Override public void close() { if (completion != null) finish(error("Voice task closed")); mainThread.removeCallbacksAndMessages(null); }
}
