package com.antigravity.companion;

import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativeActionArgumentsTest {
    @Test public void parameterlessActionsRejectUnexpectedArguments() {
        for (String action : new String[]{"open_settings", "open_termux_app", "copy_setup_command",
                "is_accessibility_active", "get_connection_status", "run_diagnostics",
                "probe_server", "stop_server", "open_chat", "open_dashboard"}) {
            NativeActionArguments.validate(action, new JsonObject());
            JsonObject args = new JsonObject(); args.addProperty("command", "untrusted command");
            try { NativeActionArguments.validate(action, args); fail(action); }
            catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("does not accept arguments")); }
        }
    }
    @Test public void ExistingArgumentBearingActionsKeepTheirContract() {
        JsonObject args = new JsonObject(); args.addProperty("cwd", "folder with spaces");
        NativeActionArguments.validate("login_cli", args);
    }
}
