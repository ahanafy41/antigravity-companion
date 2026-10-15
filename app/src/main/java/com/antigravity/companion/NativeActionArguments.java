package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.util.List;

final class NativeActionArguments {
    private static final List<String> PARAMETERLESS = java.util.Arrays.asList("open_settings", "open_termux_app", "copy_setup_command",
            "is_accessibility_active", "get_connection_status", "run_diagnostics");

    private NativeActionArguments() { }

    static void validate(String action, JsonObject args) {
        if (PARAMETERLESS.contains(action) && args.size() != 0)
            throw new IllegalArgumentException(action + " does not accept arguments");
    }
}
