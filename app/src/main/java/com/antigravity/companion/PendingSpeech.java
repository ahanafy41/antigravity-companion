package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.util.function.Consumer;

final class PendingSpeech {
    final String id;
    private Consumer<JsonObject> completion;

    PendingSpeech(String id, Consumer<JsonObject> completion) {
        this.id = id; this.completion = completion;
    }
    synchronized boolean cancel(String scope, Runnable stop) {
        if (completion == null || (!scope.isEmpty() && !id.equals(scope))) return false;
        stop.run(); finish(id, "Speech output cancelled"); return true;
    }
    synchronized boolean finish(String utteranceId, String error) {
        if (!id.equals(utteranceId) || completion == null) return false;
        Consumer<JsonObject> callback = completion; completion = null;
        JsonObject result = new JsonObject();
        if (error == null) result.addProperty("speech_state", "output_completed");
        else result.addProperty("error", error);
        callback.accept(result); return true;
    }
}
