package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;

final class PhoneResultBudget {
    static JsonObject bounded(JsonObject response) {
        if (response.toString().getBytes(StandardCharsets.UTF_8).length <= 1024 * 1024) return response;
        JsonObject failure = new JsonObject(); failure.add("action_id", response.get("action_id"));
        failure.addProperty("status", "failed"); failure.addProperty("error", "Phone result exceeds the 1 MiB transport limit");
        return failure;
    }
}
