package com.antigravity.companion;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.google.gson.JsonObject;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class TermuxBridge {
    public static final String TERMUX_PACKAGE = "com.termux";
    static final String ACTION_TERMUX_RESULT = "com.antigravity.companion.TERMUX_RESULT";
    private static final Handler DEADLINES = new Handler(Looper.getMainLooper());
    private static final AtomicInteger REQUEST_IDS = new AtomicInteger(1000);
    private static final ConcurrentHashMap<String, LaunchRequest> REQUESTS = new ConcurrentHashMap<>();
    public interface LaunchCallback { void onState(JsonObject state); }
    private static final class LaunchRequest {
        final PendingIntent callbackIntent;
        final LaunchCallback callback;
        final Runnable timeout;
        final Context owner;
        LaunchRequest(Context owner, PendingIntent callbackIntent, LaunchCallback callback, Runnable timeout) {
            this.owner = owner; this.callbackIntent = callbackIntent; this.callback = callback; this.timeout = timeout;
        }
    }
    public static void startServer(Context context, LaunchCallback callback) {
        String nonce = UUID.randomUUID().toString();
        try {
            String applicationDataDir = context.getPackageManager()
                    .getApplicationInfo(TERMUX_PACKAGE, 0).dataDir;
            Intent callbackIntent = new Intent(context, TermuxResultReceiver.class)
                    .setAction(ACTION_TERMUX_RESULT).setData(Uri.parse("companion-result://launch/" + nonce));
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(context, REQUEST_IDS.incrementAndGet(), callbackIntent, flags);
            Runnable timeout = () -> finish(nonce, state("outcome_unknown", "Termux result timeout"));
            REQUESTS.put(nonce, new LaunchRequest(context, pending, callback, timeout));
            DEADLINES.postDelayed(timeout, 30000);
            if (!startCommandService(context, launcherIntent(context, applicationDataDir, pending))) {
                throw new IllegalStateException("Termux command service is unavailable");
            }
            callback.onState(state("accepted", ""));
        } catch (PackageManager.NameNotFoundException | SecurityException | IllegalStateException failure) {
            String errorMsg = failure instanceof SecurityException
                    ? "Termux RUN_COMMAND permission denied; enable in App Settings"
                    : "Termux could not accept startup request";
            if (REQUESTS.containsKey(nonce)) finish(nonce, state("failed", errorMsg));
            else callback.onState(state("failed", errorMsg));
        }
    }
    public static void stopServer(Context context, LaunchCallback callback) {
        String nonce = UUID.randomUUID().toString();
        try {
            String applicationDataDir = context.getPackageManager()
                    .getApplicationInfo(TERMUX_PACKAGE, 0).dataDir;
            Intent callbackIntent = new Intent(context, TermuxResultReceiver.class)
                    .setAction(ACTION_TERMUX_RESULT).setData(Uri.parse("companion-result://stop/" + nonce));
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(context, REQUEST_IDS.incrementAndGet(), callbackIntent, flags);
            Runnable timeout = () -> finish(nonce, state("outcome_unknown", "Termux stop result timeout"));
            REQUESTS.put(nonce, new LaunchRequest(context, pending, callback, timeout));
            DEADLINES.postDelayed(timeout, 10000);
            Intent stopIntent = new Intent("com.termux.RUN_COMMAND")
                    .setComponent(new ComponentName(TERMUX_PACKAGE, "com.termux.app.RunCommandService"))
                    .putExtra("com.termux.RUN_COMMAND_PATH", TermuxLaunchContract.executable(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", TermuxLaunchContract.stopArguments(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_WORKDIR", TermuxLaunchContract.workingDirectory(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                    .putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pending);
            if (!startCommandService(context, stopIntent)) {
                throw new IllegalStateException("Termux command service is unavailable");
            }
            if (callback != null) callback.onState(state("accepted", ""));
        } catch (PackageManager.NameNotFoundException | SecurityException | IllegalStateException failure) {
            String errorMsg = failure instanceof SecurityException
                    ? "Termux RUN_COMMAND permission denied; enable in App Settings"
                    : "Termux could not accept stop request";
            if (REQUESTS.containsKey(nonce)) finish(nonce, state("failed", errorMsg));
            else if (callback != null) callback.onState(state("failed", errorMsg));
        }
    }
    public static void syncServer(Context context, LaunchCallback callback) {
        String nonce = UUID.randomUUID().toString();
        try {
            String applicationDataDir = context.getPackageManager()
                    .getApplicationInfo(TERMUX_PACKAGE, 0).dataDir;
            Intent callbackIntent = new Intent(context, TermuxResultReceiver.class)
                    .setAction(ACTION_TERMUX_RESULT).setData(Uri.parse("companion-result://sync/" + nonce));
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(context, REQUEST_IDS.incrementAndGet(), callbackIntent, flags);
            Runnable timeout = () -> finish(nonce, state("outcome_unknown", "Termux sync result timeout"));
            REQUESTS.put(nonce, new LaunchRequest(context, pending, callback, timeout));
            DEADLINES.postDelayed(timeout, 20000);
            Intent syncIntent = new Intent("com.termux.RUN_COMMAND")
                    .setComponent(new ComponentName(TERMUX_PACKAGE, "com.termux.app.RunCommandService"))
                    .putExtra("com.termux.RUN_COMMAND_PATH", TermuxLaunchContract.executable(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", TermuxLaunchContract.syncArguments(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_WORKDIR", TermuxLaunchContract.workingDirectory(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                    .putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pending);
            if (!startCommandService(context, syncIntent)) {
                throw new IllegalStateException("Termux command service is unavailable");
            }
            if (callback != null) callback.onState(state("accepted", ""));
        } catch (PackageManager.NameNotFoundException | SecurityException | IllegalStateException failure) {
            String errorMsg = failure instanceof SecurityException
                    ? "Termux RUN_COMMAND permission denied; enable in App Settings"
                    : "Termux could not accept sync request";
            if (REQUESTS.containsKey(nonce)) finish(nonce, state("failed", errorMsg));
            else if (callback != null) callback.onState(state("failed", errorMsg));
        }
    }
    public static JsonObject startInteractive(Context context, String purpose, String workingDirectory) {
        try {
            String applicationDataDir = context.getPackageManager()
                    .getApplicationInfo(TERMUX_PACKAGE, 0).dataDir;
            Intent command = new Intent("com.termux.RUN_COMMAND")
                    .setComponent(new ComponentName(TERMUX_PACKAGE, "com.termux.app.RunCommandService"))
                    .putExtra("com.termux.RUN_COMMAND_PATH", TermuxLaunchContract.executable(applicationDataDir))
                    .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", TermuxLaunchContract.interactiveArguments(purpose))
                    .putExtra("com.termux.RUN_COMMAND_WORKDIR", TermuxLaunchContract.interactiveWorkingDirectory(applicationDataDir, workingDirectory))
                    .putExtra("com.termux.RUN_COMMAND_BACKGROUND", false);
            if (!startCommandService(context, command)) throw new IllegalStateException("Termux command service unavailable");
            Intent terminal = context.getPackageManager().getLaunchIntentForPackage(TERMUX_PACKAGE);
            if (terminal != null) context.startActivity(terminal.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            JsonObject result = state("accepted", null);
            result.add("authenticated", com.google.gson.JsonNull.INSTANCE);
            result.addProperty("terminal_owned_by_user", true);
            return result;
        } catch (PackageManager.NameNotFoundException unavailable) {
            throw new IllegalStateException("Install Termux and allow RUN_COMMAND", unavailable);
        }
    }

    private static boolean startCommandService(Context context, Intent intent) {
        try {
            return context.startService(intent) != null;
        } catch (SecurityException | IllegalStateException e) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    return context.startForegroundService(intent) != null;
                }
            } catch (Throwable ignored) {}
            return false;
        }
    }

    private static Intent launcherIntent(Context context, String applicationDataDir, PendingIntent pending) {
        JsonObject credentials = new JsonObject();
        credentials.addProperty("android_token", NativeSecrets.androidToken(context));
        return new Intent("com.termux.RUN_COMMAND")
                .setComponent(new ComponentName(TERMUX_PACKAGE, "com.termux.app.RunCommandService"))
                .putExtra("com.termux.RUN_COMMAND_PATH", TermuxLaunchContract.executable(applicationDataDir))
                .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", TermuxLaunchContract.arguments(applicationDataDir))
                .putExtra("com.termux.RUN_COMMAND_WORKDIR", TermuxLaunchContract.workingDirectory(applicationDataDir))
                .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                .putExtra("com.termux.RUN_COMMAND_STDIN", credentials.toString() + "\n")
                .putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pending);
    }
    private static void finish(String nonce, JsonObject outcome) {
        LaunchRequest request = REQUESTS.remove(nonce);
        if (request == null) return;
        DEADLINES.removeCallbacks(request.timeout); request.callbackIntent.cancel();
        request.callback.onState(outcome);
    }
    private static JsonObject state(String status, String error) {
        JsonObject outcome = new JsonObject(); outcome.addProperty("state", status);
        if (error != null && !error.isEmpty()) outcome.addProperty("error", error);
        return outcome;
    }
    static void cancelRequests(Context owner) {
        for (java.util.Map.Entry<String, LaunchRequest> entry : REQUESTS.entrySet()) {
            LaunchRequest request = entry.getValue();
            if (request.owner == owner && REQUESTS.remove(entry.getKey(), request)) {
                DEADLINES.removeCallbacks(request.timeout); request.callbackIntent.cancel();
            }
        }
    }
    private static Integer integerField(Bundle command, String field) {
        Object value = command == null ? null : command.get(field);
        return value instanceof Integer ? (Integer) value : null;
    }
    public static final class TermuxResultReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context context, Intent intent) {
            if (!ACTION_TERMUX_RESULT.equals(intent.getAction()) || intent.getData() == null) return;
            String nonce = intent.getData().getLastPathSegment();
            if (!REQUESTS.containsKey(nonce)) return;
            Bundle command = intent.getBundleExtra("result");
            Integer internalError = integerField(command, "err");
            Integer exitCode = integerField(command, "exitCode");
            Object output = command == null ? null : command.get("stdout");
            finish(nonce, TermuxLaunchContract.result(internalError, exitCode,
                    output instanceof String ? (String) output : null));
        }
    }
}
