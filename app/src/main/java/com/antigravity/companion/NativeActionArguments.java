package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.util.List;

final class NativeActionArguments {
    private static final List<String> PARAMETERLESS = java.util.Arrays.asList("open_settings", "open_termux_app", "copy_setup_command",
            "get_connection_status", "run_diagnostics",
            "probe_server", "stop_server", "sync_server", "open_chat", "open_dashboard");

    private NativeActionArguments() { }

    static String required(JsonObject args, String key) {
        if (!args.has(key) || !args.get(key).isJsonPrimitive() || !args.get(key).getAsJsonPrimitive().isString())
            throw new IllegalArgumentException("Missing string: " + key);
        String text = args.get(key).getAsString();
        if (text.trim().isEmpty()) throw new IllegalArgumentException("Empty string: " + key);
        return text;
    }

    static void validate(String action, JsonObject args) {
        if (PARAMETERLESS.contains(action) && args.size() != 0)
            throw new IllegalArgumentException(action + " does not accept arguments");
    }
}
