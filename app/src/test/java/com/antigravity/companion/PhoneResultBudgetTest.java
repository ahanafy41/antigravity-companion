package com.antigravity.companion;

import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class PhoneResultBudgetTest {
    @Test public void unicodeWireSizeIsBoundedBeforeRecordingSuccess() {
        JsonObject response = new JsonObject(); response.addProperty("action_id", "screenshot-1");
        response.addProperty("status", "completed"); response.addProperty("result", "x".repeat(600000));
        assertEquals("completed", PhoneResultBudget.bounded(response).get("status").getAsString());
        response.addProperty("result", "ع".repeat(600000));
        JsonObject bounded = PhoneResultBudget.bounded(response);
        assertEquals("failed", bounded.get("status").getAsString());
        assertEquals("screenshot-1", bounded.get("action_id").getAsString());
        assertFalse(bounded.has("result"));
    }
}
