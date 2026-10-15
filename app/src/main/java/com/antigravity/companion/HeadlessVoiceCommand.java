package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

/** Owns one native voice request, including an uncertain POST result. */
final class HeadlessVoiceCommand {
    interface Api {
        JsonObject request(String method, String path, JsonObject body) throws IOException;
    }
    interface Pause { void await() throws InterruptedException; }
    private final Api api;
    private final Pause pause;
    HeadlessVoiceCommand(Api api, Pause pause) { this.api = api; this.pause = pause; }

    void execute(String text, String requestId) throws IOException, InterruptedException {
        if (text == null || text.trim().isEmpty() || text.length() > 4096
                || requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,128}"))
            throw new IllegalArgumentException("Invalid voice command");
        String sessionId = null;
        boolean submitted = false;
        boolean terminal = false;
        boolean interrupted = false;
        try {
            JsonObject settings = api.request("GET", "/settings", null).getAsJsonObject("settings");
            JsonObject options = new JsonObject();
            if (settings.has("cwd") && !settings.get("cwd").getAsString().isEmpty()) {
                options.add("cwd", settings.get("cwd"));
            } else {
                String roots = settings.has("workspace_roots") ? "workspace_roots" : "trustedWorkspaces";
                if (settings.has(roots) && settings.getAsJsonArray(roots).size() > 0)
                    options.add("cwd", settings.getAsJsonArray(roots).get(0));
            }
            sessionId = identifier(api.request("POST", "/sessions", options), "session_id");
            JsonObject payload = new JsonObject();
            payload.addProperty("session_id", sessionId); payload.addProperty("text", text.trim());
            payload.addProperty("request_id", requestId);
            submitted = true;
            JsonObject run = api.request("POST", "/voice/runs", payload);
            String voiceId = identifier(run, "voice_id");
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(13);
            while (true) {
                String state = identifier(run, "state");
                if (state.equals("completed")) { terminal = true; return; }
                if (state.equals("failed") || state.equals("cancelled") || state.equals("interrupted")) {
                    terminal = true; throw new IOException("Voice command did not complete");
                }
                if (!state.equals("running")) throw new IOException("Unknown voice command state");
                if (System.nanoTime() >= deadline) throw new IOException("Voice command timed out");
                pause.await();
                run = api.request("GET", "/voice/runs/" + voiceId, null);
            }
        } catch (InterruptedException stopped) {
            interrupted = true; throw stopped;
        } finally {
            // Clear interruption while cancelling: OkHttp otherwise refuses cleanup I/O.
            interrupted |= Thread.interrupted();
            try {
                if (submitted && !terminal)
                    api.request("POST", "/voice/requests/" + requestId + "/cancel", new JsonObject());
            } finally {
                try {
                    if (sessionId != null)
                        api.request("POST", "/sessions/" + sessionId + "/close", new JsonObject());
                } finally {
                    if (interrupted) Thread.currentThread().interrupt();
                }
            }
        }
    }
    private static String identifier(JsonObject object, String field) throws IOException {
        if (!object.has(field) || !object.get(field).isJsonPrimitive()
                || !object.getAsJsonPrimitive(field).isString()) throw new IOException("Missing voice response field");
        String value = object.get(field).getAsString();
        if (!value.matches("[A-Za-z0-9_-]{1,128}")) throw new IOException("Invalid voice response field");
        return value;
    }
}
