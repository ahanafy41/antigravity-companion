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

    private static String state(Integer err, Integer exitCode) {
        return TermuxLaunchContract.result(err, exitCode).get("state").getAsString();
    }
}
