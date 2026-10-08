package com.antigravity.companion;

import com.google.gson.JsonObject;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class SpeechRequestTest {
    private JsonObject args(String text) {
        JsonObject args = new JsonObject(); args.addProperty("text", text); return args;
    }
    @Test public void explicitTextUsesBoundedDefaults() {
        SpeechRequest request = SpeechRequest.parse(args(" مرحبا "));
        assertEquals("مرحبا", request.text);
        assertEquals("ar-EG", request.language.toLanguageTag());
        assertEquals(1f, request.rate, 0f);
    }
    @Test public void rejectsInvalidTextLanguageAndRate() {
        for (JsonObject invalid : new JsonObject[]{args(""), args("\u0000hi"), args("x".repeat(2001))}) {
            assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(invalid));
        }
        JsonObject numericText = new JsonObject(); numericText.addProperty("text", 4);
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(numericText));
        JsonObject rate = args("test"); rate.addProperty("rate", "1");
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(rate));
        rate.addProperty("rate", 3);
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(rate));
        JsonObject language = args("test"); language.addProperty("language", "../../test");
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(language));
        JsonObject unknown = args("test"); unknown.addProperty("code", "shell");
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.parse(unknown));
    }
    @Test public void lateCompletionCannotOverrideCancellation() {
        AtomicInteger calls = new AtomicInteger();
        PendingSpeech pending = new PendingSpeech("owned", result -> {
            calls.incrementAndGet(); assertEquals("Cancelled", result.get("error").getAsString());
        });
        assertFalse(pending.finish("different", null));
        assertTrue(pending.finish("owned", "Cancelled"));
        assertFalse(pending.finish("owned", null));
        assertEquals(1, calls.get());
    }
    @Test public void cancelledOldRequestCannotStopNewUtterance() {
        AtomicInteger stops = new AtomicInteger();
        PendingSpeech active = new PendingSpeech("new-action", result ->
                assertEquals("Speech output cancelled", result.get("error").getAsString()));
        assertFalse(active.cancel("old-action", stops::incrementAndGet));
        assertEquals(0, stops.get());
        assertTrue(active.cancel("new-action", stops::incrementAndGet));
        assertEquals(1, stops.get());
        assertFalse(active.finish("new-action", null));
    }
    @Test public void scopeAcceptsOnlyJournalIdentifiers() {
        JsonObject args = new JsonObject(); args.addProperty("utterance_id", "epoch:run-step");
        assertEquals("epoch:run-step", SpeechRequest.cancellationScope(args));
        args.addProperty("utterance_id", "../bad");
        assertThrows(IllegalArgumentException.class, () -> SpeechRequest.cancellationScope(args));
        assertEquals("", SpeechRequest.cancellationScope(new JsonObject()));
    }
    @Test public void onlyEngineCompletionClaimsOutputCompleted() {
        PendingSpeech pending = new PendingSpeech("owned", result -> {
            assertEquals("output_completed", result.get("speech_state").getAsString());
            assertFalse(result.has("heard"));
        });
        assertTrue(pending.finish("owned", null));
    }
}
