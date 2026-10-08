package com.antigravity.companion;

import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class TermuxLaunchContractTest {
    @Test public void bashReceivesLauncherAndStdinFlagInOrder() {
        String dataDir = "/fixture/app";
        assertEquals("/fixture/app/files/usr/bin/bash", TermuxLaunchContract.executable(dataDir));
        assertEquals("/fixture/app/files/home", TermuxLaunchContract.workingDirectory(dataDir));
        assertArrayEquals(new String[]{"/fixture/app/files/home/.antigravity-server/launch_server.sh",
                "--android-token-stdin"}, TermuxLaunchContract.arguments(dataDir));
    }

    @Test public void optionalResultFieldsPreserveFailureAndUncertainty() {
        assertEquals("outcome_unknown", state(null, null));
        assertEquals("outcome_unknown", state(null, 0));
        assertEquals("failed", state(2, null));
        assertEquals("failed", state(2, 0));
        assertEquals("outcome_unknown", state(-1, null));
        assertEquals("finished", state(-1, 0));
        assertEquals("failed", state(-1, 127));
    }

    @Test public void safeSummaryContainsOnlyStateAndPresentNumericCodes() {
        JsonObject failure = TermuxLaunchContract.result(2, null);
        assertEquals(2, failure.size());
        assertEquals(2, failure.get("err").getAsInt());
        assertFalse(failure.has("exit_code"));
        assertEquals("Termux: failed; err=2", TermuxLaunchContract.summary(failure));
        JsonObject success = TermuxLaunchContract.result(-1, 0);
        assertEquals(3, success.size());
        assertEquals("Termux: finished; err=-1; exit_code=0", TermuxLaunchContract.summary(success));
        success.addProperty("stdout", "private input");
        success.addProperty("errmsg", "private input");
        assertFalse(TermuxLaunchContract.summary(success).contains("private input"));
        assertEquals("Termux: outcome_unknown", TermuxLaunchContract.summary(TermuxLaunchContract.result(null, null)));
    }

    @Test public void successfulOutputReportsOnlyValidatedPort() {
        JsonObject result = TermuxLaunchContract.result(-1, 0,
                "private diagnostics\nCOMPANION_SERVER_PORT=8766\r\n");
        assertEquals(8766, result.get("server_port").getAsInt());
        assertFalse(result.toString().contains("private diagnostics"));
        assertEquals(65535, TermuxLaunchContract.result(-1, 0,
                "COMPANION_SERVER_PORT=65535\n").get("server_port").getAsInt());
    }
    @Test public void malformedDuplicateFailedAndOversizedOutputCannotChangePort() {
        for (String output : new String[]{"COMPANION_SERVER_PORT=1023\n",
                "COMPANION_SERVER_PORT=65536\n", "prefix COMPANION_SERVER_PORT=8766\n",
                "COMPANION_SERVER_PORT=8766\nCOMPANION_SERVER_PORT=8767\n",
                "COMPANION_SERVER_PORT=8766oops\n", null}) {
            assertFalse(TermuxLaunchContract.result(-1, 0, output).has("server_port"));
        }
        assertFalse(TermuxLaunchContract.result(2, 0, "COMPANION_SERVER_PORT=8766\n").has("server_port"));
        assertFalse(TermuxLaunchContract.result(-1, 1, "COMPANION_SERVER_PORT=8766\n").has("server_port"));
        StringBuilder large = new StringBuilder("COMPANION_SERVER_PORT=8766\n");
        while (large.length() <= 65536) large.append('x');
        assertFalse(TermuxLaunchContract.result(-1, 0, large.toString()).has("server_port"));
    }

    @Test public void interactiveAuthenticationHasFixedArguments() {
        assertArrayEquals(new String[]{"-l", "-c", "AGY_CLI_DISABLE_AUTO_UPDATE=true exec agy"},
                TermuxLaunchContract.interactiveArguments("account"));
        assertArrayEquals(new String[]{"-l", "-c", "AGY_CLI_DISABLE_AUTO_UPDATE=true exec agy --prompt-interactive /mcp"},
                TermuxLaunchContract.interactiveArguments("mcp"));
        assertThrows(IllegalArgumentException.class,
                () -> TermuxLaunchContract.interactiveArguments("account; rm anything"));
    }

    @Test public void nativeWorkingDirectoryPreservesTrustedAbsolutePath() {
        assertEquals("/work/selected folder", TermuxLaunchContract.interactiveWorkingDirectory("/fixture", "/work/selected folder"));
        assertEquals("/fixture/files/home", TermuxLaunchContract.interactiveWorkingDirectory("/fixture", null));
        assertThrows(IllegalArgumentException.class, () -> TermuxLaunchContract.interactiveWorkingDirectory("/fixture", "relative"));
        assertThrows(IllegalArgumentException.class, () -> TermuxLaunchContract.interactiveWorkingDirectory("/fixture", "/work\nexec anything"));
    }

    private static String state(Integer err, Integer exitCode) {
        return TermuxLaunchContract.result(err, exitCode).get("state").getAsString();
    }
}
