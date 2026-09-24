package com.antigravity.companion;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * TermuxBridge: Manages zero-friction, silent background execution via Termux RUN_COMMAND.
 * Dispatches commands directly to com.termux.app.RunCommandService with PendingIntent callbacks.
 */
public class TermuxBridge {

    private static final Logger LOGGER = Logger.getLogger(TermuxBridge.class.getName());

    public static final String TERMUX_PACKAGE = "com.termux";
    public static final String TERMUX_SERVICE = "com.termux.app.RunCommandService";
    public static final String ACTION_RUN_COMMAND = "com.termux.RUN_COMMAND";

    public static final String EXTRA_COMMAND_PATH = "com.termux.RUN_COMMAND_PATH";
    public static final String EXTRA_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS";
    public static final String EXTRA_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR";
    public static final String EXTRA_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND";
    public static final String EXTRA_SESSION_ACTION = "com.termux.RUN_COMMAND_SESSION_ACTION";
    public static final String EXTRA_PENDING_INTENT = "com.termux.RUN_COMMAND_PENDING_INTENT";

    public static final String ACTION_TERMUX_RESULT = "com.antigravity.companion.TERMUX_RESULT";

    public interface CommandCallback {
        void onResult(int exitCode, String stdout, String stderr);
    }

    private static final ConcurrentHashMap<Integer, CommandCallback> sCallbacks = new ConcurrentHashMap<>();
    private static int sNextRequestId = 1000;

    /**
     * Executes a command in the background inside Termux environment.
     */
    public static synchronized void executeCommand(Context context, String executablePath, String[] arguments,
                                                    String workingDir, CommandCallback callback) {
        if (context == null) return;

        int requestId = ++sNextRequestId;
        if (callback != null) {
            sCallbacks.put(requestId, callback);
        }

        Intent intent = new Intent(ACTION_RUN_COMMAND);
        intent.setComponent(new ComponentName(TERMUX_PACKAGE, TERMUX_SERVICE));
        intent.putExtra(EXTRA_COMMAND_PATH, executablePath);
        if (arguments != null && arguments.length > 0) {
            intent.putExtra(EXTRA_ARGUMENTS, arguments);
        }
        if (workingDir != null && !workingDir.isEmpty()) {
            intent.putExtra(EXTRA_WORKDIR, workingDir);
        }
        intent.putExtra(EXTRA_BACKGROUND, true);
        intent.putExtra(EXTRA_SESSION_ACTION, "0");

        // Prepare mutable PendingIntent to receive results from Termux (API 31+ requires FLAG_MUTABLE)
        Intent resultIntent = new Intent(ACTION_TERMUX_RESULT);
        resultIntent.setPackage(context.getPackageName());
        resultIntent.putExtra("request_id", requestId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestId, resultIntent, flags);
        intent.putExtra(EXTRA_PENDING_INTENT, pendingIntent);

        try {
            context.startService(intent);
            LOGGER.info("Dispatched Termux command: " + executablePath + " (RequestId: " + requestId + ")");
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "startService failed, attempting fallback startForegroundService...", e);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent);
                }
            } catch (Exception e2) {
                LOGGER.log(Level.SEVERE, "Both startService and startForegroundService failed", e2);
            }
            if (callback != null) {
                sCallbacks.remove(requestId);
                callback.onResult(-1, "", "Failed to dispatch intent: " + e.getMessage());
            }
        }
    }

    /**
     * Ensures the local Python server is active. If port 7681 is unreachable,
     * triggers silent background start in Termux.
     */
    public static void ensureServerRunningAsync(final Context context) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean running = isPortOpen("127.0.0.1", 7681, 600);
                if (!running) {
                    LOGGER.info("Local Python server on 7681 not detected. Launching silently via Termux RUN_COMMAND...");
                    String launcherScript = "/data/data/com.termux/files/home/launch_server.sh";

                    executeCommand(context, launcherScript, null, "/data/data/com.termux/files/home", new CommandCallback() {
                        @Override
                        public void onResult(int exitCode, String stdout, String stderr) {
                            LOGGER.info("Silent server launch finished with exit code: " + exitCode);
                        }
                    });
                } else {
                    LOGGER.info("Local Python server on 7681 is already running.");
                }
            }
        }).start();
    }

    public static boolean isPortOpen(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * BroadcastReceiver invoked by Termux when command completes.
     */
    public static class TermuxResultReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_TERMUX_RESULT.equals(intent.getAction())) return;

            int requestId = intent.getIntExtra("request_id", -1);
            int exitCode = intent.getIntExtra("result_code", 0);
            String stdout = intent.getStringExtra("result_stdout");
            String stderr = intent.getStringExtra("result_stderr");

            CommandCallback callback = sCallbacks.remove(requestId);
            if (callback != null) {
                callback.onResult(exitCode, stdout != null ? stdout : "", stderr != null ? stderr : "");
            }
        }
    }
}
