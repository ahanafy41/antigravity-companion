package com.antigravity.companion;

import com.google.gson.JsonObject;

/** Fixed native launch arguments and the non-secret Termux result contract. */
public final class TermuxLaunchContract {
    private TermuxLaunchContract() {}

    public static String executable(String applicationDataDir) {
        return applicationDataDir + "/files/usr/bin/bash";
    }

    public static String workingDirectory(String applicationDataDir) {
        return applicationDataDir + "/files/home";
    }

    public static String[] arguments(String applicationDataDir) {
        return new String[]{workingDirectory(applicationDataDir)
                + "/.antigravity-server/launch_server.sh", "--android-token-stdin"};
    }

    public static JsonObject result(Integer internalError, Integer exitCode) {
        String status = "outcome_unknown";
        if (internalError != null) {
            if (internalError != -1) status = "failed";
            else if (exitCode != null) status = exitCode == 0 ? "finished" : "failed";
        }
        JsonObject result = new JsonObject();
        result.addProperty("state", status);
        if (internalError != null) result.addProperty("err", internalError);
        if (exitCode != null) result.addProperty("exit_code", exitCode);
        return result;
    }

    public static String summary(JsonObject result) {
        String status = result.has("state") ? result.get("state").getAsString() : "outcome_unknown";
        if (!status.equals("accepted") && !status.equals("finished")
                && !status.equals("failed") && !status.equals("outcome_unknown")) {
            status = "outcome_unknown";
        }
        StringBuilder summary = new StringBuilder("Termux: ").append(status);
        for (String field : new String[]{"err", "exit_code"}) {
            if (result.has(field)) summary.append("; ").append(field)
                    .append("=").append(result.get(field).getAsInt());
        }
        return summary.toString();
    }
}
