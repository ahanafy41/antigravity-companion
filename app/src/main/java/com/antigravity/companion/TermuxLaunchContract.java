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

    public static String interactiveWorkingDirectory(String applicationDataDir, String requested) {
        if (requested == null) return workingDirectory(applicationDataDir);
        if (!requested.startsWith("/") || requested.length() > 4096)
            throw new IllegalArgumentException("Native CLI directory must be absolute");
        for (int index=0; index<requested.length(); index++)
            if (Character.isISOControl(requested.charAt(index)))
                throw new IllegalArgumentException("Invalid native CLI directory");
        return requested;
    }

    public static String[] interactiveArguments(String purpose) {
        if (purpose.equals("account")) return new String[]{"-l", "-c", "AGY_CLI_DISABLE_AUTO_UPDATE=true exec agy"};
        if (purpose.equals("mcp")) return new String[]{"-l", "-c", "AGY_CLI_DISABLE_AUTO_UPDATE=true exec agy --prompt-interactive /mcp"};
        if (purpose.equals("logout")) return new String[]{"-l", "-c", "AGY_CLI_DISABLE_AUTO_UPDATE=true exec agy --prompt-interactive /logout"};
        throw new IllegalArgumentException("Unsupported native CLI purpose");
    }

    public static JsonObject result(Integer internalError, Integer exitCode) {
        return result(internalError, exitCode, null);
    }

    public static JsonObject result(Integer internalError, Integer exitCode, String stdout) {
        String status = "outcome_unknown";
        if (internalError != null) {
            if (internalError != -1) status = "failed";
            else if (exitCode != null) status = exitCode == 0 ? "finished" : "failed";
        }
        JsonObject result = new JsonObject();
        result.addProperty("state", status);
        if (internalError != null) result.addProperty("err", internalError);
        if (exitCode != null) result.addProperty("exit_code", exitCode);
        if (status.equals("finished") && stdout != null && stdout.length() <= 65536) {
            java.util.regex.Matcher marker = java.util.regex.Pattern.compile(
                    "(?m)^COMPANION_SERVER_PORT=([0-9]{4,5})\\r?$").matcher(stdout);
            if (marker.find()) {
                int port = Integer.parseInt(marker.group(1));
                if (!marker.find() && port >= 1024 && port <= 65535)
                    result.addProperty("server_port", port);
            }
        }
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
