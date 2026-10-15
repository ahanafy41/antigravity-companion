package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class HeadlessVoiceCommandTest {
    private static final class Api implements HeadlessVoiceCommand.Api {
        final List<String> requests = new ArrayList<>();
        String state = "completed";
        boolean loseStart;
        @Override public JsonObject request(String method, String path, JsonObject body) throws IOException {
            requests.add(method + " " + path);
            JsonObject result = new JsonObject();
            if (path.equals("/settings")) {
                JsonObject settings = new JsonObject();
                com.google.gson.JsonArray roots = new com.google.gson.JsonArray(); roots.add("workspace-root");
                settings.add("workspace_roots", roots); result.add("settings", settings);
            }
            if (path.equals("/sessions")) {
                assertEquals("workspace-root", body.get("cwd").getAsString());
                result.addProperty("session_id", "session-1");
            }
            if (path.equals("/voice/runs")) {
                assertEquals("turn-1", body.get("request_id").getAsString());
                assertEquals("session-1", body.get("session_id").getAsString());
                if (loseStart) throw new IOException("Response lost after request accepted");
                result.addProperty("voice_id", "voice-1"); result.addProperty("state", state);
            }
            return result;
        }
    }
    @Test public void completedRunDoesNotRepeatBackendSpeechOrCancel() throws Exception {
        Api api = new Api();
        new HeadlessVoiceCommand(api, () -> {}).execute("افتح الإعدادات", "turn-1");
        assertEquals(java.util.Arrays.asList("GET /settings", "POST /sessions", "POST /voice/runs", "POST /sessions/session-1/close"), api.requests);
    }
    @Test public void uncertainStartCancelsByRequestIdentityBeforeClosingSession() throws Exception {
        Api api = new Api(); api.loseStart = true;
        try { new HeadlessVoiceCommand(api, () -> {}).execute("افتح الإعدادات", "turn-1"); fail("Lost start must fail"); }
        catch (IOException expected) { }
        assertEquals("POST /voice/requests/turn-1/cancel", api.requests.get(3));
        assertEquals("POST /sessions/session-1/close", api.requests.get(4));
    }
    @Test public void interruptedPollingCancelsOwnedRequestAndPreservesInterrupt() throws Exception {
        Api api = new Api(); api.state = "running";
        try {
            new HeadlessVoiceCommand(api, () -> { throw new InterruptedException(); }).execute("ارجع", "turn-1");
            fail("Interrupted polling must fail");
        } catch (InterruptedException expected) {
            assertTrue(Thread.currentThread().isInterrupted());
            assertTrue(api.requests.contains("POST /voice/requests/turn-1/cancel"));
        } finally { Thread.interrupted(); }
    }
}
