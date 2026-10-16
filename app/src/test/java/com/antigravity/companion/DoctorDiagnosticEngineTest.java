package com.antigravity.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class DoctorDiagnosticEngineTest {
    @Test public void diagnosesEveryCombinationWithExactlyThreeTruthfulChecks() {
        for (int flags = 0; flags < 8; flags++) {
            boolean[] passed = {(flags & 1) != 0, (flags & 2) != 0, (flags & 4) != 0};
            JsonObject result = DoctorDiagnosticEngine.assembleChecks(passed[0], passed[1], passed[2]);
            JsonArray checks = result.getAsJsonArray("checks");
            assertEquals(3, checks.size());
            String[] names = {"termux_installed", "termux_run_command_permission", "server_connectivity"};
            for (int index = 0; index < names.length; index++) {
                assertEquals(names[index], checks.get(index).getAsJsonObject().get("check").getAsString());
                assertEquals(passed[index], checks.get(index).getAsJsonObject().get("passed").getAsBoolean());
            }
            int issues = 3 - Integer.bitCount(flags);
            assertEquals(issues, result.get("issues_count").getAsInt());
            assertEquals(issues == 0 ? "HEALTHY" : "NEEDS_ATTENTION", result.get("status").getAsString());
        }
    }
}
